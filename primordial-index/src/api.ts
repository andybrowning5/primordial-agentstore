// HTTP API Worker (index-contract.md §2). Plain Request→Response routing,
// no framework. All D1 queries parameterized; no PII stored.

import type { Env } from './types';
import { detailKey, crawlOne } from './crawler';
import { statsFor } from './lib/signals';
import { rateLimited, clientIp } from './lib/ratelimit';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

function err(status: number, message: string): Response {
  return json({ error: message }, { status });
}

// agent_id = "owner/repo"; both segments are GitHub-name-shaped.
const AGENT_ID_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function validAgentId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 140 && AGENT_ID_RE.test(id);
}

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  // GET /catalog
  if (method === 'GET' && path === '/catalog') {
    return getCatalog(env);
  }

  // GET /agents/:owner/:repo  and  /agents/:owner/:repo/stats
  const agentMatch = /^\/agents\/([^/]+)\/([^/]+)(\/stats)?$/.exec(path);
  if (method === 'GET' && agentMatch) {
    const id = `${decodeURIComponent(agentMatch[1])}/${decodeURIComponent(agentMatch[2])}`;
    if (!validAgentId(id)) return err(400, 'invalid agent id');
    return agentMatch[3] ? getStats(env, id) : getDetail(env, id);
  }

  if (method === 'POST' && path === '/events') {
    return postEvent(req, env);
  }

  if (method === 'POST' && path === '/ratings') {
    return postRating(req, env);
  }

  if (method === 'POST' && path === '/refresh') {
    return postRefresh(req, env);
  }

  return err(404, 'not found');
}

// ── POST /refresh ─────────────────────────────────────────────────────────
// On-demand single-agent re-index (pinged by `primordial publish`). Bounded:
// one repo per call, rate-limited, and only indexes repos carrying a topic.
async function postRefresh(req: Request, env: Env): Promise<Response> {
  const perMin = Number(env.WRITE_RATE_PER_MIN ?? '60') || 60;
  if (await rateLimited(env.RATELIMIT, clientIp(req), 'refresh', perMin)) {
    return err(429, 'rate limit exceeded');
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err(400, 'invalid JSON');
  }

  const agentId = body.agent_id;
  if (!validAgentId(agentId)) return err(400, 'invalid agent_id');

  try {
    const result = await crawlOne(env, agentId);
    if (result.indexed) {
      return json({ ok: true, indexed: true, id: result.id }, { status: 202 });
    }
    return json({ ok: false, indexed: false, reason: result.reason }, { status: 422 });
  } catch (e) {
    return err(502, `refresh failed: ${(e as Error).message}`);
  }
}

// ── GET /catalog ──────────────────────────────────────────────────────────
async function getCatalog(env: Env): Promise<Response> {
  const body = await env.CATALOG.get('catalog.json');
  if (body === null) return err(503, 'catalog not yet generated');
  return new Response(body, {
    headers: { ...JSON_HEADERS, 'Cache-Control': 'max-age=3600' },
  });
}

// ── GET /agents/:owner/:repo ────────────────────────────────────────────────
async function getDetail(env: Env, id: string): Promise<Response> {
  const body = await env.CATALOG.get(detailKey(id));
  if (body === null) return err(404, 'agent not found');
  return new Response(body, {
    headers: { ...JSON_HEADERS, 'Cache-Control': 'max-age=3600' },
  });
}

// ── GET /agents/:owner/:repo/stats ──────────────────────────────────────────
async function getStats(env: Env, id: string): Promise<Response> {
  const windowDays = Number(env.SIGNALS_WINDOW_DAYS ?? '30') || 30;
  const stats = await statsFor(env.DB, id, windowDays);
  return json(stats, { headers: { 'Cache-Control': 'max-age=300' } });
}

// ── POST /events ────────────────────────────────────────────────────────────
async function postEvent(req: Request, env: Env): Promise<Response> {
  const perMin = Number(env.WRITE_RATE_PER_MIN ?? '60') || 60;
  if (await rateLimited(env.RATELIMIT, clientIp(req), 'events', perMin)) {
    return err(429, 'rate limit exceeded');
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err(400, 'invalid JSON');
  }

  const agentId = body.agent_id;
  const event = body.event;
  const clientId = body.client_id;
  const ts = typeof body.ts === 'string' ? body.ts : new Date().toISOString();

  if (!validAgentId(agentId)) return err(400, 'invalid agent_id');
  if (event !== 'run_start' && event !== 'run_complete') {
    return err(400, 'event must be run_start or run_complete');
  }
  if (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > 64) {
    return err(400, 'invalid client_id');
  }
  if (!isIso8601(ts)) return err(400, 'invalid ts');

  // success/duration_ms only meaningful on run_complete.
  let success: number | null = null;
  let durationMs: number | null = null;
  if (event === 'run_complete') {
    if (body.success !== undefined) {
      if (typeof body.success !== 'boolean') return err(400, 'success must be boolean');
      success = body.success ? 1 : 0;
    }
    if (body.duration_ms !== undefined) {
      if (typeof body.duration_ms !== 'number' || !Number.isFinite(body.duration_ms) || body.duration_ms < 0) {
        return err(400, 'invalid duration_ms');
      }
      durationMs = Math.round(body.duration_ms);
    }
  }

  await env.DB.prepare(
    `INSERT INTO events (agent_id, event, success, duration_ms, client_id, ts)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(agentId, event, success, durationMs, clientId, ts)
    .run();

  return json({ ok: true }, { status: 202 });
}

// ── POST /ratings ────────────────────────────────────────────────────────────
async function postRating(req: Request, env: Env): Promise<Response> {
  const perMin = Number(env.WRITE_RATE_PER_MIN ?? '60') || 60;
  if (await rateLimited(env.RATELIMIT, clientIp(req), 'ratings', perMin)) {
    return err(429, 'rate limit exceeded');
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err(400, 'invalid JSON');
  }

  const agentId = body.agent_id;
  const stars = body.stars;
  const ghToken = body.gh_token;
  let comment = body.comment;

  if (!validAgentId(agentId)) return err(400, 'invalid agent_id');
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return err(400, 'stars must be an integer 1..5');
  }
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== 'string') return err(400, 'comment must be a string');
    if (comment.length > 500) return err(400, 'comment must be <=500 chars');
    comment = comment.trim() || null;
  } else {
    comment = null;
  }
  if (typeof ghToken !== 'string' || ghToken.length === 0) {
    return err(401, 'gh_token required');
  }

  // Verify the token against GitHub to resolve the rater's login. We store only
  // the public login (no email / no token).
  const login = await resolveGitHubLogin(ghToken);
  if (!login) return err(401, 'invalid gh_token');

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ratings (agent_id, gh_login, stars, comment, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(agent_id, gh_login)
     DO UPDATE SET stars = excluded.stars, comment = excluded.comment, updated_at = excluded.updated_at`,
  )
    .bind(agentId, login, stars, comment, now)
    .run();

  return json({ ok: true, gh_login: login });
}

/** Resolve a GitHub login from a token; null if the token is invalid. */
async function resolveGitHubLogin(token: string): Promise<string | null> {
  const resp = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'primordial-index',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!resp.ok) return null;
  const user = (await resp.json()) as { login?: string };
  return typeof user.login === 'string' && user.login.length > 0 ? user.login : null;
}

function isIso8601(v: string): boolean {
  if (v.length > 40) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t);
}
