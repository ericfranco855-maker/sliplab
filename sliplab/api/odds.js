// /api/odds — live sportsbook lines from The Odds API (free tier: 500 req/mo).
// Caching is aggressive (10 min) so one upstream request serves many users.
// Set ODDS_API_KEY in Vercel env vars. Get a free key at the-odds-api.com.

let cache = {}; // { [sport]: { at, data } }
const TTL = 10 * 60 * 1000;

const SPORTS = {
  mlb: "baseball_mlb",
  worldcup: "soccer_fifa_world_cup",
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  nhl: "icehockey_nhl",
};

export default async function handler(req, res) {
  const key = process.env.ODDS_API_KEY;
  if (!key) return res.status(500).json({ error: "ODDS_API_KEY not set — get a free key at the-odds-api.com" });

  const sportParam = (req.query.sport || "mlb").toLowerCase();
  const sport = SPORTS[sportParam];
  if (!sport) return res.status(400).json({ error: "sport must be one of: " + Object.keys(SPORTS).join(", ") });

  try {
    const hit = cache[sport];
    if (hit && Date.now() - hit.at < TTL) return res.status(200).json(hit.data);

    const url =
      `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
      `?apiKey=${key}&regions=us&markets=h2h,totals&oddsFormat=american&bookmakers=fanduel,draftkings`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Odds API returned " + r.status);
    const games = await r.json();

    const slim = games.map((g) => ({
      id: g.id,
      start: g.commence_time,
      home: g.home_team,
      away: g.away_team,
      books: (g.bookmakers || []).map((b) => ({
        book: b.title,
        markets: (b.markets || []).map((mk) => ({
          type: mk.key,
          outcomes: (mk.outcomes || []).map((o) => ({ name: o.name, price: o.price, point: o.point })),
        })),
      })),
    }));

    const payload = { updated: new Date().toISOString(), sport: sportParam, games: slim };
    cache[sport] = { at: Date.now(), data: payload };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
