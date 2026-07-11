// /api/props — server-side CACHED player-prop rankings.
//
// Why this exists: the old design ran a full Sonnet + web-search analysis
// every single time someone tapped "Score props" in the app. That's the
// single most expensive action in SlipLab, and multiplied by repeated
// testing it burns through credit fast. This endpoint runs that same
// analysis ONCE per sport every CACHE_MINUTES, and every request in that
// window (from anyone, any device) gets the cached result for free —
// same idea as api/odds.js and api/trending.js, just applied to the
// AI-scored props too. This also means props now load automatically like
// the moneyline board, no button, no per-click cost.

const CACHE_MINUTES = 15;
const TTL = CACHE_MINUTES * 60 * 1000;
let cache = {}; // { [sport]: { at, data } }
let inFlight = {}; // de-dupe concurrent requests for the same sport

const ANALYST_CORE = `
ANALYST METHODOLOGY — work through this with real searched data, never assumptions:
1. CONFIRMATION: today's date, confirmed starting lineups/pitchers/keepers, scratches, injury designations.
2. MATCHUP MATH: handedness splits, bullpen/rotation fatigue, pace, defensive matchup on the specific player.
3. ENVIRONMENT: park factors, weather (wind speed/direction, temp), roof status where relevant.
4. SITUATION: rest, travel, schedule spot, motivation.
5. MARKET: current line and juice, and whether the price already reflects the obvious angle.
6. PRICE DISCIPLINE: convert odds to implied probability. A good price alone is NOT a reason to call something a lock — it's just a number. Only call it a real edge when your honest estimate clears the implied probability by a real, defensible margin.
7. CALIBRATION: your percentages must be numbers you would actually stake money on — never inflated to look confident.`;

const PROPS_SYSTEM = `You are a professional player-prop analyst covering the FULL slate, not just moneyline-adjacent pitching props. FIRST web search today's date and every game being played today in the requested sport. Then search broadly across prop CATEGORIES — do not default to only one type:
- MLB: pitcher outs, pitcher strikeouts, pitcher earned runs — AND hitter total bases, hits, home runs, RBIs, runs scored, walks, stolen bases, saves. Cover both pitching and hitting every time.
- NBA: points, rebounds, assists, three-pointers, combined points+rebounds+assists.
- NFL: passing yards, rushing yards, receptions, receiving yards, touchdowns.
- NHL: shots on goal, points, goalie saves.
- Soccer/World Cup: shots on target, goals, assists, cards.

Deliberately include a few lower-profile players alongside the stars — role players and complementary pieces get far less betting volume and scrutiny than a team's headline name, which sometimes means their number is priced less efficiently. Frame this as "less efficiently priced," never as a player who "always hits" — no prop ever always hits, and claiming that is wrong.

For every candidate, work the full methodology, then convert the odds to implied probability and compare it to your own honest estimate.

VERDICT BAR (this is strict — most props should NOT be "take"):
- "take" = reserved for a near-lock case only: multiple independent confirming factors line up (matchup + form + situation all point the same way) AND there is no significant contradicting risk (no injury doubt, no bad platoon split, no recent cold streak, no park/weather working against it). A good price by itself is never enough for "take."
- "lean" = a genuine, real edge, but with some real uncertainty or a factor working against it.
- "pass" = the line is priced about right, or your estimate doesn't clearly beat it, or there's meaningful doubt (lineup not fully confirmed, platoon risk, recent cold streak, unfavorable park/weather).

Respond ONLY with raw JSON, no fences: {"slate_note":"e.g. 8 MLB games today, wind blowing out at Wrigley","props":[{"player":"name","prop":"market + line (e.g. Over 6.5 Ks)","game":"AWY @ HOM","odds":"-115","implied_prob":56,"est_prob":62,"edge_pts":6,"verdict":"lean","why":"the single strongest factor"}]} — return 16 to 22 props spanning MULTIPLE categories and MULTIPLE games (not all pitching, not all one team), ranked by edge_pts descending. If no games today, return {"slate_note":"No games today","props":[]}.
${ANALYST_CORE}`;

async function scoreSport(sport, key) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: PROPS_SYSTEM,
    messages: [{ role: "user", content: `Rank today's best ${sport.toUpperCase()} player props across every game today, covering multiple prop categories (not just pitching/one type). Return ONLY the JSON.` }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || data.error.type);
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  const clean = text.replace(/```json|```/g, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("Model didn't return valid props JSON");
  const parsed = JSON.parse(clean.slice(a, b + 1));
  const list = (parsed.props || []).filter((p) => p && p.player).sort((x, y) => (y.edge_pts || 0) - (x.edge_pts || 0));
  return { slate_note: parsed.slate_note || "", props: list, updated: new Date().toISOString() };
}

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env vars" });

  const sport = String(req.query.sport || "mlb").toLowerCase();
  const force = req.query.refresh === "1";

  try {
    const hit = cache[sport];
    if (!force && hit && Date.now() - hit.at < TTL) {
      return res.status(200).json({ ...hit.data, cached: true, cacheAgeSec: Math.round((Date.now() - hit.at) / 1000) });
    }

    // De-dupe: if a request for this sport is already in flight, wait on it
    // instead of firing a second expensive call at the same time.
    if (inFlight[sport]) {
      const data = await inFlight[sport];
      return res.status(200).json({ ...data, cached: true, cacheAgeSec: 0 });
    }

    const promise = scoreSport(sport, key);
    inFlight[sport] = promise;
    const data = await promise;
    delete inFlight[sport];
    cache[sport] = { at: Date.now(), data };
    return res.status(200).json({ ...data, cached: false });
  } catch (e) {
    delete inFlight[sport];
    return res.status(500).json({ error: e.message });
  }
}
