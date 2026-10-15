"""Tarot transport regressions; no credentials, real providers, or production data."""

import copy
import http.client
import io
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import unittest
from email.message import Message
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server' / 'render'))
import tarot_api as api

ORIGIN = 'https://gary81018.github.io'
VISITOR = '2e0cb056-1ddc-4f7a-a0bc-aaafc648590c'
SECRET = 'synthetic-private-key-never-display'
NOW = 1792112400.0
DATA = {
    'cards': [{'id': f'card-{i}', 'name': f'牌{i}', 'keywords': ['练习'],
               'upright': {'meaning': f'正位牌意{i}', 'advice': '正位行动'},
               'reversed': {'meaning': f'逆位牌意{i}', 'advice': '逆位行动'}} for i in range(1, 4)],
    'spreads': [{'id': 'three', 'name': '三张牌', 'description': '时间视角', 'count': 3,
                 'positions': ['过去', '现在', '未来']},
                {'id': 'single', 'name': '单张牌', 'description': '今日视角', 'count': 1, 'positions': ['此刻']}],
    'topics': [{'id': 'career', 'name': '工作学业', 'prompt': '如何学习？'}],
}


def reading():
    return {'id': 'test-reading-123', 'createdAt': '2026-10-16T00:00:00.000Z',
            'spreadId': 'three', 'topicId': 'career', 'question': '我想从设计转做产品，该怎样准备？',
            'cards': [{'cardId': f'card-{i}', 'reversed': i == 2} for i in range(1, 4)]}


def tool_arguments():
    return {'title': '理解你的转型', 'overview': '先从已有资源和具体动机出发。',
            'cardInsights': {f'card-{i}': f'第{i}张牌的具体解读。' for i in range(1, 4)},
            'synthesis': '把好奇心和资源盘点结合。',
            'actions': {'first': '记录当前资源。', 'second': '尝试一个小项目。', 'third': '两周后复盘。'},
            'reflection': '你最想改变什么？', 'closing': '选择仍然在你手中。'}


def provider_response(arguments=None):
    return {'choices': [{'finish_reason': 'tool_calls', 'message': {'tool_calls': [
        {'type': 'function', 'function': {'name': api.TOOL_NAME,
                                        'arguments': json.dumps(arguments or tool_arguments(), ensure_ascii=False)}}]}}]}


def env():
    return {'TAROT_DEEPSEEK_API_KEY': SECRET, 'TAROT_RATE_LIMIT_SALT': 'synthetic-salt-' * 4,
            'TAROT_QUOTA_DB': '/private/synthetic-quota.sqlite3', 'TAROT_ALLOWED_ORIGIN': ORIGIN}


def fixture(**kwargs):
    calls = {'upstream': [], 'quota': []}

    def upstream(payload, api_key, **options):
        calls['upstream'].append((payload, api_key, options))
        return provider_response()

    def quota(*args, **options):
        calls['quota'].append((args, options))
        return {'allowed': True}

    defaults = dict(get_env=env, load_data=lambda: DATA, now=lambda: NOW,
                    upstream=upstream, consume_quota=quota)
    defaults.update(kwargs)
    return api.TarotService(**defaults), calls


def call(service, body=None, *, method='POST', path='/tarot/api/interpret', headers=None, raw=None):
    incoming = {'Origin': ORIGIN, 'Content-Type': 'application/json', 'X-Tarot-Visitor-Id': VISITOR}
    incoming.update(headers or {})
    incoming = {key: value for key, value in incoming.items() if value is not None}
    raw = json.dumps(body if body is not None else {'reading': reading()}, ensure_ascii=False).encode() if raw is None else raw
    return service.handle(method, path, incoming, lambda: raw)


