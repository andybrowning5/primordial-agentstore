// Unit tests for the pure catalog-building + manifest + trust logic.
// No Workers runtime needed.

import { describe, it, expect } from 'vitest';
import catalogFixture from '../fixtures/catalog.json';
import { parseManifest, ManifestError } from '../src/lib/manifest';
import { assessTrust } from '../src/lib/trust';
import { buildCatalogAgent, readmeExcerpt } from '../src/lib/catalog';
import { parseSemver, compareSemver } from '../src/lib/github';
import { toSignals } from '../src/lib/signals';
import {
  FULL_MANIFEST_YAML,
  KNOWN_ONLY_YAML,
  CUSTOM_PROVIDER_YAML,
  REPO,
  README,
} from './fixtures';

describe('parseManifest', () => {
  it('parses a full valid manifest', () => {
    const m = parseManifest(FULL_MANIFEST_YAML);
    expect(m.name).toBe('web-research');
    expect(m.display_name).toBe('Web Research');
    expect(m.version).toBe('1.2.0');
    expect(m.category).toBe('research');
    expect(m.tags).toEqual(['web', 'search']);
    expect(m.keys?.map((k) => k.provider)).toEqual(['anthropic', 'tavily']);
    expect(m.permissions?.filesystem?.workspace).toBe('readwrite');
    expect(m.permissions?.delegation?.enabled).toBe(true);
  });

  it('defaults category to general when invalid', () => {
    const m = parseManifest(KNOWN_ONLY_YAML.replace('description:', 'category: nonsense\ndescription:'));
    expect(m.category).toBe('general');
  });

  it('truncates an over-long description to 500 chars', () => {
    const long = 'x'.repeat(600);
    const m = parseManifest(`name: a-bot\ndisplay_name: A Bot\nversion: 1.0.0\nauthor:\n  name: X\ndescription: ${long}`);
    expect(m.description.length).toBe(500);
  });

  it('rejects an invalid name', () => {
    expect(() => parseManifest('name: A\ndisplay_name: A\nversion: 1.0.0\ndescription: d\nauthor:\n  name: X')).toThrow(ManifestError);
  });

  it('rejects a non-semver version', () => {
    expect(() =>
      parseManifest('name: a-bot\ndisplay_name: A Bot\nversion: v1\ndescription: d\nauthor:\n  name: X'),
    ).toThrow(ManifestError);
  });

  it('rejects a missing author.name', () => {
    expect(() =>
      parseManifest('name: a-bot\ndisplay_name: A Bot\nversion: 1.0.0\ndescription: d'),
    ).toThrow(ManifestError);
  });

  it('rejects non-mapping yaml', () => {
    expect(() => parseManifest('- just\n- a\n- list')).toThrow(ManifestError);
  });

  it('drops keys without a provider', () => {
    const m = parseManifest(
      'name: a-bot\ndisplay_name: A Bot\nversion: 1.0.0\ndescription: d\nauthor:\n  name: X\nkeys:\n  - required: true\n  - provider: anthropic',
    );
    expect(m.keys?.map((k) => k.provider)).toEqual(['anthropic']);
  });
});

describe('assessTrust', () => {
  it('auto when all providers are known', () => {
    expect(assessTrust(parseManifest(KNOWN_ONLY_YAML))).toBe('auto');
    expect(assessTrust(parseManifest(FULL_MANIFEST_YAML))).toBe('auto');
  });

  it('requires_approval when any provider is unknown', () => {
    expect(assessTrust(parseManifest(CUSTOM_PROVIDER_YAML))).toBe('requires_approval');
  });

  it('auto when there are no keys', () => {
    const m = parseManifest('name: a-bot\ndisplay_name: A Bot\nversion: 1.0.0\ndescription: d\nauthor:\n  name: X');
    expect(assessTrust(m)).toBe('auto');
  });
});

