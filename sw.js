// /api/chat — secure proxy to the Anthropic API.
// Your key stays on the server (ANTHROPIC_API_KEY env var), never in the browser.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env vars" });

  try {
    const { messages, system, useSearch = true, model = "claude-sonnet-4-6", max_tokens = 1500 } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    const body = {
      model,
      max_tokens,
      messages: messages.map((m) => ({ role: m.role, content: String(m.content) })),
    };
    if (system) body.system = system;
    if (useSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    if (data.error) return res.status(r.status).json({ error: data.error.message || data.error.type });

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return res.status(200).json({ text, usage: data.usage });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
