// /api/mlb-player — real player search + game log from MLB's own official
// public Stats API (statsapi.mlb.com). No key required, and this is genuine
// historical data — every number here is a real recorded stat line, not an
// AI estimate. This is what powers accurate hit-rate history (L5/L10/L15/
// season) for any MLB player, hitter or pitcher.

const CACHE_MIN = 10;
const TTL = CACHE_MIN * 60 * 1000;
let searchCache = {};
let logCache = {};

export default async function handler(req, res) {
  try {
    const action = String(req.query.action || "search");

    if (action === "search") {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.status(200).json({ players: [] });
      const key = q.toLowerCase();
      const hit = searchCache[key];
      if (hit && Date.now() - hit.at < TTL) return res.status(200).json(hit.data);

      const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(q)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("MLB Stats API returned " + r.status);
      const raw = await r.json();
      const players = (raw.people || []).slice(0, 8).map((p) => ({
        id: p.id,
        name: p.fullName,
        position: p.primaryPosition?.abbreviation || "",
        team: p.currentTeam?.name || "",
      }));
      const data = { players };
      searchCache[key] = { at: Date.now(), data };
      return res.status(200).json(data);
    }

    if (action === "gamelog") {
      const id = String(req.query.id || "");
      if (!id) return res.status(400).json({ error: "id required" });
      const season = req.query.season || new Date().getFullYear();
      const cacheKey = `${id}-${season}`;
      const hit = logCache[cacheKey];
      if (hit && Date.now() - hit.at < TTL) return res.status(200).json(hit.data);

      // Try hitting first, then pitching — most players are one or the other.
      async function fetchGroup(group) {
        const url = `https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&group=${group}&season=${season}`;
        const r = await fetch(url);
        if (!r.ok) return null;
        const raw = await r.json();
        const splits = raw.stats?.[0]?.splits || [];
        if (!splits.length) return null;
        return splits.map((s) => ({
          date: s.date,
          opponent: s.opponent?.name || "",
          isHome: s.isHome,
          stat: s.stat || {},
        })).reverse(); // most recent first
      }

      let group = "hitting";
      let games = await fetchGroup("hitting");
      if (!games) { games = await fetchGroup("pitching"); group = "pitching"; }
      if (!games) throw new Error("No game log found for this player this season");

      const data = { group, games, updated: new Date().toISOString() };
      logCache[cacheKey] = { at: Date.now(), data };
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: "action must be 'search' or 'gamelog'" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
