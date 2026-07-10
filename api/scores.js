// /api/scores — live scores and today's full schedule from ESPN's public
// scoreboard endpoints. No key required. Cached briefly since scores move.

let cache = {}; // { [sport]: { at, data } }
const TTL = 20 * 1000; // 20s — short because this is "live"

const ESPN_PATH = {
  mlb: "baseball/mlb",
  nba: "basketball/nba",
  nfl: "football/nfl",
  nhl: "hockey/nhl",
  worldcup: "soccer/fifa.world",
};

export default async function handler(req, res) {
  const sportParam = String(req.query.sport || "mlb").toLowerCase();
  const path = ESPN_PATH[sportParam];
  if (!path) return res.status(400).json({ error: "sport must be one of: " + Object.keys(ESPN_PATH).join(", ") });

  try {
    const hit = cache[sportParam];
    if (hit && Date.now() - hit.at < TTL) return res.status(200).json(hit.data);

    const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("ESPN scoreboard returned " + r.status);
    const raw = await r.json();

    const games = (raw.events || []).map((ev) => {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      const status = ev.status?.type || {};
      return {
        id: ev.id,
        name: ev.name,
        shortName: ev.shortName,
        start: ev.date,
        state: status.state, // "pre" | "in" | "post"
        statusDetail: status.shortDetail || status.description || "",
        home: home?.team?.shortDisplayName || home?.team?.displayName || "",
        away: away?.team?.shortDisplayName || away?.team?.displayName || "",
        homeScore: home?.score != null ? Number(home.score) : null,
        awayScore: away?.score != null ? Number(away.score) : null,
      };
    });

    const payload = { updated: new Date().toISOString(), sport: sportParam, games };
    cache[sportParam] = { at: Date.now(), data: payload };
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