describe('readmeExcerpt', () => {
  it('strips markdown and truncates', () => {
    const ex = readmeExcerpt(README, 100);
    expect(ex).not.toContain('#');
    expect(ex).not.toContain('```');
    expect(ex).not.toContain('](');
    expect(ex.length).toBeLessThanOrEqual(100);
    expect(ex).toContain('Web Research');
  });
});

describe('buildCatalogAgent', () => {
  it('builds an agent matching the contract shape', () => {
    const manifest = parseManifest(FULL_MANIFEST_YAML);
    const signals = toSignals(REPO.stargazers_count, {
      runs_30d: 128,
      success_rate: 0.94,
      rating_avg: 4.5,
      rating_count: 12,
    });
    const agent = buildCatalogAgent({
      repo: REPO,
      ref: 'v1.2.0',
      commit: 'abc123',
      manifest,
      readme: README,
      signals,
      crawledAt: '2026-05-29T00:00:00Z',
    });

    expect(agent.id).toBe('primordial-labs/web-research');
    expect(agent.url).toBe(REPO.html_url);
    expect(agent.ref).toBe('v1.2.0');
    expect(agent.commit).toBe('abc123');
    expect(agent.language).toBe('python');
    expect(agent.providers).toEqual(['anthropic', 'tavily']);
    expect(agent.permissions).toEqual({
      network: ['api.tavily.com'],
      network_unrestricted: false,
      filesystem: 'readwrite',
      delegation: true,
    });
    expect(agent.trust).toBe('auto');
    expect(agent.signals).toEqual({
      stars: 42,
      runs_30d: 128,
      rating_avg: 4.5,
      rating_count: 12,
      success_rate: 0.94,
    });
    expect(agent.updated_at).toBe(REPO.pushed_at);
    expect(agent.last_crawled).toBe('2026-05-29T00:00:00Z');

    // Every key required by the contract is present.
    const keys = Object.keys(agent).sort();
    expect(keys).toEqual(
      [
        'author', 'category', 'commit', 'description', 'display_name', 'id',
        'language', 'last_crawled', 'name', 'permissions', 'providers', 'ref',
        'readme_excerpt', 'signals', 'tags', 'trust', 'updated_at', 'url', 'version',
      ].sort(),
    );
  });

  it('defaults signals to zero/null when no telemetry', () => {
    const manifest = parseManifest(KNOWN_ONLY_YAML);
    const agent = buildCatalogAgent({
      repo: REPO,
      ref: 'main',
      commit: 'sha',
      manifest,
      readme: '',
      signals: toSignals(7, undefined),
      crawledAt: '2026-05-29T00:00:00Z',
    });
    expect(agent.signals).toEqual({
      stars: 7,
      runs_30d: 0,
      rating_avg: null,
      rating_count: 0,
      success_rate: null,
    });
  });
});

describe('semver helpers', () => {
  it('parses with and without leading v', () => {
    expect(parseSemver('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('not-a-version')).toBeNull();
  });

  it('orders correctly', () => {
    const tags = [[1, 0, 0], [1, 2, 0], [1, 1, 9], [2, 0, 0]];
    tags.sort((a, b) => compareSemver(b, a));
    expect(tags[0]).toEqual([2, 0, 0]);
  });
});

describe('committed catalog.json fixture', () => {
  it('matches the contract schema', () => {
    const catalog = catalogFixture as {
      schema_version: string;
      generated_at: string;
      agents: Array<Record<string, any>>;
    };
    expect(catalog.schema_version).toBe('1');
    expect(typeof catalog.generated_at).toBe('string');
    expect(Array.isArray(catalog.agents)).toBe(true);
    for (const a of catalog.agents) {
      expect(a.id).toMatch(/^[^/]+\/[^/]+$/);
      expect(['auto', 'requires_approval']).toContain(a.trust);
      expect(['none', 'readonly', 'readwrite']).toContain(a.permissions.filesystem);
      expect(a.signals).toHaveProperty('stars');
      expect(a.signals).toHaveProperty('runs_30d');
    }
  });
});
