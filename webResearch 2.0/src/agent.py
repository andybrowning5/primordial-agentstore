"""Web Research Agent — LangChain-powered research agent with agentic tool use."""

import json
import os
import sys
from datetime import datetime

import httpx
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool

BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY", "")
BRAVE_BASE_URL = os.environ.get("BRAVE_BASE_URL", "https://api.search.brave.com")
BRAVE_SEARCH_URL = f"{BRAVE_BASE_URL}/res/v1/web/search"


def send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def log(text: str) -> None:
    print(text, file=sys.stderr, flush=True)


@tool
def web_search(query: str) -> str:
    """Search the web for real-time information. Use this to find current facts, news, documentation, or any topic the user asks about. You can call this multiple times with different queries to get broader coverage."""
    try:
        resp = httpx.get(
            BRAVE_SEARCH_URL,
            params={"q": query, "count": 10},
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": BRAVE_API_KEY,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        log(f"Brave API returned {len(data.get('web', {}).get('results', []))} results for: {query}")
        results = []
        for item in data.get("web", {}).get("results", []):
            results.append(
                f"Title: {item.get('title', '')}\n"
                f"URL: {item.get('url', '')}\n"
                f"Description: {item.get('description', '')}"
            )
        if not results:
            return "No results found. Try a different search query."
        return "\n\n---\n\n".join(results)
    except Exception as e:
        return f"Search error: {e}"


def research(query: str, message_id: str) -> str:
    """Run the LangChain agent to research a topic."""
    send({
        "type": "activity",
        "tool": "thinking",
        "description": "Thinking about your question...",
        "message_id": message_id,
    })

    today = datetime.now().strftime("%B %d, %Y")

    llm = ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
    )

    tools = [web_search]
    llm_with_tools = llm.bind_tools(tools)

    system = SystemMessage(content=(
        f"You are Web Research Agent, an expert research assistant. Today is {today}. "
        "Your job is to thoroughly research the user's question using web search. "
        "Strategy:\n"
        "1. Break complex questions into sub-queries and search for each\n"
        "2. Search multiple times with different angles to get comprehensive coverage\n"
        "3. For simple greetings or non-research questions, just respond naturally without searching\n"
        "4. Synthesize all findings into a clear, well-structured briefing with markdown\n"
        "5. Include inline citations [1], [2] etc. and end with a Sources section\n"
        "Be thorough but concise. Prioritize accuracy and recency."
    ))

    messages = [system, HumanMessage(content=query)]

    # Agentic loop — let the model decide when to search and when to stop
    tool_map = {t.name: t for t in tools}
    for _ in range(8):  # max iterations
        response = llm_with_tools.invoke(messages)
        messages.append(response)

        if not response.tool_calls:
            break

        for tc in response.tool_calls:
            send({
                "type": "activity",
                "tool": "brave_search",
                "description": f"Searching: {tc['args'].get('query', '')}",
                "message_id": message_id,
            })
            result = tool_map[tc["name"]].invoke(tc["args"])
            messages.append({
                "role": "tool",
                "content": result,
                "tool_call_id": tc["id"],
            })

        send({
            "type": "activity",
            "tool": "thinking",
            "description": "Analyzing results...",
            "message_id": message_id,
        })

    # response.content can be a string or list of content blocks
    content = response.content
    if isinstance(content, list):
        return "\n".join(
            block if isinstance(block, str) else block.get("text", "")
            for block in content
        )
    return content


def main():
    send({"type": "ready"})
    log("Web Research Agent ready")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        if msg["type"] == "shutdown":
            log("Shutting down")
            break

        if msg["type"] == "message":
            mid = msg["message_id"]
            query = msg["content"]

            try:
                result = research(query, mid)
                send({
                    "type": "response",
                    "content": result,
                    "message_id": mid,
                    "done": True,
                })
            except Exception as e:
                log(f"Error: {e}")
                send({
                    "type": "error",
                    "error": str(e),
                    "message_id": mid,
                })
                send({
                    "type": "response",
                    "content": f"Something went wrong: {e}",
                    "message_id": mid,
                    "done": True,
                })


if __name__ == "__main__":
    main()
