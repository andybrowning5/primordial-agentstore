/**
 * Primordial Delegation SDK for Node.js
 *
 * Provides a simple async API for agents to search, spawn, and interact with
 * other agents on the Primordial AgentStore via the delegation socket.
 *
 * Usage:
 *   import { search, runAgent, messageAgent, stopAgent } from './primordial_delegate.mjs';
 *
 * Zero dependencies — uses only Node built-ins (net).
 */

import { createConnection } from 'net';

const SOCK_PATH = '/tmp/_primordial_delegate.sock';

// ---------------------------------------------------------------------------
// Socket helpers (fresh connection per call)
// ---------------------------------------------------------------------------

function connect() {
  return new Promise((resolve, reject) => {
    const sock = createConnection(SOCK_PATH, () => resolve(sock));
    sock.on('error', reject);
  });
}

function send(sock, obj) {
  sock.write(JSON.stringify(obj) + '\n');
}

function readLines(sock) {
  let buf = '';
  const lines = [];
  let resolver = null;
  let done = false;

  sock.setEncoding('utf8');
  sock.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) {
        const msg = JSON.parse(line);
        if (resolver) {
          const r = resolver;
          resolver = null;
          r(msg);
        } else {
          lines.push(msg);
        }
      }
    }
  });

  sock.on('end', () => {
    done = true;
    if (resolver) {
      const r = resolver;
      resolver = null;
      r(null);
    }
  });

  return {
    next() {
      if (lines.length > 0) return Promise.resolve(lines.shift());
      if (done) return Promise.resolve(null);
      return new Promise((resolve) => { resolver = resolve; });
    },
  };
}

async function request(msg) {
  const sock = await connect();
  try {
    send(sock, msg);
    const reader = readLines(sock);
    const result = await reader.next();
    if (result?.type === 'error') {
      throw new Error(result.error || 'unknown error');
    }
    return result;
  } finally {
    sock.destroy();
  }
}

async function* requestStream(msg) {
  const sock = await connect();
  const reader = readLines(sock);
  try {
    send(sock, msg);
    while (true) {
      const result = await reader.next();
      if (!result) return;
      yield result;
      if (result.type === 'error') return;
      if (result.done) return;
      if (result.type !== 'setup_status' && result.type !== 'stream_event') return;
    }
  } finally {
    sock.destroy();
  }
}

// ---------------------------------------------------------------------------
// Activity emission
// ---------------------------------------------------------------------------

/**
 * Emit a Primordial Protocol activity event to stdout.
 * Call this to let the parent agent / TUI see sub-agent progress.
 */
export function emitActivity(tool, description, messageId) {
  const event = { type: 'activity', tool, description };
  if (messageId) event.message_id = messageId;
  process.stdout.write(JSON.stringify(event) + '\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search for agents by capability.
 * @param {string} query - Natural language description (e.g. "web research").
 * @returns {Promise<Array>} List of agent objects with name, description, url, stars.
 */
export async function search(query) {
  const result = await request({ type: 'search', query });
  return result?.agents || [];
}

/**
 * List all available agents sorted by popularity.
 * @returns {Promise<Array>} List of agent objects.
 */
export async function searchAll() {
  const result = await request({ type: 'search_all' });
  return result?.agents || [];
}

/**
 * Spawn a sub-agent in its own sandbox.
 * @param {string} agentUrl - GitHub URL of the agent to spawn.
 * @param {Object} [options]
 * @param {Function} [options.onStatus] - Callback(event) for setup status updates.
 * @returns {Promise<string>} session_id
 */
export async function runAgent(agentUrl, { onStatus } = {}) {
  for await (const event of requestStream({ type: 'run', agent_url: agentUrl })) {
    if (event.type === 'setup_status') {
      if (onStatus) onStatus(event);
    } else if (event.type === 'session') {
      return event.session_id;
    } else if (event.type === 'error') {
      throw new Error(event.error || 'Failed to start agent');
    }
  }
  throw new Error('Unexpected end of stream during agent startup');
}

/**
 * Send a message to a sub-agent and wait for the response.
 * @param {string} sessionId - Session ID from runAgent.
 * @param {string} content - Message text to send.
 * @param {Object} [options]
 * @param {Function} [options.onActivity] - Callback(tool, description) for activity events.
 * @returns {Promise<Object>} { response: string, activities: Array }
 */
export async function messageAgent(sessionId, content, { onActivity } = {}) {
  const activities = [];
  let response = '';

  for await (const event of messageAgentStream(sessionId, content)) {
    if (event.type !== 'stream_event') continue;
    const inner = event.event || {};
    if (inner.type === 'activity') {
      const tool = inner.tool || '';
      const desc = inner.description || '';
      activities.push({ tool, description: desc });
      if (onActivity) onActivity(tool, desc);
    } else if (inner.type === 'response' && inner.done) {
      response = inner.content || '';
    }
  }

  return { response, activities };
}

/**
 * Send a message and yield raw stream events.
 * @param {string} sessionId - Session ID from runAgent.
 * @param {string} content - Message text to send.
 * @yields {Object} Raw event dicts from the delegation proxy.
 */
export async function* messageAgentStream(sessionId, content) {
  yield* requestStream({
    type: 'message',
    session_id: sessionId,
    content,
  });
}

/**
 * View the last 1000 lines of a sub-agent's output.
 * @param {string} sessionId - Session ID from runAgent.
 * @returns {Promise<Array<string>>} Output lines.
 */
export async function monitorAgent(sessionId) {
  const result = await request({ type: 'monitor', session_id: sessionId });
  return result?.lines || [];
}

/**
 * Shut down a sub-agent and release its sandbox.
 * @param {string} sessionId - Session ID from runAgent.
 */
export async function stopAgent(sessionId) {
  await request({ type: 'stop', session_id: sessionId });
}
