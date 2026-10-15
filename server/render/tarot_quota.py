"""Persistent, best-effort browser quotas and a hard shared daily AI quota.

The visitor UUID is supplied by the browser and is not an authenticated identity.
The API validates its format before calling this module. Model requests consume
quota before calling the provider, including requests whose provider call fails.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import os
from pathlib import Path
import sqlite3
import time


_UTC8_OFFSET = 8 * 60 * 60
_TABLE = "stellar_tarot_quota"


def _private_database_path(db_path: str | os.PathLike[str]) -> Path:
    if not isinstance(db_path, (str, os.PathLike)):
        raise ValueError("A persistent quota database path is required.")
    raw_path = os.fspath(db_path)
    if not isinstance(raw_path, str) or not raw_path.strip() or raw_path == ":memory:":
        raise ValueError("A persistent quota database path is required.")
    path = Path(raw_path)
    if path.is_symlink():
        raise ValueError("The quota database must not be a symbolic link.")

    # pathlib.mkdir(parents=True) does not apply mode to intermediate parents.
    # Restrict each new directory; leave existing deployment directories alone.
    missing = []
    parent = path.parent
    while not parent.exists():
        missing.append(parent)
        parent = parent.parent
    for directory in reversed(missing):
        directory.mkdir(mode=0o700, exist_ok=True)

    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        if not path.is_file() or path.is_symlink():
            raise ValueError("The quota database path must be a regular file.") from None
    else:
        os.close(descriptor)
    return path


def consume_quota(
    db_path: str | os.PathLike[str],
    salt: str,
    visitor_id: str,
    *,
    now: float | None = None,
    daily_limit: int = 100,
) -> dict[str, bool | int]:
    """Atomically reserve all quotas or return a rejection without any increments.

    ``now`` is Unix time in seconds. Exceptions are intentionally propagated so
    the API can fail closed; there is no in-memory or unlimited fallback.
    """
    if not isinstance(salt, str) or len(salt.strip()) < 32:
        raise ValueError("A random quota salt of at least 32 characters is required.")
    if not isinstance(visitor_id, str) or not visitor_id.strip():
        raise ValueError("A visitor identifier is required.")
    if isinstance(daily_limit, bool) or not isinstance(daily_limit, int) or daily_limit < 1:
        raise ValueError("The daily quota must be a positive integer.")
    daily_limit = min(daily_limit, 1000)
    instant = time.time() if now is None else now
    if isinstance(instant, bool) or not isinstance(instant, (float, int)) or not math.isfinite(instant) or instant < 0:
        raise ValueError("The quota timestamp must be finite Unix seconds.")
    timestamp = math.floor(instant)
    day = (timestamp + _UTC8_OFFSET) // 86400
    next_day = (day + 1) * 86400 - _UTC8_OFFSET
    minute = timestamp // 60
    next_minute = (minute + 1) * 60
    visitor = hmac.new(
        salt.encode("utf-8"), f"{day}:{visitor_id}".encode("utf-8"), hashlib.sha256,
    ).hexdigest()
    buckets = (
        (f"minute:{minute}:{visitor}", 3, next_minute),
        (f"visitor:{day}:{visitor}", 20, next_day),
        (f"global:{day}", daily_limit, next_day),
    )
    path = _private_database_path(db_path)
    # Each invocation owns its connection, including concurrent request threads.
    # A short exclusive writer transaction works on SQLite's regular journal;
    # no platform-specific service or WAL maintenance is required.
    connection = sqlite3.connect(path, timeout=15, isolation_level=None)
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(f"""CREATE TABLE IF NOT EXISTS {_TABLE} (
            bucket TEXT PRIMARY KEY NOT NULL,
            used INTEGER NOT NULL CHECK (used >= 0),
            expires_at INTEGER NOT NULL
        )""")
        connection.execute(f"CREATE INDEX IF NOT EXISTS stellar_tarot_quota_expiry ON {_TABLE} (expires_at)")
        connection.execute(f"DELETE FROM {_TABLE} WHERE expires_at <= ?", (timestamp,))
        current = dict(connection.execute(
            f"SELECT bucket, used FROM {_TABLE} WHERE bucket IN (?, ?, ?)",
            tuple(bucket for bucket, _, _ in buckets),
        ).fetchall())
        blocked_until = [expires for bucket, limit, expires in buckets if current.get(bucket, 0) >= limit]
        if blocked_until:
            # Commit only expiry cleanup; no bucket has been incremented.
            connection.commit()
            return {"allowed": False, "retryAfter": max(blocked_until) - timestamp}

        for bucket, _, expires in buckets:
            connection.execute(
                f"""INSERT INTO {_TABLE} (bucket, used, expires_at) VALUES (?, 1, ?)
                    ON CONFLICT(bucket) DO UPDATE SET used = used + 1""",
                (bucket, expires),
            )
        connection.commit()
        return {"allowed": True}
    except BaseException:
        if connection.in_transaction:
            connection.rollback()
        raise
    finally:
        connection.close()
