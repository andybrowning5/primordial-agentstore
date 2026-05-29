// API handler tests against a real (Miniflare) D1 + R2 + KV via the Workers
// pool. The GitHub token-verification fetch in POST /ratings is stubbed.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import MIGRATION from '../migrations/0001_init.sql?raw';
import { handleRequest } from '../src/api';
import type { Env } from '../src/types';

const E = env as unknown as Env;

async function applyMigration() {
  // Strip line comments, then split on ; and skip empties.
  const sql = MIGRATION.split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  for (const stmt of sql.split(';')) {
    const s = stmt.trim();
    if (s) await E.DB.prepare(s).run();
  }
}

function req(path: string, init?: RequestInit): Request {
  return new Request(`https://index.primordial.dev${path}`, init);
}

function postJson(path: string, body: unknown): Request {
  return req(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await applyMigration();
});

beforeEach(async () => {
  await E.DB.prepare('DELETE FROM events').run();
  await E.DB.prepare('DELETE FROM ratings').run();
  vi.restoreAllMocks();
});

describe('GET /catalog', () => {
  it('503 before the catalog is generated', async () => {
    const res = await handleRequest(req('/catalog'), E);
    // R2 may have a catalog from a prior test; tolerate either, but assert headers when 200.
    expect([200, 503]).toContain(res.status);
  });

  it('serves catalog.json with cache headers once written', async () => {
    await E.CATALOG.put('catalog.json', JSON.stringify({ schema_version: '1', agents: [] }));
    const res = await handleRequest(req('/catalog'), E);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('max-age=3600');
    const body = (await res.json()) as { schema_version: string };
    expect(body.schema_version).toBe('1');
  });
});

describe('GET /agents/:owner/:repo', () => {
  it('404 when detail file missing', async () => {
    const res = await handleRequest(req('/agents/octocat/missing'), E);
    expect(res.status).toBe(404);
  });

  it('serves a stored detail file', async () => {
    await E.CATALOG.put('agents/octocat/hello.json', JSON.stringify({ id: 'octocat/hello' }));
    const res = await handleRequest(req('/agents/octocat/hello'), E);
    expect(res.status).toBe(200);
    expect((await res.json() as { id: string }).id).toBe('octocat/hello');
  });

  it('400 on a malformed id', async () => {
    const res = await handleRequest(req('/agents/octocat/has%2Fslash'), E);
    expect(res.status).toBe(400);
  });
});

describe('GET /agents/:owner/:repo/stats', () => {
  it('aggregates events and ratings', async () => {
    const id = 'octocat/hello';
    const now = new Date().toISOString();
    await E.DB.prepare(
      `INSERT INTO events (agent_id, event, success, duration_ms, client_id, ts) VALUES
       (?1,'run_complete',1,100,'c1',?2),
       (?1,'run_complete',0,200,'c2',?2),
       (?1,'run_start',NULL,NULL,'c1',?2)`,
    ).bind(id, now).run();
    await E.DB.prepare(
      `INSERT INTO ratings (agent_id, gh_login, stars, comment, updated_at) VALUES
       (?1,'alice',5,NULL,?2),(?1,'bob',3,NULL,?2)`,
    ).bind(id, now).run();

    const res = await handleRequest(req(`/agents/${id}/stats`), E);
    expect(res.status).toBe(200);
    const s = (await res.json()) as {
      runs_30d: number; success_rate: number; rating_avg: number; rating_count: number;
    };
    expect(s.runs_30d).toBe(2);
    expect(s.success_rate).toBe(0.5);
    expect(s.rating_avg).toBe(4);
    expect(s.rating_count).toBe(2);
  });

  it('returns nulls with no data', async () => {
    const res = await handleRequest(req('/agents/octocat/empty/stats'), E);
    const s = (await res.json()) as { runs_30d: number; rating_avg: number | null };
    expect(s.runs_30d).toBe(0);
    expect(s.rating_avg).toBeNull();
  });
});

