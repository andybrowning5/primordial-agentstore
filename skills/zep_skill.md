# Zep SDK Reference (TypeScript)

> Source docs: https://help.getzep.com/concepts | https://help.getzep.com/sdk-reference/thread/get-threads

## Core Concepts

- **Zep** — Context engineering platform combining Graph RAG, agent memory, and context assembly
- **Knowledge Graph** — Nodes = entities, edges = facts/relationships. Updates dynamically with new data
- **User** — Represents an app user. Has their own User Graph and conversation history
- **Thread** — A conversation belonging to a user. Messages added to threads are auto-ingested into the user's graph
- **Fact Invalidation** — Zep tracks when new data invalidates prior facts via timestamps on edges
- **Context Block** — Optimized text with user summaries and relevant graph facts, meant for direct prompt injection

## Client Initialization

```typescript
import { ZepClient } from "@getzep/zep-cloud";

const client = new ZepClient({ apiKey: process.env.ZEP_API_KEY });
```

---

## User Operations

### Add User
```typescript
// POST /api/v2/users
const user = await client.user.add({
  userId: "your_internal_user_id",   // required, unique identifier
  email: "jane@example.com",         // optional
  firstName: "Jane",                 // optional
  lastName: "Smith",                 // optional
  metadata: { plan: "pro" },         // optional
});
```

### Get User
```typescript
const user = await client.user.get("user_id");
```

### Update User
```typescript
const user = await client.user.update("user_id", {
  email: "new@example.com",
  metadata: { plan: "enterprise" },
});
```

### Delete User
```typescript
await client.user.delete("user_id");
```

### List Users (ordered)
```typescript
const result = await client.user.listOrdered({
  pageNumber: 1,
  pageSize: 10,
  orderBy: "created_at",
  asc: true,
});
// result.rowCount — total count
```

### Get User Threads
```typescript
const threads = await client.user.getThreads("user_id");
```

### Get User Node (graph node)
```typescript
const node = await client.user.getNode("user_id");
```

### Warm User Cache
```typescript
// Pre-loads user graph for low-latency search
await client.user.warm("user_id");
```

### Add User Summary Instructions
```typescript
// Up to 5 custom directives per user guiding summary generation
await client.user.addUserSummaryInstructions("user_id", {
  instructions: ["Focus on purchase history", "Highlight preferences"],
});
```

---

## Thread Operations

### Create Thread
```typescript
// POST /api/v2/threads
await client.thread.create({
  threadId: "thread_123",   // required, max 500 chars
  userId: "user_id",        // required
});
```
> Zep automatically warms the cache for new threads in the background.

### List All Threads
```typescript
// GET /api/v2/threads
const result = await client.thread.listAll({
  pageNumber: 1,
  pageSize: 10,
  orderBy: "created_at",  // created_at | updated_at | user_id | thread_id
  asc: false,
});
// result.totalCount, result.responseCount, result.threads[]
```

### Delete Thread
```typescript
await client.thread.delete("thread_id");
```

### Add Messages
```typescript
import type { Message } from "@getzep/zep-cloud/api";

const messages: Message[] = [
  {
    createdAt: new Date().toISOString(),  // RFC3339 format, optional
    name: "Jane",
    role: "user",       // "user" | "assistant" | "tool"
    content: "Who was Octavia Butler?",
    metadata: {         // optional
      sentiment: "curious",
      source: "web_app",
    },
  },
];

const response = await client.thread.addMessages("thread_id", { messages });
```

**Constraints:** Max 30 messages per call, each message max 4,096 characters.

**Ignore roles** (skip certain roles from graph ingestion):
```typescript
await client.thread.addMessages("thread_id", {
  messages,
  ignoreRoles: ["assistant"],
});
```

**Return context inline** (for latency-sensitive apps):
```typescript
const response = await client.thread.addMessages("thread_id", {
  messages,
  returnContext: true,
});
// response includes context block like getUserContext would
```

### Get User Context
```typescript
// GET /api/v2/threads/{threadId}/context
const ctx = await client.thread.getUserContext("thread_id", {
  templateId: "template_id",  // optional, custom context template
  minRating: 0.5,             // optional, relevance threshold (deprecated)
});
console.log(ctx.context);  // string — inject into your system prompt
```

### Update Message Metadata
```typescript
await client.thread.message.update("message-uuid", {
  metadata: { sentiment: "positive", resolved: true },
});
```

---

## Graph Operations

### Search Graph
```typescript
// POST /api/v2/graph/search
const results = await client.graph.search({
  query: "search term",            // required, max 400 chars
  userId: "user_id",               // search user's graph
  limit: 20,                       // default 10, max 50
  scope: "edges",                  // "edges" | "nodes" | "episodes"
  reranker: "cross_encoder",       // "rrf" | "mmr" | "node_distance" | "episode_mentions" | "cross_encoder"
  searchFilters: {},               // optional, filter by properties/dates/labels/types
});
// results.edges[], results.nodes[], results.episodes[]
```

### Set Ontology
```typescript
// Define custom entity and edge types
await client.graph.setOntology({
  entityTypes: [...],
  edgeTypes: [...],
});
```

---

## Context Templates

### List Templates
```typescript
const templates = await client.context.listContextTemplates();
```

### Create Template
```typescript
await client.context.createContextTemplate({
  template: "template content with {{variables}}",
  templateId: "my_template",
});
```

---

## Complete Workflow Example

```typescript
import "dotenv/config";
import { ZepClient } from "@getzep/zep-cloud";
import type { Message } from "@getzep/zep-cloud/api";
import { v4 as uuid } from "uuid";

const client = new ZepClient({ apiKey: process.env.ZEP_API_KEY });

// 1. Create user
await client.user.add({
  userId: "user_jane",
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
});

// 2. Create thread
const threadId = uuid();
await client.thread.create({
  threadId,
  userId: "user_jane",
});

// 3. Add user message
await client.thread.addMessages(threadId, {
  messages: [
    {
      createdAt: new Date().toISOString(),
      name: "Jane",
      role: "user",
      content: "Who was Octavia Butler?",
    },
  ],
});

// 4. Get context for AI prompt
const ctx = await client.thread.getUserContext(threadId);
console.log(ctx.context); // use in system prompt

// 5. Add assistant response
await client.thread.addMessages(threadId, {
  messages: [
    {
      createdAt: new Date().toISOString(),
      name: "AI Assistant",
      role: "assistant",
      content: "Octavia Butler was an influential American science fiction writer...",
    },
  ],
});
```

---

## Key Docs Links

- Concepts: https://help.getzep.com/concepts
- Quick Start: https://help.getzep.com/quick-start-guide
- Threads: https://help.getzep.com/threads
- Adding Messages: https://help.getzep.com/adding-messages
- SDK Reference (Thread): https://help.getzep.com/sdk-reference/thread/get-threads
- SDK Reference (User): https://help.getzep.com/sdk-reference/user/add
- SDK Reference (Graph Search): https://help.getzep.com/sdk-reference/graph/search
