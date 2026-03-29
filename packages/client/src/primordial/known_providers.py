"""
Known API provider registry for Primordial AgentStore V2.

Each entry locks in the canonical domain and auth style for a provider.
Agents that declare a known provider do not need to specify domain/auth_style.
The domain is immutable at runtime — the manifest cannot override it.
"""

from typing import TypedDict


class ProviderInfo(TypedDict):
    domain: str          # canonical API hostname
    auth_style: str      # "bearer" | "x-api-key" | "x-subscription-token"
    label: str           # human-readable name for display


KNOWN_PROVIDERS: dict[str, ProviderInfo] = {
    # ── LLM Inference ────────────────────────────────────────────────────
    "anthropic":      {"domain": "api.anthropic.com",                 "auth_style": "x-api-key",             "label": "Anthropic"},
    "openai":         {"domain": "api.openai.com",                    "auth_style": "bearer",                "label": "OpenAI"},
    "google-ai":      {"domain": "generativelanguage.googleapis.com", "auth_style": "bearer",                "label": "Google AI (Gemini)"},
    "mistral":        {"domain": "api.mistral.ai",                    "auth_style": "bearer",                "label": "Mistral AI"},
    "cohere":         {"domain": "api.cohere.com",                    "auth_style": "bearer",                "label": "Cohere"},
    "together":       {"domain": "api.together.xyz",                  "auth_style": "bearer",                "label": "Together AI"},
    "groq":           {"domain": "api.groq.com",                      "auth_style": "bearer",                "label": "Groq"},
    "deepseek":       {"domain": "api.deepseek.com",                  "auth_style": "bearer",                "label": "DeepSeek"},
    "perplexity":     {"domain": "api.perplexity.ai",                 "auth_style": "bearer",                "label": "Perplexity"},
    "fireworks":      {"domain": "api.fireworks.ai",                  "auth_style": "bearer",                "label": "Fireworks AI"},
    "replicate":      {"domain": "api.replicate.com",                 "auth_style": "bearer",                "label": "Replicate"},
    "hugging-face":   {"domain": "api-inference.huggingface.co",      "auth_style": "bearer",                "label": "Hugging Face"},
    "ai21":           {"domain": "api.ai21.com",                      "auth_style": "bearer",                "label": "AI21 Labs"},
    "aleph-alpha":    {"domain": "api.aleph-alpha.com",               "auth_style": "bearer",                "label": "Aleph Alpha"},
    "xai":            {"domain": "api.x.ai",                          "auth_style": "bearer",                "label": "xAI (Grok)"},
    "nvidia-nim":     {"domain": "integrate.api.nvidia.com",          "auth_style": "bearer",                "label": "NVIDIA NIM"},
    "cerebras":       {"domain": "api.cerebras.ai",                   "auth_style": "bearer",                "label": "Cerebras"},
    # ── Search ───────────────────────────────────────────────────────────
    "brave":          {"domain": "api.search.brave.com",              "auth_style": "x-subscription-token", "label": "Brave Search"},
    "serper":         {"domain": "google.serper.dev",                 "auth_style": "x-api-key",             "label": "Serper (Google Search)"},
    "tavily":         {"domain": "api.tavily.com",                    "auth_style": "bearer",                "label": "Tavily"},
    "exa":            {"domain": "api.exa.ai",                        "auth_style": "bearer",                "label": "Exa"},
    "you":            {"domain": "api.you.com",                       "auth_style": "bearer",                "label": "You.com"},
    "bing-search":    {"domain": "api.bing.microsoft.com",            "auth_style": "x-api-key",             "label": "Bing Search"},
    # ── Scraping / Browser ───────────────────────────────────────────────
    "firecrawl":      {"domain": "api.firecrawl.dev",                 "auth_style": "bearer",                "label": "Firecrawl"},
    "browserless":    {"domain": "chrome.browserless.io",             "auth_style": "bearer",                "label": "Browserless"},
    "jina":           {"domain": "r.jina.ai",                         "auth_style": "bearer",                "label": "Jina AI Reader"},
    "apify":          {"domain": "api.apify.com",                     "auth_style": "bearer",                "label": "Apify"},
    # ── Vector / Embeddings ──────────────────────────────────────────────
    "pinecone":       {"domain": "api.pinecone.io",                   "auth_style": "x-api-key",             "label": "Pinecone"},
    "voyage":         {"domain": "api.voyageai.com",                  "auth_style": "bearer",                "label": "Voyage AI"},
    # ── Storage / Data ───────────────────────────────────────────────────
    "supabase":       {"domain": "api.supabase.io",                   "auth_style": "bearer",                "label": "Supabase"},
    "neon":           {"domain": "console.neon.tech",                 "auth_style": "bearer",                "label": "Neon DB"},
    "airtable":       {"domain": "api.airtable.com",                  "auth_style": "bearer",                "label": "Airtable"},
    # ── Communications ───────────────────────────────────────────────────
    "sendgrid":       {"domain": "api.sendgrid.com",                  "auth_style": "bearer",                "label": "SendGrid"},
    "twilio":         {"domain": "api.twilio.com",                    "auth_style": "bearer",                "label": "Twilio"},
    "slack":          {"domain": "slack.com",                         "auth_style": "bearer",                "label": "Slack"},
    "discord":        {"domain": "discord.com",                       "auth_style": "bearer",                "label": "Discord"},
    # ── Productivity / APIs ──────────────────────────────────────────────
    "github":         {"domain": "api.github.com",                    "auth_style": "bearer",                "label": "GitHub"},
    "linear":         {"domain": "api.linear.app",                    "auth_style": "bearer",                "label": "Linear"},
    "notion":         {"domain": "api.notion.com",                    "auth_style": "bearer",                "label": "Notion"},
    "stripe":         {"domain": "api.stripe.com",                    "auth_style": "bearer",                "label": "Stripe"},
    "openweather":    {"domain": "api.openweathermap.org",            "auth_style": "x-api-key",             "label": "OpenWeather"},
    "newsapi":        {"domain": "newsapi.org",                       "auth_style": "x-api-key",             "label": "NewsAPI"},
    "alpha-vantage":  {"domain": "www.alphavantage.co",               "auth_style": "x-api-key",             "label": "Alpha Vantage"},
    "polygon-io":     {"domain": "api.polygon.io",                    "auth_style": "bearer",                "label": "Polygon.io"},
    "e2b":            {"domain": "api.e2b.dev",                       "auth_style": "bearer",                "label": "E2B"},
}
