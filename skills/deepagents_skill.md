# DeepAgents JS SDK Reference

> Source: https://docs.langchain.com/oss/javascript/deepagents/overview
> GitHub: https://github.com/langchain-ai/deepagentsjs
> API Reference: https://reference.langchain.com/javascript/modules/deepagents.html

## Installation

```bash
npm install deepagents langchain @langchain/core @langchain/anthropic zod
```

## Core Concept

DeepAgents is an agent harness built on LangChain + LangGraph. Agents come with:
- **Planning** (`write_todos` tool) — task decomposition & tracking
- **Filesystem** (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`) — context management
- **Subagents** (`task` tool) — delegate work to isolated agents
- **Memory** — persistent cross-thread storage via LangGraph Store

Default model: `claude-sonnet-4-5-20250929`

---

## Creating an Agent

```typescript
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

const myTool = tool(
  async ({ input }) => `Result for: ${input}`,
  {
    name: "my_tool",
    description: "Does something useful",
    schema: z.object({ input: z.string() }),
  }
);

const agent = createDeepAgent({
  tools: [myTool],
  systemPrompt: "You are a helpful assistant.",
});

// Invoke
const result = await agent.invoke({
  messages: [{ role: "user", content: "Hello" }],
});
console.log(result.messages[result.messages.length - 1].content);
```

---

## Configuration Options

### `model`
Any LangChain chat model. Defaults to Claude Sonnet 4.5.

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";

const agent = createDeepAgent({
  model: new ChatAnthropic({ model: "claude-sonnet-4-20250514", temperature: 0 }),
  // or
  model: new ChatOpenAI({ model: "gpt-4o", temperature: 0 }),
});
```

### `systemPrompt`
Custom instructions string. Framework has a detailed default prompt.

### `tools`
Array of LangChain `StructuredTool` instances.

### `middleware`
Extend functionality via `AgentMiddleware` interface:

```typescript
import type { AgentMiddleware } from "langchain";

class MyMiddleware implements AgentMiddleware {
  tools = [myTool1, myTool2];
}

const agent = createDeepAgent({
  middleware: [new MyMiddleware()],
});
```

### `subagents`
Spawn isolated agents for subtasks:

```typescript
interface SubAgent {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: StructuredTool[];
  model?: LanguageModelLike | string;
  middleware?: AgentMiddleware[];
  interruptOn?: Record<string, boolean | InterruptOnConfig>;
  skills?: string[];
}

const agent = createDeepAgent({
  subagents: [{
    name: "researcher",
    description: "Performs web research",
    systemPrompt: "You are a research specialist.",
    tools: [searchTool],
  }],
});
```

### `backend`
Storage backend for filesystem/memory:

```typescript
import { StateBackend, StoreBackend, FilesystemBackend, CompositeBackend } from "deepagents";
import { InMemoryStore, MemorySaver } from "@langchain/langgraph";

// Ephemeral (default)
new StateBackend(config)

// Persistent via LangGraph Store
new StoreBackend({ store: new InMemoryStore(), checkpointer: new MemorySaver() })

// Actual filesystem
new FilesystemBackend(config)

// Composite — route /memories/ to persistent, rest ephemeral
new CompositeBackend(
  new StateBackend(config),
  { "/memories/": new StoreBackend(config) }
)
```

### `interruptOn`
Human-in-the-loop config (requires checkpointer):

```typescript
const agent = createDeepAgent({
  interruptOn: { "dangerous_tool": true },
});
```

---

## Built-in Middleware

### `todoListMiddleware(options?)`
Planning tool — `write_todos` for task decomposition.

### `createFilesystemMiddleware(options?)`
File tools: `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `execute` (sandbox only).

### `createSubAgentMiddleware(config)`
Spawns subagents via `task` tool.

---

## Prebuilt Middleware (from LangChain)

| Middleware | Purpose |
|---|---|
| Summarization | Compress old conversation history |
| Human-in-the-loop | Pause for human approval |
| Model/Tool Call Limits | Cap API calls |
| Model Fallback | Switch to backup model on failure |
| Tool/Model Retry | Exponential backoff |
| PII Detection | Redact/mask/hash sensitive data |
| Context Editing | Clear old tool outputs |
| LLM Tool Selector | Filter irrelevant tools |
| LLM Tool Emulator | Synthetic tool responses for testing |

---

## Streaming

DeepAgents returns a LangGraph graph — supports streaming natively:

```typescript
const stream = await agent.stream({
  messages: [{ role: "user", content: "Research quantum computing" }],
});

for await (const event of stream) {
  // Process streaming events
}
```

---

## Full Research Agent Example

```typescript
import { tool } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import { createDeepAgent } from "deepagents";
import { z } from "zod";

const internetSearch = tool(
  async ({ query, maxResults = 5, topic = "general", includeRawContent = false }) => {
    const tavilySearch = new TavilySearch({
      maxResults,
      tavilyApiKey: process.env.TAVILY_API_KEY,
      includeRawContent,
      topic,
    });
    return await tavilySearch._call({ query });
  },
  {
    name: "internet_search",
    description: "Run a web search",
    schema: z.object({
      query: z.string(),
      maxResults: z.number().optional().default(5),
      topic: z.enum(["general", "news", "finance"]).optional().default("general"),
      includeRawContent: z.boolean().optional().default(false),
    }),
  }
);

const agent = createDeepAgent({
  tools: [internetSearch],
  systemPrompt: "You are an expert researcher conducting thorough research and writing polished reports.",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "What is langgraph?" }],
});
console.log(result.messages[result.messages.length - 1].content);
```

---

## Key Links

- Overview: https://docs.langchain.com/oss/javascript/deepagents/overview
- Quickstart: https://docs.langchain.com/oss/javascript/deepagents/quickstart
- Middleware: https://docs.langchain.com/oss/javascript/deepagents/middleware
- API Ref: https://reference.langchain.com/javascript/modules/deepagents.html
- GitHub: https://github.com/langchain-ai/deepagentsjs
