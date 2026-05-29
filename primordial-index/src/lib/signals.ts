// Fold D1 events (last N days) + ratings into per-agent signals.
// All queries are parameterized. id (= owner/repo) is the join key.

import type { Signals } from '../types';

export interface AggRow {
  runs_30d: number;
  success_rate: number | null;
  rating_avg: number | null;
  rating_count: number;
}

/**
 * Compute signals for every agent_id that has telemetry/ratings, in one pass.
 * Returns a map keyed by agent_id. Agents with no rows get defaults at the
 * call site (see buildCatalog).
 */
export async function aggregateSignals(
  db: D1Database,
  windowDays: number,
): Promise<Map<string, AggRow>> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // run_complete events in window: count + success rate.
  const eventsRes = await db
    .prepare(
      `SELECT agent_id,
              SUM(CASE WHEN event = 'run_complete' THEN 1 ELSE 0 END) AS runs,
              SUM(CASE WHEN event = 'run_complete' AND success = 1 THEN 1 ELSE 0 END) AS successes,
              SUM(CASE WHEN event = 'run_complete' AND success IS NOT NULL THEN 1 ELSE 0 END) AS rated
         FROM events
        WHERE ts >= ?1
        GROUP BY agent_id`,
    )
    .bind(since)
    .all<{ agent_id: string; runs: number; successes: number; rated: number }>();

  const ratingsRes = await db
    .prepare(
      `SELECT agent_id, AVG(stars) AS avg_stars, COUNT(*) AS cnt
         FROM ratings
        GROUP BY agent_id`,
    )
    .all<{ agent_id: string; avg_stars: number; cnt: number }>();

  const map = new Map<string, AggRow>();

  for (const row of eventsRes.results ?? []) {
    map.set(row.agent_id, {
      runs_30d: row.runs ?? 0,
      success_rate: row.rated > 0 ? (row.successes ?? 0) / row.rated : null,
      rating_avg: null,
      rating_count: 0,
    });
  }

  for (const row of ratingsRes.results ?? []) {
    const existing = map.get(row.agent_id) ?? {
      runs_30d: 0,
      success_rate: null,
      rating_avg: null,
      rating_count: 0,
    };
    existing.rating_avg = row.cnt > 0 ? Number(row.avg_stars) : null;
    existing.rating_count = row.cnt ?? 0;
    map.set(row.agent_id, existing);
  }

  return map;
}

/** Build a contract Signals object from stars + an optional aggregate row. */
export function toSignals(stars: number, agg?: AggRow): Signals {
  return {
    stars,
    runs_30d: agg?.runs_30d ?? 0,
    rating_avg: agg?.rating_avg ?? null,
    rating_count: agg?.rating_count ?? 0,
    success_rate: agg?.success_rate ?? null,
  };
}

/** Single-agent live stats (GET /agents/:owner/:repo/stats). */
export async function statsFor(
  db: D1Database,
  agentId: string,
  windowDays: number,
): Promise<Omit<Signals, 'stars'>> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const ev = await db
    .prepare(
      `SELECT
          SUM(CASE WHEN event = 'run_complete' THEN 1 ELSE 0 END) AS runs,
          SUM(CASE WHEN event = 'run_complete' AND success = 1 THEN 1 ELSE 0 END) AS successes,
          SUM(CASE WHEN event = 'run_complete' AND success IS NOT NULL THEN 1 ELSE 0 END) AS rated
         FROM events
        WHERE agent_id = ?1 AND ts >= ?2`,
    )
    .bind(agentId, since)
    .first<{ runs: number | null; successes: number | null; rated: number | null }>();

  const rt = await db
    .prepare(`SELECT AVG(stars) AS avg_stars, COUNT(*) AS cnt FROM ratings WHERE agent_id = ?1`)
    .bind(agentId)
    .first<{ avg_stars: number | null; cnt: number | null }>();

  const rated = ev?.rated ?? 0;
  const cnt = rt?.cnt ?? 0;
  return {
    runs_30d: ev?.runs ?? 0,
    success_rate: rated > 0 ? (ev?.successes ?? 0) / rated : null,
    rating_avg: cnt > 0 ? Number(rt?.avg_stars) : null,
    rating_count: cnt,
  };
}
