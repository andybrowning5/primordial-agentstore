import type { GitHubRepo } from '../src/types';

// A complete agent.yaml mirroring the real client schema, with a known
// provider (anthropic) and a custom one (acme-llm) so trust = requires_approval.
export const FULL_MANIFEST_YAML = `
name: web-research
display_name: Web Research
version: 1.2.0
description: Searches the web and synthesizes cited research reports.
category: research
tags:
  - web
  - search
author:
  name: Primordial Labs
  github: primordial-labs
  website: https://primordial.dev
runtime:
  language: python
  default_provider: anthropic
permissions:
  network:
    - domain: api.tavily.com
      reason: web search
  network_unrestricted: false
  filesystem:
    workspace: readwrite
  delegation:
    enabled: true
keys:
  - provider: anthropic
    required: true
  - provider: tavily
    required: true
`.trim();

// All-known-providers manifest → trust auto. Minimal but valid.
export const KNOWN_ONLY_YAML = `
name: simple-bot
display_name: Simple Bot
version: 0.1.0
description: A minimal agent.
author:
  name: Octocat
keys:
  - provider: anthropic
`.trim();

// Custom provider → trust requires_approval.
export const CUSTOM_PROVIDER_YAML = `
name: custom-bot
display_name: Custom Bot
version: 0.1.0
description: Uses an unknown provider.
author:
  name: Octocat
keys:
  - provider: acme-llm
    domain: llm.acme.example.com
`.trim();

export const REPO: GitHubRepo = {
  full_name: 'primordial-labs/web-research',
  html_url: 'https://github.com/primordial-labs/web-research',
  description: 'Web research agent',
  stargazers_count: 42,
  pushed_at: '2026-05-20T12:00:00Z',
  default_branch: 'main',
};

export const README = `# Web Research

Web Research is a **Primordial agent** that fans out web searches across
multiple providers, fetches and reads sources, then synthesizes a cited report.

\`\`\`bash
primordial run web-research "latest on small models"
\`\`\`

See [docs](https://primordial.dev/docs) for more.
`;
