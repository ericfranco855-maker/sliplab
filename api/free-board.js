// /api/free-board — a genuinely free, zero-AI-cost section combining:
// 1) Devigged moneyline win probability across every sport (pure math on
//    live FanDuel/DraftKings lines from The Odds API's free tier)
// 2) Real MLB probable-pitcher strikeout form (actual game logs from MLB's
//    own official free Stats API — never a guess, never a fabricated line)
//
// No Anthropic calls happen anywhere in this file. Cached generously so the
// free Odds API tier (500 req/month) never gets hammered by people opening
// this tab a lot — the client can poll often since almost every poll just
// re-serves this cache for free.

const TTL = 30 * 60 * 1000; // 30 min
let cache = { at: 0, data: null };

const ODDS_SPORTS = {
  mlb: "baseball_mlb",
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  nhl: "icehockey_nhl",
  worldcup: "soccer_fifa_world_cup",
};

function devig(outcomes) {
  const imp = outcomes.map((o) => {
    const p = Number(o.price);
    return p > 0 ? 100 / (p + 100) : -p / (-p + 100);
  });
  const total = imp.reduce((a, b) => a + b, 0) || 1;
  return outcomes.map((o, i) => ({ ...o, prob: imp[i] / total }));
}
const usd = (p) => (p > 0 ? "+" + p : String(p));

async function fetchMoneylines(oddsKey) {
  const all = [];
  for (const [label, sportKey] of Object.entries(ODDS_SPORTS)) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${oddsKey}&regions=us&markets=h2h&oddsFormat=american&bookmakers=fanduel,draftkings`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const games = await r.json();
      for (const g of games) {
        const fd = (g.bookmakers || []).find((b) => /fanduel/i.test(b.title)) || (g.bookmakers || [])[0];
        const ml = fd?.markets?.find((m) => m.key === "h2h");
        if (!ml?.outcomes || ml.outcomes.length < 2) continue;
        for (const o of devig(ml.outcomes)) {
          all.push({
            sport: label.toUpperCase(),
            pick: o.name + " ML",
            game: `${g.away_team} @ ${g.home_team}`,
            odds: usd(o.price),
            pct: Math.round(o.prob * 100),
            start: g.commence_time,
          });
        }
      }
    } catch { /* skip this sport, keep the rest */ }
  }
  all.sort((a, b) => b.pct - a.pct);
  return all.slice(0, 25);
}

async function fetchMlbPitcherForm() {
  const today = new Date().toISOString().slice(0, 10);
  const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher`;
  const r = await fetch(schedUrl);
  if (!r.ok) return [];
  const sched = await r.json();
  const pitchers = [];
  for (const date of sched.dates || []) {
    for (const g of date.games || []) {
      for (const side of ["away", "home"]) {
        const p = g.teams?.[side]?.probablePitcher;
        if (p?.id && !pitchers.some((x) => x.id === p.id)) {
          pitchers.push({ id: p.id, name: p.fullName, team: g.teams[side].team?.name, opponent: g.teams[side === "away" ? "home" : "away"].team?.name, gameTime: g.gameDate });
        }
      }
    }
  }

  const season = new Date().getFullYear();
  const results = [];
  for (const p of pitchers.slice(0, 16)) { // keep this bounded and fast
    try {
      const logUrl = `https://statsapi.mlb.com/api/v1/people/${p.id}/stats?stats=gameLog&group=pitching&season=${season}`;
      const r2 = await fetch(logUrl);
      if (!r2.ok) continue;
      const raw = await r2.json();
      const splits = (raw.stats?.[0]?.splits || []).reverse(); // most recent first
      if (splits.length < 3) continue;
      const ks = splits.map((s) => Number(s.stat?.strikeOuts ?? 0));
      const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      const l5 = avg(ks.slice(0, 5));
      const l10 = avg(ks.slice(0, 10));
      const season_ = avg(ks);
      const momentum = l5 != null && season_ != null ? l5 - season_ : 0;
      results.push({
        player: p.name, team: p.team, opponent: p.opponent, gameTime: p.gameTime,
        l5: l5?.toFixed(1), l10: l10?.toFixed(1), season: season_?.toFixed(1),
        momentum: momentum > 0.75 ? "hot" : momentum < -0.75 ? "cold" : "steady",
        momentumVal: Math.round(momentum * 10) / 10,
        starts: splits.length,
      });
    } catch { /* skip this pitcher */ }
  }
  // Sort hottest form first
  results.sort((a, b) => (b.momentumVal || 0) - (a.momentumVal || 0));
  return results;
}

export default async function handler(req, res) {
  try {
    if (cache.data && Date.now() - cache.at < TTL) {
      return res.status(200).json({ ...cache.data, cached: true });
    }

    const oddsKey = process.env.ODDS_API_KEY;
    const [moneylines, mlbPitchers] = await Promise.all([
      oddsKey ? fetchMoneylines(oddsKey).catch(() => []) : Promise.resolve([]),
      fetchMlbPitcherForm().catch(() => []),
    ]);

    const data = {
      moneylines,
      mlbPitchers,
      updated: new Date().toISOString(),
      note: !oddsKey ? "ODDS_API_KEY not set — moneyline section needs it, pitcher form works without it." : "",
    };
    cache = { at: Date.now(), data };
    return res.status(200).json({ ...data, cached: false });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