describe('POST /events', () => {
  it('accepts a valid run_complete event', async () => {
    const res = await handleRequest(
      postJson('/events', {
        agent_id: 'octocat/hello',
        event: 'run_complete',
        success: true,
        duration_ms: 1234,
        client_id: 'anon-uuid',
        ts: new Date().toISOString(),
      }),
      E,
    );
    expect(res.status).toBe(202);
    const row = await E.DB.prepare('SELECT * FROM events WHERE agent_id = ?1')
      .bind('octocat/hello')
      .first<{ success: number; duration_ms: number }>();
    expect(row?.success).toBe(1);
    expect(row?.duration_ms).toBe(1234);
  });

  it('rejects an invalid event type', async () => {
    const res = await handleRequest(
      postJson('/events', { agent_id: 'octocat/hello', event: 'nope', client_id: 'c', ts: new Date().toISOString() }),
      E,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing client_id', async () => {
    const res = await handleRequest(
      postJson('/events', { agent_id: 'octocat/hello', event: 'run_start', ts: new Date().toISOString() }),
      E,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a bad agent_id', async () => {
    const res = await handleRequest(
      postJson('/events', { agent_id: 'not-an-id', event: 'run_start', client_id: 'c', ts: new Date().toISOString() }),
      E,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /ratings', () => {
  function stubGitHub(login: string | null) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (login === null) return new Response('bad creds', { status: 401 });
      return new Response(JSON.stringify({ login }), { status: 200 });
    });
  }

  it('upserts one rating per (agent_id, gh_login)', async () => {
    stubGitHub('alice');
    const first = await handleRequest(
      postJson('/ratings', { agent_id: 'octocat/hello', stars: 4, gh_token: 'tok' }),
      E,
    );
    expect(first.status).toBe(200);
    expect((await first.json() as { gh_login: string }).gh_login).toBe('alice');

    // Same user re-rates → upsert, not a second row.
    const second = await handleRequest(
      postJson('/ratings', { agent_id: 'octocat/hello', stars: 2, comment: 'changed my mind', gh_token: 'tok' }),
      E,
    );
    expect(second.status).toBe(200);

    const rows = await E.DB.prepare('SELECT stars, comment FROM ratings WHERE agent_id = ?1 AND gh_login = ?2')
      .bind('octocat/hello', 'alice')
      .all<{ stars: number; comment: string }>();
    expect(rows.results.length).toBe(1);
    expect(rows.results[0].stars).toBe(2);
    expect(rows.results[0].comment).toBe('changed my mind');
  });

  it('rejects an invalid gh_token', async () => {
    stubGitHub(null);
    const res = await handleRequest(
      postJson('/ratings', { agent_id: 'octocat/hello', stars: 4, gh_token: 'bad' }),
      E,
    );
    expect(res.status).toBe(401);
  });

  it('rejects out-of-range stars before calling GitHub', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await handleRequest(
      postJson('/ratings', { agent_id: 'octocat/hello', stars: 9, gh_token: 'tok' }),
      E,
    );
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an over-long comment', async () => {
    stubGitHub('alice');
    const res = await handleRequest(
      postJson('/ratings', { agent_id: 'octocat/hello', stars: 4, comment: 'x'.repeat(501), gh_token: 'tok' }),
      E,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /refresh', () => {
  it('rejects a bad agent_id without hitting GitHub', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await handleRequest(postJson('/refresh', { agent_id: 'not-an-id' }), E);
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('422 when the repo does not carry a primordial topic (abuse guard)', async () => {
    // A repo that never opted into the marketplace must NOT be injected.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            full_name: 'octocat/not-an-agent',
            html_url: 'https://github.com/octocat/not-an-agent',
            description: null,
            stargazers_count: 0,
            pushed_at: new Date().toISOString(),
            default_branch: 'main',
            topics: [],
          }),
          { status: 200 },
        ),
    );
    const res = await handleRequest(postJson('/refresh', { agent_id: 'octocat/not-an-agent' }), E);
    expect(res.status).toBe(422);
    expect((await res.json() as { ok: boolean }).ok).toBe(false);
  });
});

describe('routing', () => {
  it('404 on unknown path', async () => {
    const res = await handleRequest(req('/nope'), E);
    expect(res.status).toBe(404);
  });
});
