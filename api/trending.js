// /api/trending — merges the highest-volume open markets from Polymarket
// AND Kalshi's free public APIs into one list, sorted by volume, so you see
// where real money is actually piling up right now. No keys required.
// Cached for 5 minutes since this doesn't need to be second-by-second.

let cache = { at: 0, data: null };
const TTL = 5 * 60 * 1000;

async function fetchPolymarket() {
  const url =
    "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=40";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Polymarket returned " + r.status);
  const raw = await r.json();

  return (Array.isArray(raw) ? raw : [])
    .map((m) => {
      let outcomes = [];
      let prices = [];
      try { outcomes = JSON.parse(m.outcomes || "[]"); } catch {}
      try { prices = (JSON.parse(m.outcomePrices || "[]")).map(Number); } catch {}
      return {
        source: "Polymarket",
        id: "pm-" + m.id,
        question: m.question,
        volume24h: Math.round(Number(m.volume24hr || 0)),
        outcomes: outcomes.map((o, i) => ({ name: o, price: prices[i] ?? null })),
        url: "https://polymarket.com/market/" + m.slug,
      };
    })
    .filter((m) => m.volume24h > 0);
}

async function fetchKalshi() {
  // Kalshi's public markets endpoint — read-only, no auth needed for market data.
  const url = "https://trading-api.kalshi.com/trade-api/v2/markets?status=open&limit=100";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Kalshi returned " + r.status);
  const raw = await r.json();
  const list = raw?.markets || [];

  return list
    .map((m) => {
      // Kalshi volume is in contracts; dollar volume ~= volume * price(¢)/100.
      const vol = Number(m.volume || m.volume_24h || 0);
      const yesPrice = m.yes_bid != null ? Number(m.yes_bid) / 100 : (m.last_price != null ? Number(m.last_price) / 100 : null);
      const dollarVol = Math.round(vol * (yesPrice || 0.5));
      return {
        source: "Kalshi",
        id: "kx-" + (m.ticker || m.event_ticker),
        question: m.title || m.subtitle || m.ticker,
        volume24h: dollarVol,
        outcomes: yesPrice != null ? [{ name: "Yes", price: yesPrice }, { name: "No", price: 1 - yesPrice }] : [],
        url: "https://kalshi.com/markets/" + (m.event_ticker || m.ticker || "").toLowerCase(),
      };
    })
    .filter((m) => m.volume24h > 0);
}

export default async function handler(req, res) {
  try {
    if (cache.data && Date.now() - cache.at < TTL) {
      return res.status(200).json(cache.data);
    }

    // Fetch both sources independently — if one fails, still show the other
    // rather than breaking the whole tab.
    const [pmResult, kxResult] = await Promise.allSettled([fetchPolymarket(), fetchKalshi()]);
    const pm = pmResult.status === "fulfilled" ? pmResult.value : [];
    const kx = kxResult.status === "fulfilled" ? kxResult.value : [];
    const sourceErrors = {};
    if (pmResult.status === "rejected") sourceErrors.polymarket = pmResult.reason?.message;
    if (kxResult.status === "rejected") sourceErrors.kalshi = kxResult.reason?.message;

    const markets = [...pm, ...kx].sort((a, b) => b.volume24h - a.volume24h);

    const payload = { updated: new Date().toISOString(), markets, sourceErrors };
    cache = { at: Date.now(), data: payload };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