class TarotServiceTests(unittest.TestCase):
    def test_health_readiness_requires_tarot_configuration_and_never_uses_one(self):
        for absent in (None, 'TAROT_DEEPSEEK_API_KEY', 'TAROT_RATE_LIMIT_SALT', 'TAROT_QUOTA_DB'):
            config = env()
            if absent:
                del config[absent]
            config.update(ONE_LLM_API_KEY=SECRET, ONE_LLM_MODEL='must-not-be-used')
            service, calls = fixture(get_env=lambda: config)
            status, payload, headers = call(service, method='GET', path='/tarot/api/health', headers={'Origin': None})
            self.assertEqual(status, 200)
            self.assertEqual(payload, {'ready': absent is None, 'provider': 'DeepSeek', 'model': 'deepseek-flash'})
            self.assertEqual(headers['Cache-Control'], 'no-store')
            self.assertNotIn(SECRET, json.dumps(payload))
            self.assertEqual(calls, {'upstream': [], 'quota': []})

    def test_missing_data_health_false_and_interpret_503(self):
        def missing():
            raise FileNotFoundError(SECRET)
        service, calls = fixture(load_data=missing)
        self.assertFalse(call(service, method='GET', path='/tarot/api/health')[1]['ready'])
        self.assertEqual(call(service)[0], 503)
        self.assertEqual(calls['upstream'], [])

    def test_request_uses_canonical_data_and_strict_schema_and_preserves_output_contract(self):
        service, calls = fixture()
        status, result, headers = call(service)
        self.assertEqual(status, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], ORIGIN)
        request, secret, options = calls['upstream'][0]
        self.assertEqual(secret, SECRET)
        context = json.loads(request['messages'][1]['content'])
        self.assertEqual(context['question'], reading()['question'])
        self.assertEqual(context['cards'][1]['meaning'], '逆位牌意2')
        self.assertEqual(context['cards'][1]['position'], '现在')
        self.assertEqual(request['thinking'], {'type': 'disabled'})
        self.assertEqual(request['max_tokens'], 2600)
        self.assertIs(request['stream'], False)
        self.assertEqual(request['tool_choice']['function']['name'], api.TOOL_NAME)
        self.assertTrue(request['tools'][0]['function']['strict'])
        schema = request['tools'][0]['function']['parameters']
        for value in [schema, schema['properties']['cardInsights'], schema['properties']['actions']]:
            self.assertFalse(value['additionalProperties'])
            self.assertEqual(value['required'], list(value['properties']))
        self.assertEqual([x['cardId'] for x in result['analysis']['cardInsights']], ['card-1', 'card-2', 'card-3'])
        self.assertEqual(result['analysis']['actions'], list(tool_arguments()['actions'].values()))
        self.assertRegex(result['generatedAt'], r'\.\d{3}Z$')
        self.assertEqual(len(calls['quota']), 1)
        self.assertEqual(calls['quota'][0][0][2], VISITOR)

    def test_empty_question_uses_server_topic_prompt(self):
        service, calls = fixture()
        item = reading()
        item['question'] = ' \n '
        self.assertEqual(call(service, {'reading': item})[0], 200)
        self.assertEqual(json.loads(calls['upstream'][0][0]['messages'][1]['content'])['question'], '如何学习？')

    def test_cors_exact_origin_and_preflight_no_quota(self):
        service, calls = fixture()
        for origin in (None, 'null', '*', ORIGIN + '.evil.example', ORIGIN + '/'):
            status, body, headers = call(service, headers={'Origin': origin})
            self.assertEqual(status, 403)
            self.assertNotIn('Access-Control-Allow-Origin', headers)
        status, body, headers = call(service, method='OPTIONS', headers={
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,x-tarot-visitor-id'})
        self.assertEqual(status, 204)
        self.assertIsNone(body)
        self.assertIn('X-Tarot-Visitor-Id', headers['Access-Control-Allow-Headers'])
        self.assertEqual(call(service, method='OPTIONS', headers={'Access-Control-Request-Method': 'DELETE'})[0], 405)
        self.assertEqual(call(service, method='OPTIONS', headers={'Access-Control-Request-Headers': 'authorization'})[0], 403)
        self.assertEqual(calls, {'upstream': [], 'quota': []})

    def test_uuid_required_and_normalized(self):
        service, calls = fixture()
        for value in (None, '', 'visitor', 'x' * 500, '00000000-0000-0000-0000-000000000000'):
            result = call(service, headers={'X-Tarot-Visitor-Id': value})
            self.assertEqual(result[0], 400)
            self.assertEqual(result[1]['error']['code'], 'INVALID_VISITOR')
        self.assertEqual(calls['quota'], [])
        self.assertEqual(call(service, headers={'X-Tarot-Visitor-Id': VISITOR.upper()})[0], 200)
        self.assertEqual(calls['quota'][0][0][2], VISITOR)

    def test_input_validation_prevents_paid_calls(self):
        cases = []
        for key, value in [('id', 'bad'), ('question', '问' * 201), ('question', '😀' * 101),
                           ('createdAt', '2026-10-16'), ('createdAt', '1999-12-31T00:00:00.000Z'),
                           ('createdAt', '2099-01-01T00:00:00.000Z'), ('spreadId', 'made-up'),
                           ('topicId', 'made-up'), ('cards', [])]:
            item = reading()
            item[key] = value
            cases.append({'reading': item})
        for change in ('unknown', 'duplicate', 'numeric_reverse', 'extra_card_field', 'extra_reading_field'):
            item = reading()
            if change == 'unknown': item['cards'][0]['cardId'] = 'invented'
            if change == 'duplicate': item['cards'][1]['cardId'] = item['cards'][0]['cardId']
            if change == 'numeric_reverse': item['cards'][0]['reversed'] = 1
            if change == 'extra_card_field': item['cards'][0]['meaning'] = 'malicious'
            if change == 'extra_reading_field': item['system_prompt'] = 'malicious'
            cases.append({'reading': item})
        cases.extend([{}, {'reading': reading(), 'key': SECRET}, {'reading': []}])
        for body in cases:
            with self.subTest(body=body):
                service, calls = fixture()
                self.assertEqual(call(service, body)[0], 400)
                self.assertEqual(calls, {'upstream': [], 'quota': []})

    def test_invalid_wire_input_rejected_without_upstream(self):
        service, calls = fixture()
        for raw, expected in [(b'{broken', 400), (b'\xff', 400), (b'NaN', 400), (b'x' * 8193, 413)]:
            self.assertEqual(call(service, raw=raw)[0], expected)
        self.assertEqual(call(service, headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(call(service, method='GET')[0], 405)
        self.assertEqual(calls, {'upstream': [], 'quota': []})

    def test_quota_rejection_and_database_error_fail_closed(self):
        def broken(*args, **kwargs):
            raise OSError(SECRET)
        for quota, expected in [(lambda *a, **k: {'allowed': False, 'retryAfter': 42}, 429), (broken, 503)]:
            service, calls = fixture(consume_quota=quota)
            status, body, headers = call(service)
            self.assertEqual(status, expected)
            self.assertEqual(calls['upstream'], [])
            self.assertNotIn(SECRET, json.dumps(body))
            if status == 429:
                self.assertEqual(headers['Retry-After'], '42')

    def test_upstream_errors_are_sanitized_not_retried_and_release_slots(self):
        for error, expected, code in [(api.UpstreamStatusError(429), 429, 'RATE_LIMITED'),
                                      (api.UpstreamStatusError(401), 503, 'AI_UNAVAILABLE'),
                                      (api.UpstreamStatusError(500), 502, 'AI_UNAVAILABLE'),
                                      (TimeoutError(SECRET), 504, 'AI_TIMEOUT'),
                                      (OSError(SECRET), 502, 'AI_UNAVAILABLE'),
                                      (api.UpstreamBodyError(SECRET), 502, 'INVALID_AI_RESPONSE')]:
            with self.subTest(error=type(error).__name__):
                attempts = []
                def upstream(*args, **kwargs):
                    attempts.append(1)
                    raise error
                service, calls = fixture(upstream=upstream)
                status, body, headers = call(service)
                self.assertEqual((status, body['error']['code']), (expected, code))
                self.assertEqual(len(attempts), 1)
                self.assertNotIn(SECRET, json.dumps(body))
                self.assertTrue(service.slots.acquire(blocking=False))
                self.assertTrue(service.slots.acquire(blocking=False))
                self.assertFalse(service.slots.acquire(blocking=False))

    def test_generated_structure_never_accepts_unknown_or_reordered_cards(self):
        malformed = []
        for key, value in [('title', ''), ('overview', 'x' * 2401), ('synthesis', 'bad\x01'),
                           ('cardInsights', {'invented': '解读'}), ('actions', ['one', 'two', 'three'])]:
            arguments = tool_arguments()
            arguments[key] = value
            malformed.append(provider_response(arguments))
        item = provider_response()
        item['choices'][0]['finish_reason'] = 'length'
        malformed.append(item)
        item = provider_response()
        item['choices'][0]['message']['tool_calls'].append(copy.deepcopy(item['choices'][0]['message']['tool_calls'][0]))
        malformed.append(item)
        item = provider_response()
        item['choices'][0]['message']['tool_calls'][0]['function']['name'] = 'run_shell'
        malformed.append(item)
        for item in malformed:
            service, calls = fixture(upstream=lambda *a, **k: item)
            result = call(service)
            self.assertEqual(result[0], 502)
            self.assertEqual(result[1]['error']['code'], 'INVALID_AI_RESPONSE')
        arguments = tool_arguments()
        arguments['cardInsights'] = dict(reversed(list(arguments['cardInsights'].items())))
        service, calls = fixture(upstream=lambda *a, **k: provider_response(arguments))
        result = call(service)
        self.assertEqual([x['cardId'] for x in result[1]['analysis']['cardInsights']], ['card-1', 'card-2', 'card-3'])

    def test_only_two_inflight_calls_and_busy_does_not_consume_quota(self):
        entered = threading.Barrier(3)
        release = threading.Event()
        def upstream(*args, **kwargs):
            entered.wait(timeout=2)
            self.assertTrue(release.wait(2))
            return provider_response()
        service, calls = fixture(upstream=upstream)
        results = []
        threads = [threading.Thread(target=lambda: results.append(call(service))) for _ in range(2)]
        for worker in threads: worker.start()
        entered.wait(timeout=2)
        try:
            status, body, headers = call(service)
            self.assertEqual((status, body['error']['code']), (503, 'AI_BUSY'))
            self.assertEqual(len(calls['quota']), 2)
            self.assertTrue(call(service, method='GET', path='/tarot/api/health')[1]['ready'])
        finally:
            release.set()
            for worker in threads: worker.join(timeout=3)
        self.assertEqual([result[0] for result in results], [200, 200])


class FakeHTTPHandler:
    def __init__(self, path, method='POST', body=None):
        self.path, self.command = path, method
        raw = json.dumps(body or {'reading': reading()}).encode()
        self.headers = Message()
        for key, value in {'Origin': ORIGIN, 'Content-Type': 'application/json',
                           'X-Tarot-Visitor-Id': VISITOR, 'Content-Length': str(len(raw))}.items():
            self.headers[key] = value
        self.rfile, self.wfile = io.BytesIO(raw), io.BytesIO()
        self.sent = []
        self.connection = None

    def send_response(self, status): self.status = status
    def send_header(self, key, value): self.sent.append((key, value))
    def end_headers(self): pass


class HTTPDispatchTests(unittest.TestCase):
    def test_unrelated_routes_are_untouched_and_matched_paths_always_handled(self):
        service, calls = fixture()
        for path in ('/api/health', '/api/sessions', '/', '/tarot/api/interpret/evil', '/tarot/api/health/'):
            handler = FakeHTTPHandler(path)
            self.assertFalse(api.handle_tarot_http(handler, service))
            self.assertFalse(hasattr(handler, 'status'))
            self.assertEqual(handler.rfile.tell(), 0)
        for method in ('POST', 'GET', 'OPTIONS', 'DELETE'):
            handler = FakeHTTPHandler('/tarot/api/interpret', method)
            self.assertTrue(api.handle_tarot_http(handler, service))
            self.assertTrue(hasattr(handler, 'status'))

    def test_oversized_duplicate_length_and_transfer_encoding_refused(self):
        for kind in ('oversized', 'duplicate', 'chunked', 'truncated'):
            service, calls = fixture()
            handler = FakeHTTPHandler('/tarot/api/interpret')
            if kind == 'oversized': handler.headers.replace_header('Content-Length', '8193')
            if kind == 'duplicate': handler.headers['Content-Length'] = '10'
            if kind == 'chunked': handler.headers['Transfer-Encoding'] = 'chunked'
            if kind == 'truncated': handler.rfile = io.BytesIO(b'x')
            self.assertTrue(api.handle_tarot_http(handler, service))
            self.assertEqual(handler.status, 413 if kind == 'oversized' else 400)
            self.assertEqual(calls['upstream'], [])

    def test_real_sqlite_integration_persists_quota(self):
        from tarot_quota import consume_quota
        with tempfile.TemporaryDirectory() as temporary:
            config = env()
            config['TAROT_QUOTA_DB'] = str(Path(temporary) / 'tarot' / 'quota.sqlite3')
            service, calls = fixture(get_env=lambda: config, consume_quota=consume_quota)
            for _ in range(3): self.assertEqual(call(service)[0], 200)
            restarted, other_calls = fixture(get_env=lambda: config, consume_quota=consume_quota)
            self.assertEqual(call(restarted)[0], 429)
            self.assertEqual(other_calls['upstream'], [])


class UpstreamTransportTests(unittest.TestCase):
    def run_server(self, behavior):
        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            def do_POST(self):
                self.rfile.read(int(self.headers.get('Content-Length', '0')))
                try: behavior(self)
                except (BrokenPipeError, ConnectionResetError, OSError): pass
            def log_message(self, *args): pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.daemon_threads = True
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        def cleanup():
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)
        self.addCleanup(cleanup)
        def factory(host, timeout):
            self.assertEqual(host, 'api.deepseek.com')
            return http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=timeout)
        return factory

    def test_bounded_response_and_fixed_path_without_redirect_following(self):
        received = []
        def valid(handler):
            received.append((handler.path, handler.headers['Authorization']))
            raw = json.dumps(provider_response()).encode()
            handler.send_response(200)
            handler.send_header('Content-Length', str(len(raw)))
            handler.end_headers()
            handler.wfile.write(raw)
        factory = self.run_server(valid)
        result = api.request_upstream({'synthetic': True}, SECRET, deadline=time.monotonic() + 2, connection_factory=factory)
        self.assertEqual(result, provider_response())
        self.assertEqual(received, [('/beta/chat/completions', 'Bearer ' + SECRET)])
        def redirect(handler):
            handler.send_response(302)
            handler.send_header('Location', 'https://invalid.example/never-send-credentials')
            handler.send_header('Content-Length', '0')
            handler.end_headers()
        factory = self.run_server(redirect)
        with self.assertRaises(api.UpstreamStatusError) as caught:
            api.request_upstream({}, SECRET, deadline=time.monotonic() + 2, connection_factory=factory)
        self.assertEqual(caught.exception.status, 302)

    def test_overlarge_response_and_invalid_utf8_are_rejected(self):
        for raw in (b'x' * (api.OUTPUT_LIMIT + 1), b'\xff'):
            def response(handler, raw=raw):
                handler.send_response(200)
                handler.send_header('Content-Length', str(len(raw)))
                handler.end_headers()
                handler.wfile.write(raw)
            factory = self.run_server(response)
            with self.assertRaises(api.UpstreamBodyError):
                api.request_upstream({}, SECRET, deadline=time.monotonic() + 2, connection_factory=factory)

    def test_total_deadline_closes_slow_drip_headers_and_joins_watchdog(self):
        def slow(handler):
            handler.wfile.write(b'HTTP/1.1 200 OK\r\nX-Slow: ')
            handler.wfile.flush()
            for _ in range(30):
                time.sleep(.025)
                handler.wfile.write(b'x')
                handler.wfile.flush()
        factory = self.run_server(slow)
        before = {t.ident for t in threading.enumerate() if isinstance(t, threading.Timer)}
        started = time.monotonic()
        with self.assertRaises(TimeoutError):
            api.request_upstream({}, SECRET, deadline=started + .15, connection_factory=factory)
        self.assertLess(time.monotonic() - started, .5)
        after = {t.ident for t in threading.enumerate() if isinstance(t, threading.Timer)}
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main()
