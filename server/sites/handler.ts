import { env } from 'cloudflare:workers';
import { createInterpretHandler } from '../server/interpret.js';

async function reserve(bucket: string, maximum: number, expires: number) {
  const result = await env.DB!.prepare(
    'INSERT INTO ai_quota (bucket,used,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used'
  ).bind(bucket, expires, maximum).first();
  return Boolean(result);
}
async function consumeQuota(request: Request) {
  const now = Math.floor(Date.now() / 1000);
  const day = Math.floor((now + 28800) / 86400);
  const nextDay = (day + 1) * 86400 - 28800;
  const minute = Math.floor(now / 60);
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RATE_LIMIT_SALT), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const signature = await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(`${day}:${ip}`));
  const visitor = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2,'0')).join('');
  await env.DB!.prepare('DELETE FROM ai_quota WHERE expires_at < ?').bind(now).run();
  if (!await reserve(`minute:${minute}:${visitor}`, 3, (minute+1)*60)) return {allowed:false,retryAfter:60};
  if (!await reserve(`visitor:${day}:${visitor}`, 20, nextDay)) return {allowed:false,retryAfter:nextDay-now};
  const configured = Number(env.DAILY_REQUEST_LIMIT || 100);
  const dailyLimit = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 1000) : 100;
  if (!await reserve(`global:${day}`, dailyLimit, nextDay)) return {allowed:false,retryAfter:nextDay-now};
  return {allowed:true};
}
export function handleRequest(request: Request) {
  return createInterpretHandler({getEnv: () => env, onDiagnostic: (event: unknown) => console.error('AI_RESPONSE_DIAGNOSTIC', JSON.stringify(event)), consumeQuota: env.DB && env.RATE_LIMIT_SALT ? consumeQuota : undefined})(request);
}
