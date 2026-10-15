import concurrent.futures
import importlib.util
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "server" / "render" / "tarot_quota.py"


def load_quota():
    spec = importlib.util.spec_from_file_location("tarot_quota_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.consume_quota


consume_quota = load_quota()
SALT = "test-only-private-salt-0123456789abcdef"
VISITOR = "34addb8a-7acf-4b25-b602-73d38813d4f6"
# 2026-10-16 23:00:00 in UTC+8; exact minute boundary.
NOW = 1792162800
TABLE = "stellar_tarot_quota"


class TarotQuotaTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "private" / "quota" / "tarot.sqlite3"

    def use(self, visitor=VISITOR, **kwargs):
        return consume_quota(self.path, SALT, visitor, now=kwargs.pop("now", NOW), **kwargs)

    def rows(self):
        with sqlite3.connect(self.path) as db:
            return db.execute(f"SELECT bucket, used, expires_at FROM {TABLE} ORDER BY bucket").fetchall()

    def global_count(self):
        return sum(used for bucket, used, _ in self.rows() if bucket.startswith("global:"))

    def test_minute_limit_rejects_without_increasing_any_bucket(self):
        for _ in range(3):
            self.assertEqual(self.use(), {"allowed": True})
        before = self.rows()
        self.assertEqual(self.use(now=NOW + 17.9), {"allowed": False, "retryAfter": 43})
        self.assertEqual(self.rows(), before)
        self.assertEqual(self.use(now=NOW + 60), {"allowed": True})
        self.assertEqual(self.global_count(), 4)

    def test_visitor_daily_limit_is_atomic_with_fresh_minute_bucket(self):
        for index in range(20):
            self.assertTrue(self.use(now=NOW + index * 60)["allowed"])
        result = self.use(now=NOW + 20 * 60)
        self.assertFalse(result["allowed"])
        self.assertEqual(result["retryAfter"], 40 * 60)
        self.assertEqual(self.global_count(), 20)
        self.assertFalse(any(bucket.startswith("minute:") for bucket, _, _ in self.rows()))

    def test_concurrent_requests_cannot_exceed_minute_limit(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(lambda _: self.use(), range(48)))
        self.assertEqual(sum(result["allowed"] for result in results), 3)
        self.assertEqual(self.global_count(), 3)
        self.assertTrue(all(used == 3 for _, used, _ in self.rows()))

    def test_concurrent_browsers_share_hard_global_daily_limit(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
            results = list(pool.map(lambda index: self.use(f"test-browser-{index}"), range(140)))
        self.assertEqual(sum(result["allowed"] for result in results), 100)
        self.assertEqual(self.global_count(), 100)
        # Rejected browsers leave no visitor or minute rows behind.
        self.assertEqual(len(self.rows()), 201)

    def test_new_module_and_connections_retain_reserved_quota(self):
        for _ in range(3):
            self.use()
        restarted = load_quota()
        self.assertFalse(restarted(self.path, SALT, VISITOR, now=NOW)["allowed"])
        self.assertEqual(self.global_count(), 3)

    def test_utc8_midnight_resets_daily_buckets_and_anonymized_visitor(self):
        for index in range(20):
            self.use(now=NOW + index * 60)
        old_visitor = next(bucket for bucket, _, _ in self.rows() if bucket.startswith("visitor:"))
        self.assertTrue(self.use(now=NOW + 3600)["allowed"])
        current = self.rows()
        self.assertEqual(len(current), 3)
        self.assertEqual(self.global_count(), 1)
        self.assertNotIn(old_visitor, [bucket for bucket, _, _ in current])
        self.assertTrue(all(expires > NOW + 3600 for _, _, expires in current))

    def test_global_override_and_maximum_are_enforced(self):
        self.assertTrue(self.use("first", daily_limit=2)["allowed"])
        self.assertTrue(self.use("second", daily_limit=2)["allowed"])
        self.assertFalse(self.use("third", daily_limit=2)["allowed"])
        self.assertEqual(self.global_count(), 2)
        with sqlite3.connect(self.path) as db:
            db.execute(f"UPDATE {TABLE} SET used = 1000 WHERE bucket LIKE 'global:%'")
        self.assertFalse(self.use("fourth", daily_limit=10000)["allowed"])
        self.assertEqual(self.global_count(), 1000)

    def test_invalid_configuration_does_not_create_database(self):
        for salt in (None, "", " " * 40, "short"):
            with self.subTest(salt=salt), self.assertRaises(ValueError):
                consume_quota(self.path, salt, VISITOR, now=NOW)
        for path in (None, "", "  ", ":memory:"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                consume_quota(path, SALT, VISITOR, now=NOW)
        for limit in (0, -1, True, "100", 1.5):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                self.use(daily_limit=limit)
        for instant in (True, -1, float("nan"), float("inf"), "now"):
            with self.subTest(instant=instant), self.assertRaises(ValueError):
                self.use(now=instant)
        self.assertFalse(self.path.exists())

    def test_database_and_directory_failures_raise_without_fallback(self):
        blocker = Path(self.directory.name) / "file-not-directory"
        blocker.write_text("not a directory")
        with self.assertRaises((OSError, ValueError)):
            consume_quota(blocker / "quota.sqlite3", SALT, VISITOR, now=NOW)
        self.path.parent.mkdir(parents=True)
        self.path.write_bytes(b"not a valid SQLite database")
        with self.assertRaises(sqlite3.DatabaseError):
            self.use()
        self.assertEqual(self.path.read_bytes(), b"not a valid SQLite database")

    def test_transaction_failure_rolls_back_all_bucket_updates(self):
        self.use("initial")
        before = self.rows()
        with sqlite3.connect(self.path) as db:
            db.execute(f"""CREATE TRIGGER reject_new_visitor BEFORE INSERT ON {TABLE}
                WHEN NEW.bucket LIKE 'visitor:%'
                BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END""")
        with self.assertRaises(sqlite3.DatabaseError):
            self.use("failing-request")
        self.assertEqual(self.rows(), before)

    def test_storage_has_only_anonymous_counts_and_private_file_modes(self):
        self.use()
        with sqlite3.connect(self.path) as db:
            columns = [row[1] for row in db.execute(f"PRAGMA table_info({TABLE})")]
            dump = "\n".join(db.iterdump())
        self.assertEqual(columns, ["bucket", "used", "expires_at"])
        self.assertNotIn(VISITOR, dump)
        self.assertNotIn(SALT, dump)
        for bucket, _, _ in self.rows():
            if not bucket.startswith("global:"):
                self.assertRegex(bucket.split(":")[-1], r"^[0-9a-f]{64}$")
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.path.parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.path.parent.parent.stat().st_mode), 0o700)


if __name__ == "__main__":
    unittest.main()
