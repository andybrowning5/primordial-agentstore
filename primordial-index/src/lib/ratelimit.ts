// Fixed-window per-IP rate limiter backed by KV. Coarse by design — KV is
// eventually consistent, which is fine for abuse mitigation (not billing).

export async function rateLimited(
  kv: KVNamespace,
  ip: string,
  scope: string,
  perMin: number,
): Promise<boolean> {
  const windowKey = Math.floor(Date.now() / 60000); // minute bucket
  const key = `rl:${scope}:${ip}:${windowKey}`;
  const current = Number((await kv.get(key)) ?? '0');
  if (current >= perMin) return true;
  // TTL 120s covers the active minute plus clock skew.
  await kv.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown'
  );
}
