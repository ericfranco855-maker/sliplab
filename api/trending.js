// /api/trending — pulls the highest-volume open markets from Polymarket's
// free public Gamma API. No key required. Cached for 5 minutes.

let cache = { at: 0, data: null };
const TTL = 5 * 60 * 1000;

export default async function handler(req, res) {
  try {
    if (cache.data && Date.now() - cache.at < TTL) {
      return res.status(200).json(cache.data);
    }

    const url =
      "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=40";
    const r = await fetch(url);
    if (!r.ok) throw new Error("Polymarket API returned " + r.status);
    const raw = await r.json();

    const markets = (Array.isArray(raw) ? raw : [])
      .map((m) => {
        let outcomes = [];
        let prices = [];
        try { outcomes = JSON.parse(m.outcomes || "[]"); } catch {}
        try { prices = (JSON.parse(m.outcomePrices || "[]")).map(Number); } catch {}
        return {
          id: m.id,
          question: m.question,
          slug: m.slug,
          volume24h: Math.round(Number(m.volume24hr || 0)),
          liquidity: Math.round(Number(m.liquidity || 0)),
          endDate: m.endDate,
          outcomes: outcomes.map((o, i) => ({ name: o, price: prices[i] ?? null })),
          url: "https://polymarket.com/market/" + m.slug,
        };
      })
      .filter((m) => m.volume24h > 0);

    const payload = { updated: new Date().toISOString(), markets };
    cache = { at: Date.now(), data: payload };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
