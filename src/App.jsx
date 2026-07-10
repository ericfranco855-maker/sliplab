import React, { useState, useRef, useEffect } from "react";

/* ================= THEME =================
   Design language: a live sportsbook terminal. Amber is reserved for
   brand + primary actions only. Phosphor teal is the separate "live/data"
   accent (ticker, live badges) so the palette isn't one-hue-on-black.
   Green/red are reserved exclusively for win/take vs loss/pass signals. */
const T = {
  bg: "#0A0D12", surface: "#12171F", surface2: "#171D27", line: "#232B36",
  paper: "#F5F1E6", paperInk: "#17130A", amber: "#FFB627",
  phosphor: "#2FD1C5",
  green: "#3DDC84", red: "#F2555B", text: "#E8ECF2", dim: "#8B96A5",
};
const D = "'Barlow Condensed', sans-serif";
const M = "'IBM Plex Mono', monospace";

/* ================= ERROR BOUNDARY (no more white screens) ================= */
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 20, color: T.text, fontFamily: "'Inter', sans-serif" }}>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: 24, textTransform: "uppercase", color: T.red }}>Something broke</div>
          <div style={{ fontFamily: M, fontSize: 12, color: T.dim, marginTop: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {String(this.state.err?.message || this.state.err)}
          </div>
          <button onClick={() => { this.setState({ err: null }); }} style={{
            marginTop: 16, background: T.amber, border: "none", borderRadius: 10, padding: "10px 20px",
            fontFamily: D, fontWeight: 700, fontSize: 16, color: "#1A1300", cursor: "pointer", textTransform: "uppercase",
          }}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ================= API ================= */
async function apiChat(messages, { system, useSearch = true, max_tokens = 1500 } = {}) {
  let r;
  try {
    r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system, useSearch, max_tokens }),
    });
  } catch (e) {
    throw new Error("Network error reaching the server — check your connection and try again.");
  }
  if (r.status === 413) throw new Error("That upload is too large — try a smaller screenshot or crop it.");
  if (r.status === 504 || r.status === 502) throw new Error("The request took too long and timed out — try again, or turn off Deep Research for a faster answer.");
  let d;
  try {
    d = await r.json();
  } catch {
    throw new Error(`Server error (${r.status}) — try again in a moment.`);
  }
  if (d.error) throw new Error(d.error);
  return d.text || "";
}

/* Shared analyst methodology injected into every engine */
const ANALYST_CORE = `
ANALYST METHODOLOGY — work through this checklist with real searched data, never assumptions:
1. CONFIRMATION: today's date, confirmed starting lineups/pitchers/keepers, scratches, injury designations. Unconfirmed = say so and discount.
2. MATCHUP MATH: starter handedness vs lineup splits (wOBA/OPS vs L/R), bullpen fatigue (innings last 3 days), pace/possession styles, defensive matchup on the specific player.
3. ENVIRONMENT: for MLB — park factors, weather (wind speed AND direction relative to the park, temp, humidity), roof status, umpire strike-zone tendencies. For outdoor sports — wind/rain impact on totals and passing/kicking.
4. SITUATION: rest days, travel (b2b, cross-country), schedule spot (letdown/lookahead), home/away splits, motivation (elimination, tanking).
5. MARKET: current line and juice, opening line, direction of movement — if the market moved against your lean, respect it and explain.
6. PRICE DISCIPLINE: convert the odds to implied probability. Only call something a play when your honest estimate beats the implied probability by 3+ points. If nothing clears that bar, SAY PASS — a smaller card of real edges beats a full card of forced picks. Passing is a recommendation.
7. CALIBRATION: your estimated percentages must be numbers you'd bet on being right — never inflate to look confident. State the single biggest risk to each pick.`;

const CHAT_SYSTEM = `You are SlipLab, a professional sports betting analyst for an experienced bettor. Always web search before answering: lines, confirmed lineups, injuries, weather, matchups. Be direct: the read, the number, a clear lean or pass. Use betting shorthand (SGP, ML, juice, SOT, TNB, CLV). If something can't be confirmed, say exactly what's unconfirmed.${ANALYST_CORE}`;

const DEEP_SYSTEM = `You are SlipLab in Deep Research mode — a professional sports analyst building a full pregame report. Run multiple searches covering every item in the methodology. Structure the answer: THE READ (2-3 sentences), THE NUMBERS (key stats, lines, weather, splits found), THE RISKS (what kills this bet), THE PLAY (clear recommendation with the edge math: your est % vs implied %, or PASS if no edge). Thorough but never padded.${ANALYST_CORE}`;

const PARLAY_SYSTEM = `You are a professional parlay construction engine. You will be given live sportsbook lines. Work the full methodology on every candidate leg before including it — reject legs that don't clear the edge bar even if it means noting the slip is thinner than requested. Prefer uncorrelated legs unless intentionally stacking correlation, and say so in risk_note. Respond ONLY with raw JSON, no fences, matching:
{"title":"short slip title","legs":[{"pick":"team/player + market + line","game":"matchup","odds":"-115","why":"one-sentence data-backed reason citing the strongest factor"}],"combined_odds":"+450","risk_note":"one sentence: correlation + the single biggest risk","confidence":"A-"}
Grade confidence honestly: A range only when every leg clears the edge bar with confirmed data; C range when forced.${ANALYST_CORE}`;

const HYPER_ANALYZE_SYSTEM = `You are hyper-analyzing a bettor's own hand-picked parlay. You'll get their exact selected legs. Web search to confirm current status, lines, lineups, and injuries for every single one before saying anything. Structure your reply in plain text with these exact section headers, nothing else:
PER-LEG CALLS
One line per leg: the pick, then KEEP, CUT, or SWAP → [alternative] with a short reason citing the real factor (matchup, weather, injury, line movement).
COMBINED READ
Your honest estimate of the true combined hit probability as a percentage, the biggest correlation or risk across the legs, and whether the market's price on this combination is fair.
THE VERDICT
One direct paragraph: submit as-is, cut specific legs, or pass entirely — and why. No hedging, pick a side.
${ANALYST_CORE}`;

/* American-odds helpers for combining a manually-built slip's price */
function parseFirstOdds(str) {
  const m = String(str || "").match(/[-+]\d+/);
  return m ? m[0] : null;
}
function oddsToDecimal(american) {
  const n = Number(american);
  if (!isFinite(n) || n === 0) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}
function decimalToOdds(dec) {
  if (dec >= 2) return "+" + Math.round((dec - 1) * 100);
  return String(Math.round(-100 / (dec - 1)));
}
function combinedOdds(items) {
  let dec = 1, any = false;
  for (const it of items) {
    const o = parseFirstOdds(it.odds);
    const d = o ? oddsToDecimal(o) : null;
    if (d) { dec *= d; any = true; }
  }
  return any ? decimalToOdds(dec) : "—";
}

/* ================= SLIP STORAGE ================= */
const loadSlips = () => {
  try {
    const raw = JSON.parse(localStorage.getItem("sliplab_slips") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => s && typeof s === "object");
  } catch { return []; }
};
const saveSlips = (s) => { try { localStorage.setItem("sliplab_slips", JSON.stringify(s)); } catch {} };

const loadCart = () => {
  try {
    const raw = JSON.parse(localStorage.getItem("sliplab_cart") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};
const saveCart = (c) => { try { localStorage.setItem("sliplab_cart", JSON.stringify(c)); } catch {} };

function historyBlock() {
  const slips = loadSlips().filter((s) => s && (s.result === "win" || s.result === "loss"));
  if (!slips.length) return "";
  const lines = slips.slice(0, 20).map((s) => {
    const legs = (s.legs || []).map((l) => l && l.pick).filter(Boolean).join(" + ");
    return `[${String(s.result).toUpperCase()}] ${legs} (${s.combined_odds || "?"})`;
  });
  return `\n\nUSER'S TRACKED SLIP HISTORY (learn their patterns — what leg types and odds ranges have cashed vs died, factor into recommendations):\n${lines.join("\n")}`;
}

/* ================= SMALL PARTS ================= */
const Spinner = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.dim, fontSize: 13, padding: "6px 0" }}>
    <span className="pulse" style={{ width: 8, height: 8, borderRadius: 99, background: T.amber }} />{label}
  </div>
);

const H1 = ({ children }) => (
  <div>
    <div style={{ fontFamily: D, fontWeight: 800, fontSize: 28, textTransform: "uppercase", color: T.text, letterSpacing: 0.5 }}>{children}</div>
    <div style={{ width: 34, height: 3, background: `linear-gradient(90deg, ${T.amber}, ${T.amber}00)`, borderRadius: 2, marginTop: 6 }} />
  </div>
);

const lbl = { fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.dim, marginBottom: 6 };

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: 3, gap: 3, boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)" }}>
      {options.map((o) => (
        <button key={String(o)} onClick={() => onChange(o)} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
          background: value === o ? T.amber : "transparent", color: value === o ? "#1A1300" : T.dim,
          fontFamily: D, fontWeight: 700, fontSize: 14.5, letterSpacing: 0.5, textTransform: "uppercase",
          boxShadow: value === o ? "0 2px 8px rgba(255,182,39,0.35)" : "none",
        }}>{String(o)}</button>
      ))}
    </div>
  );
}

const usd = (p) => (p > 0 ? "+" + p : String(p));

function fmtWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], { weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

// Pull a specific book's moneyline outcomes from a game object, if present
function bookML(g, nameRegex) {
  const book = (g.books || []).find((b) => nameRegex.test(b.book));
  const ml = book?.markets?.find((m) => m.type === "h2h");
  return ml?.outcomes || null;
}

// Best-effort match of a free-text "Team A @ Team B" string to a game object
// Shared image compressor: resizes any picked photo down before it's sent
// anywhere, so phone screenshots (1-4MB) never trip the server's size limit.
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("Not an image")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1000;
        const scale = Math.min(1, MAX_W / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ dataUrl, media_type: "image/jpeg", base64: dataUrl.split(",")[1] });
      };
      img.onerror = () => reject(new Error("Couldn't read that image — try a different screenshot."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

function findGameForText(text, games) {
  if (!text) return null;
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const t = norm(text);
  for (const g of games) {
    const away = norm(g.away), home = norm(g.home);
    if (!away || !home) continue;
    if (t.includes(away) || t.includes(home) ||
        away.split(" ").some((w) => w.length > 3 && t.includes(w)) ||
        home.split(" ").some((w) => w.length > 3 && t.includes(w))) {
      return g;
    }
  }
  return null;
}

/* ================= TICKET ================= */
const LIVE_SPORT_KEYS = ["mlb", "nba", "nfl", "nhl", "worldcup"];

function matchLiveGame(gameStr, allGames) {
  if (!gameStr) return null;
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const g = norm(gameStr);
  let best = null;
  for (const game of allGames) {
    const away = norm(game.away), home = norm(game.home);
    if (!away || !home) continue;
    if ((g.includes(away) || away.includes(g)) || (g.includes(home) || home.includes(g)) ||
        away.split(" ").some((w) => w.length > 3 && g.includes(w)) ||
        home.split(" ").some((w) => w.length > 3 && g.includes(w))) {
      best = game;
      if (game.state === "in") break; // prefer an in-progress match if found
    }
  }
  return best;
}

function Ticket({ slip, onResult }) {
  if (!slip) return null;
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const status = slip.result;
  const isLive = status === "live";
  const [liveGames, setLiveGames] = useState([]);

  useEffect(() => {
    if (!isLive) return;
    let dead = false;
    async function pull() {
      try {
        const results = await Promise.all(
          LIVE_SPORT_KEYS.map((k) => fetch("/api/scores?sport=" + k).then((r) => r.json()).catch(() => ({ games: [] })))
        );
        if (dead) return;
        setLiveGames(results.flatMap((r) => r.games || []));
      } catch {}
    }
    pull();
    const t = setInterval(pull, 25000);
    return () => { dead = true; clearInterval(t); };
  }, [isLive]);

  return (
    <div style={{ margin: "10px 0", opacity: status === "loss" ? 0.75 : 1 }}>
      <div style={{ background: T.paper, color: T.paperInk, borderRadius: "10px 10px 0 0", padding: "14px 16px 10px", boxShadow: "0 10px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)", position: "relative", overflow: "hidden" }}>
        {status && status !== "live" && (
          <div style={{
            position: "absolute", top: 18, right: -34, transform: "rotate(35deg)", padding: "3px 40px",
            background: status === "win" ? "#1B7A46" : "#A33", color: "#FFF",
            fontFamily: D, fontWeight: 800, fontSize: 13, letterSpacing: 2,
          }}>{status === "win" ? "CASHED" : "DEAD"}</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: 20, letterSpacing: 0.5, textTransform: "uppercase" }}>{slip.title || "Generated Slip"}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {isLive && <span style={{ fontFamily: D, fontWeight: 800, fontSize: 11, letterSpacing: 1, color: "#1B7A46" }}>● LIVE</span>}
            {slip.confidence && <div style={{ fontFamily: M, fontWeight: 600, fontSize: 12, background: T.paperInk, color: T.paper, padding: "2px 8px", borderRadius: 4 }}>{slip.confidence}</div>}
          </div>
        </div>
        <div style={{ borderTop: `1.5px dashed ${T.paperInk}33`, margin: "10px 0" }} />
        {legs.map((leg, i) => {
          const match = isLive ? matchLiveGame(leg?.game, liveGames) : null;
          return (
            <div key={i} style={{ padding: "8px 0", borderBottom: i < legs.length - 1 ? `1px solid ${T.paperInk}18` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{leg?.pick}</div>
                <div style={{ fontFamily: M, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", color: String(leg?.odds || "").startsWith("-") ? "#A33" : "#1B7A46" }}>{leg?.odds}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "#5A5340", marginTop: 2 }}>{leg?.game}</div>
              {leg?.why && <div style={{ fontSize: 12, color: "#3A3527", marginTop: 3, lineHeight: 1.4 }}>{leg.why}</div>}
              {match && (
                <div style={{ fontFamily: M, fontSize: 12, marginTop: 4, color: match.state === "in" ? "#1B7A46" : match.state === "post" ? "#6B6350" : "#8A8060" }}>
                  {match.state === "in" ? "● " : match.state === "post" ? "FINAL — " : ""}
                  {match.away} {match.awayScore ?? ""} — {match.homeScore ?? ""} {match.home}
                  {match.state === "in" && match.statusDetail ? ` (${match.statusDetail})` : ""}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ borderTop: `1.5px dashed ${T.paperInk}33`, margin: "10px 0 8px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#6B6350" }}>Combined</span>
          <span style={{ fontFamily: M, fontWeight: 600, fontSize: 18 }}>{slip.combined_odds}</span>
        </div>
        {slip.risk_note && <div style={{ fontSize: 11.5, color: "#6B6350", marginTop: 6, fontStyle: "italic" }}>{slip.risk_note}</div>}
        {onResult && !status && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => onResult("live")} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${T.paperInk}55`, background: "transparent", color: T.paperInk, fontFamily: D, fontWeight: 700, fontSize: 13, letterSpacing: 0.5, cursor: "pointer" }}>I'M PLACING THIS</button>
          </div>
        )}
        {onResult && (status === "live" || !status) && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => onResult("win")} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid #1B7A46", background: "transparent", color: "#1B7A46", fontFamily: D, fontWeight: 700, fontSize: 14, letterSpacing: 1, cursor: "pointer" }}>MARK WIN</button>
            <button onClick={() => onResult("loss")} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid #A33", background: "transparent", color: "#A33", fontFamily: D, fontWeight: 700, fontSize: 14, letterSpacing: 1, cursor: "pointer" }}>MARK LOSS</button>
          </div>
        )}
      </div>
      <svg width="100%" height="10" style={{ display: "block" }} preserveAspectRatio="none" viewBox="0 0 100 10">
        <path d="M0,0 L100,0 L100,3 L97,10 L94,3 L91,10 L88,3 L85,10 L82,3 L79,10 L76,3 L73,10 L70,3 L67,10 L64,3 L61,10 L58,3 L55,10 L52,3 L49,10 L46,3 L43,10 L40,3 L37,10 L34,3 L31,10 L28,3 L25,10 L22,3 L19,10 L16,3 L13,10 L10,3 L7,10 L4,3 L0,10 Z" fill={T.paper} />
      </svg>
    </div>
  );
}

/* ================= BOARD (live lines + edge leaderboard) ================= */
const PROPS_SYSTEM = `You are a professional player-prop analyst ranking today's slate. FIRST web search today's date and which games are actually being played today in the requested sport. Then for each candidate prop, work the full methodology: confirmed lineups/starters, matchup splits (batter/pitcher handedness, defensive matchup), park factors and weather (wind speed/direction, temp — critical for MLB totals/power props), bullpen or rotation fatigue, rest/travel, and current line movement. If you can find the same prop line at both FanDuel and DraftKings, note both in the odds field like "FD -115 / DK -120" — otherwise just give the one you found. Convert each prop's odds to implied probability (implied_prob) and compare it to your own honest estimate (est_prob) — edge_pts is est_prob minus implied_prob. Set verdict to "take" only when edge_pts is a real, wide margin (roughly 5+ points) backed by a concrete factor, "lean" for a smaller genuine edge (2-5 points), or "pass" when the line is priced about right or your estimate doesn't clear it — include pass entries too if they're close calls worth flagging, don't just omit them. Respond ONLY with raw JSON, no fences: {"slate_note":"e.g. 8 MLB games today, wind blowing out at Wrigley","props":[{"player":"name","prop":"market + line (e.g. Over 6.5 Ks)","game":"AWY @ HOM","odds":"-115","implied_prob":56,"est_prob":62,"edge_pts":6,"verdict":"take","why":"the single strongest factor — matchup, weather, form, or park"}]} — return 10 to 14 props total, mostly real edges but a couple of honest passes are fine, ranked by edge_pts descending, spread across multiple games. Every probability is a calibrated number you'd stake your own money on being right, never inflated for excitement. If no games today, return {"slate_note":"No games today","props":[]}.${ANALYST_CORE}`;

function devig(outcomes) {
  // Convert American odds to implied probs, remove the vig by normalizing
  const imp = outcomes.map((o) => {
    const p = Number(o.price);
    return p > 0 ? 100 / (p + 100) : -p / (-p + 100);
  });
  const total = imp.reduce((a, b) => a + b, 0) || 1;
  return outcomes.map((o, i) => ({ ...o, prob: imp[i] / total }));
}

function ProbBar({ pct }) {
  const color = pct >= 60 ? T.green : pct >= 50 ? T.amber : T.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: T.surface2, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: Math.min(pct, 100) + "%", height: "100%", background: color, boxShadow: `0 0 8px ${color}88` }} />
      </div>
      <span style={{ fontFamily: M, fontWeight: 600, fontSize: 13, color, minWidth: 38, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// Compute a plain-language verdict from a probability (and optional explicit
// verdict string from the AI, which takes priority since it has real context
// a raw threshold can't see — weather, matchup, etc.)
function verdictFor(pct, explicit) {
  if (explicit) {
    const v = String(explicit).toLowerCase();
    if (v.includes("take")) return "TAKE";
    if (v.includes("pass")) return "PASS";
    if (v.includes("lean")) return "LEAN";
  }
  if (pct == null) return null;
  if (pct >= 58) return "TAKE";
  if (pct >= 51) return "LEAN";
  return "PASS";
}

function VerdictChip({ verdict }) {
  if (!verdict) return null;
  const style =
    verdict === "TAKE" ? { bg: T.green + "22", fg: T.green, bd: T.green + "55" } :
    verdict === "PASS" ? { bg: T.red + "1a", fg: T.red, bd: T.red + "44" } :
    { bg: T.amber + "1a", fg: T.amber, bd: T.amber + "44" };
  return (
    <span style={{
      fontFamily: D, fontWeight: 800, fontSize: 11.5, letterSpacing: 1,
      color: style.fg, background: style.bg, border: `1px solid ${style.bd}`,
      padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap",
    }}>{verdict}</span>
  );
}

/* ================= LIVE TICKER — signature scrolling strip ================= */
function LiveTicker() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let dead = false;
    Promise.all(
      ["mlb", "nba", "worldcup"].map((k) => fetch("/api/scores?sport=" + k).then((r) => r.json()).catch(() => ({ games: [] })))
    ).then((results) => {
      if (dead) return;
      const games = results.flatMap((r) => r.games || []);
      const live = games.filter((g) => g.state === "in").slice(0, 6);
      const upcoming = games.filter((g) => g.state === "pre").slice(0, 6);
      setItems([...live, ...upcoming]);
    });
    const t = setInterval(() => {
      Promise.all(
        ["mlb", "nba", "worldcup"].map((k) => fetch("/api/scores?sport=" + k).then((r) => r.json()).catch(() => ({ games: [] })))
      ).then((results) => {
        if (dead) return;
        const games = results.flatMap((r) => r.games || []);
        const live = games.filter((g) => g.state === "in").slice(0, 6);
        const upcoming = games.filter((g) => g.state === "pre").slice(0, 6);
        setItems([...live, ...upcoming]);
      });
    }, 45000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  if (items.length === 0) return null;
  const track = [...items, ...items]; // duplicate for seamless loop

  return (
    <div style={{ overflow: "hidden", borderBottom: `1px solid ${T.line}`, background: "#080B0F", padding: "6px 0" }}>
      <div className="ticker-track" style={{ display: "flex", gap: 28, whiteSpace: "nowrap", width: "max-content" }}>
        {track.map((g, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: M, fontSize: 11.5 }}>
            {g.state === "in" ? (
              <>
                <span style={{ color: T.phosphor }}>●</span>
                <span style={{ color: T.text }}>{g.away} {g.awayScore}</span>
                <span style={{ color: T.dim }}>—</span>
                <span style={{ color: T.text }}>{g.homeScore} {g.home}</span>
                <span style={{ color: T.phosphor, fontSize: 10 }}>{g.statusDetail}</span>
              </>
            ) : (
              <>
                <span style={{ color: T.dim }}>{g.away} @ {g.home}</span>
                <span style={{ color: T.dim, fontSize: 10 }}>{fmtWhen(g.start)}</span>
              </>
            )}
            <span style={{ color: T.line }}>·</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Shared row for anything that can be added to a manual slip: cart toggle,
   verdict chip, probability bar, and a tap-through to the Desk for deep research. */
function PickRow({ id, index, title, subtitle, timeLabel, pct, explicitVerdict, primaryOdds, secondaryOdds, inCart, onToggleCart, onAsk }) {
  const verdict = verdictFor(pct, explicitVerdict);
  return (
    <div style={{
      display: "flex", alignItems: "stretch", gap: 0, marginBottom: 8,
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden",
    }}>
      <button onClick={onToggleCart} aria-label={inCart ? "Remove from slip" : "Add to slip"} style={{
        width: 42, flexShrink: 0, border: "none", cursor: "pointer",
        background: inCart ? T.phosphor : T.surface2, color: inCart ? "#04201E" : T.dim,
        fontSize: 19, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
      }}>{inCart ? "✓" : "+"}</button>
      <button onClick={onAsk} style={{
        flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer",
        padding: "11px 13px 11px 12px", fontFamily: "'Inter', sans-serif", minWidth: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={{ color: T.text, fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>
            {index != null && <span style={{ fontFamily: M, color: T.dim, fontSize: 11, marginRight: 7 }}>{String(index + 1).padStart(2, "0")}</span>}
            {title}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {primaryOdds && <div style={{ fontFamily: M, fontSize: 12.5, color: String(primaryOdds).startsWith("-") ? T.red : T.green }}>{primaryOdds}</div>}
            {secondaryOdds && <div style={{ fontFamily: M, fontSize: 10.5, color: T.dim, marginTop: 1 }}>{secondaryOdds}</div>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "3px 0 8px" }}>
          <div style={{ fontSize: 11, color: T.dim, flex: 1, minWidth: 0 }}>{subtitle}</div>
          {timeLabel && <div style={{ fontFamily: M, fontSize: 10.5, color: T.dim, whiteSpace: "nowrap", flexShrink: 0 }}>{timeLabel}</div>}
        </div>
        {pct != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}><ProbBar pct={pct} /></div>
            <VerdictChip verdict={verdict} />
          </div>
        )}
      </button>
    </div>
  );
}

function BoardTab({ onAsk, cart, addToCart, isInCart, onReviewCart }) {
  const [mode, setMode] = useState("Edge");
  const [sport, setSport] = useState("mlb");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [props_, setProps] = useState(null);
  const [propBusy, setPropBusy] = useState(false);
  const [propErr, setPropErr] = useState("");
  const [slateNote, setSlateNote] = useState("");

  useEffect(() => {
    let dead = false;
    setLoading(true); setErr(""); setData(null);
    fetch("/api/odds?sport=" + sport)
      .then((r) => r.json())
      .then((d) => { if (!dead) { d.error ? setErr(d.error) : setData(d); } })
      .catch((e) => !dead && setErr(e.message))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [sport]);

  const games = data?.games || [];

  // Build the edge leaderboard: every ML side, devigged, ranked by true win probability
  const edge = [];
  for (const g of games) {
    const fd = (g.books || []).find((b) => /fanduel/i.test(b.book)) || (g.books || [])[0];
    const ml = fd?.markets?.find((m) => m.type === "h2h");
    const dkOutcomes = bookML(g, /draftkings/i);
    if (ml?.outcomes?.length >= 2) {
      for (const o of devig(ml.outcomes)) {
        const dkMatch = dkOutcomes?.find((d) => d.name === o.name);
        edge.push({
          pick: o.name + " ML", game: g.away + " @ " + g.home, odds: usd(o.price),
          dkOdds: dkMatch ? usd(dkMatch.price) : null,
          pct: Math.round(o.prob * 100), start: g.start,
        });
      }
    }
  }
  edge.sort((a, b) => b.pct - a.pct);

  async function scoreProps() {
    if (propBusy) return;
    setPropBusy(true); setPropErr(""); setSlateNote("");
    try {
      const raw = await apiChat(
        [{ role: "user", content: `Rank today's best ${sport.toUpperCase()} player props across every game being played today. Return ONLY the JSON.` }],
        { system: PROPS_SYSTEM, useSearch: true, max_tokens: 3500 }
      );
      const clean = String(raw).replace(/```json|```/g, "").trim();
      const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
      if (a < 0 || b < 0) throw new Error("No scores returned — run it again");
      const parsed = JSON.parse(clean.slice(a, b + 1));
      setSlateNote(parsed.slate_note || "");
      const list = (parsed.props || []).filter((p) => p && p.player).sort((x, y) => (y.est_prob || 0) - (x.est_prob || 0));
      setProps(list);
    } catch (e) {
      setPropErr("Scoring failed — run it again. (" + e.message + ")");
    } finally { setPropBusy(false); }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <H1>The board</H1>
      <div style={{ color: T.dim, fontSize: 11.5, margin: "4px 0 2px" }}>FanDuel & DraftKings compared where available · take/lean/pass on every pick</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0 12px" }}>
        <Seg options={["Edge", "Props", "Lines"]} value={mode} onChange={setMode} />
        <Seg options={["mlb", "worldcup", "nba", "nfl", "nhl"]} value={sport} onChange={setSport} />
      </div>

      {loading && mode !== "Props" && <Spinner label="Pulling the board…" />}
      {err && mode !== "Props" && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}

      {mode === "Props" && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.dim, margin: "4px 0 8px" }}>
            Every player prop scored, with a take/lean/pass call · tap + to build a slip
          </div>
          <button onClick={scoreProps} disabled={propBusy} style={{
            width: "100%", background: T.amber, border: "none", borderRadius: 12, padding: "13px 0",
            fontFamily: D, fontWeight: 800, fontSize: 18, letterSpacing: 1, color: "#1A1300",
            cursor: "pointer", textTransform: "uppercase", opacity: propBusy ? 0.5 : 1,
          }}>{propBusy ? "Ranking the slate…" : props_ ? "Refresh rankings" : `Rank today's ${sport.toUpperCase()} props`}</button>
          {propBusy && <Spinner label="Checking today's games, lineups, and lines…" />}
          {propErr && <div style={{ color: T.red, fontSize: 13, marginTop: 8 }}>{propErr}</div>}
          {slateNote && <div style={{ fontFamily: M, fontSize: 12, color: T.phosphor, margin: "10px 0 4px" }}>● {slateNote}</div>}
          <div style={{ marginTop: 10 }}>
            {(props_ || []).map((p, i) => {
              const gameMatch = findGameForText(p.game, games);
              const when = fmtWhen(gameMatch?.start);
              const id = `prop-${p.player}-${p.prop}-${p.game}`;
              return (
                <PickRow
                  key={id} id={id} index={i}
                  title={`${p.player} · ${p.prop}`}
                  subtitle={p.game + (p.why ? " — " + p.why : "")}
                  timeLabel={when}
                  pct={Math.round(p.est_prob ?? 0)}
                  explicitVerdict={p.verdict}
                  primaryOdds={p.odds}
                  inCart={isInCart(id)}
                  onToggleCart={() => addToCart({ id, pick: `${p.player} ${p.prop}`, game: p.game, odds: p.odds, source: "props", pct: Math.round(p.est_prob ?? 0), why: p.why })}
                  onAsk={() => onAsk(`Pull full stats and matchup context for ${p.player} — ${p.prop} (${p.game}). Show recent performance trends, the specific matchup/split that supports it, and explain exactly why it should hit. Worth a leg today?`)}
                />
              );
            })}
          </div>
          {props_ && props_.length > 0 && (
            <div style={{ fontSize: 11, color: T.dim, marginTop: 10, lineHeight: 1.5 }}>
              AI estimates from live research, not sportsbook-implied — always confirm the number on FanDuel before locking.
            </div>
          )}
          {props_ && props_.length === 0 && !propBusy && (
            <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 20 }}>No {sport.toUpperCase()} games today.</div>
          )}
        </div>
      )}

      {mode === "Edge" && !loading && !err && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.dim, margin: "4px 0 8px" }}>
            Win probability leaderboard · vig removed from live FanDuel lines
          </div>
          {edge.length === 0 && <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 20 }}>No games on this board right now.</div>}
          {edge.map((e, i) => {
            const id = `edge-${e.pick}-${e.game}`;
            return (
              <PickRow
                key={id} id={id} index={i}
                title={e.pick}
                subtitle={e.game}
                timeLabel={fmtWhen(e.start)}
                pct={e.pct}
                primaryOdds={"FD " + e.odds}
                secondaryOdds={e.dkOdds ? "DK " + e.dkOdds : null}
                inCart={isInCart(id)}
                onToggleCart={() => addToCart({ id, pick: e.pick, game: e.game, odds: e.odds, source: "edge", pct: e.pct })}
                onAsk={() => onAsk(`Pull full stats and reasoning for ${e.pick} (${e.game}) — recent form, matchup, injuries, weather if relevant. Is it worth anchoring a slip?`)}
              />
            );
          })}
          <div style={{ fontSize: 11, color: T.dim, marginTop: 12, lineHeight: 1.5 }}>
            Market-based probability, not independent research — the take/lean/pass call here reflects how strong the favorite is, not a researched edge. Switch to Props for AI-scored picks.
          </div>
        </div>
      )}

      {mode === "Lines" && !loading && !err && (
        <div>
          {games.length === 0 && <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 30 }}>No games on this board right now.</div>}
          {games.map((g) => {
            const fd = (g.books || []).find((b) => /fanduel/i.test(b.book)) || (g.books || [])[0];
            const ml = fd?.markets?.find((m) => m.type === "h2h");
            const tot = fd?.markets?.find((m) => m.type === "totals");
            const dkOutcomes = bookML(g, /draftkings/i);
            const when = fmtWhen(g.start);
            return (
              <button key={g.id} onClick={() => onAsk(`Full read on ${g.away} @ ${g.home} — lines, lineups, injuries, best angle.`)} style={{
                display: "block", width: "100%", textAlign: "left", background: T.surface, border: `1px solid ${T.line}`,
                borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{g.away} <span style={{ color: T.dim }}>@</span> {g.home}</div>
                  <div style={{ fontFamily: M, fontSize: 11, color: T.dim }}>{when}</div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ fontFamily: M, fontSize: 10, color: T.dim, width: 24 }}>FD</span>
                    {(ml?.outcomes || []).map((o, i) => (
                      <div key={i} style={{ fontFamily: M, fontSize: 12.5 }}>
                        <span style={{ color: T.dim }}>{o.name?.split(" ").slice(-1)[0]} </span>
                        <span style={{ color: o.price > 0 ? T.green : T.red }}>{usd(o.price)}</span>
                      </div>
                    ))}
                    {tot?.outcomes?.[0]?.point != null && (
                      <div style={{ fontFamily: M, fontSize: 12.5 }}>
                        <span style={{ color: T.dim }}>O/U </span>
                        <span style={{ color: T.amber }}>{tot.outcomes[0].point}</span>
                      </div>
                    )}
                  </div>
                  {dkOutcomes && (
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontFamily: M, fontSize: 10, color: T.dim, width: 24 }}>DK</span>
                      {dkOutcomes.map((o, i) => (
                        <div key={i} style={{ fontFamily: M, fontSize: 12.5 }}>
                          <span style={{ color: T.dim }}>{o.name?.split(" ").slice(-1)[0]} </span>
                          <span style={{ color: o.price > 0 ? T.green : T.red }}>{usd(o.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Multi-select toggle row — lets you pick more than one sport at once */
function MultiSeg({ options, values, onChange }) {
  function toggle(o) {
    if (values.includes(o)) {
      if (values.length === 1) return; // keep at least one selected
      onChange(values.filter((v) => v !== o));
    } else {
      onChange([...values, o]);
    }
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button key={o} onClick={() => toggle(o)} style={{
            padding: "8px 14px", borderRadius: 99, border: `1.5px solid ${on ? T.amber : T.line}`,
            background: on ? T.amber : "transparent", color: on ? "#1A1300" : T.dim,
            fontFamily: D, fontWeight: 700, fontSize: 13.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer",
          }}>{o}</button>
        );
      })}
    </div>
  );
}

/* ================= BUILDER ================= */
function ParlayTab({ onSaveSlip, cart, removeFromCart, clearCart, reviewSignal }) {
  const [subMode, setSubMode] = useState("auto");
  const [sports, setSports] = useState(["MLB"]);
  const [legs, setLegs] = useState(3);
  const [style, setStyle] = useState("Balanced");
  const [includeProps, setIncludeProps] = useState(true);
  const [slips, setSlips] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [err, setErr] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState("");

  useEffect(() => { if (reviewSignal) setSubMode("mypicks"); }, [reviewSignal]);

  const SPORT_KEY = { "MLB": "mlb", "World Cup": "worldcup", "NBA": "nba", "NFL": "nfl", "NHL": "nhl" };

  async function build() {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      setPhase("Pulling live FanDuel lines…");
      // Pull lines for every selected sport and label each section clearly
      const sections = [];
      for (const sportName of sports) {
        const sportKey = SPORT_KEY[sportName] || "mlb";
        try {
          const r = await fetch("/api/odds?sport=" + sportKey);
          const d = await r.json();
          if (Array.isArray(d.games) && d.games.length) {
            const lines = d.games.slice(0, 10).map((g) => {
              const fd = (g.books || []).find((b) => /fanduel/i.test(b.book)) || (g.books || [])[0];
              const ml = fd?.markets?.find((m) => m.type === "h2h");
              const mlStr = ml ? ml.outcomes.map((o) => `${o.name} ${usd(o.price)}`).join(" / ") : "";
              return `${g.away} @ ${g.home} — ML: ${mlStr}`;
            }).join("\n");
            sections.push(`[${sportName}]\n${lines}`);
          } else {
            sections.push(`[${sportName}]\nNo live lines pulled — confirm current odds via search.`);
          }
        } catch { sections.push(`[${sportName}]\nNo live lines pulled — confirm current odds via search.`); }
      }
      const linesBlock = sections.join("\n\n");
      const sportLabel = sports.length > 1 ? sports.join(" + ") : sports[0];

      setPhase(includeProps ? "Confirming lineups, props & building…" : "Confirming lineups & building…");
      const riskLine =
        style === "Extreme Safe" ? "Target +100 to +180 combined. Only include legs where your edge estimate beats the implied probability by a wide, obvious margin — heaviest confirmed favorites and safest floor props only. If you can't find enough legs this safe, return fewer legs rather than force it." :
        style === "Safe" ? "Target +150 to +250 combined, high-floor legs." :
        style === "Balanced" ? "Target +300 to +500 combined." :
        "Target +600 or longer with at least one upside prop.";
      const propsLine = includeProps
        ? "Mix moneylines WITH player props (hits, Ks, HRs, SOT, points, etc.) — search for real current prop lines rather than only using the moneylines below. Player props are encouraged, not just game-level ML."
        : "Use moneylines/spreads/totals only — no player props.";
      const mixLine = sports.length > 1
        ? `This slip should MIX legs across these sports: ${sportLabel} — the slate sections above are labeled by sport. Draw legs from more than one of them rather than sticking to just one, and note in risk_note that legs come from unrelated sports/slates (which is actually good for reducing correlation).`
        : "";
      const prompt = `LIVE LINES BY SPORT:\n${linesBlock}\n\nBuild a ${legs}-leg ${style.toLowerCase()} parlay for today's ${sportLabel} slate(s). ${propsLine} ${riskLine} ${mixLine} Return ONLY the JSON.`;
      const raw = await apiChat([{ role: "user", content: prompt }], { system: PARLAY_SYSTEM + historyBlock(), useSearch: true, max_tokens: 2500 });
      const clean = String(raw).replace(/```json|```/g, "").trim();
      const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
      if (a < 0 || b < 0) throw new Error("Model didn't return a slip — try again");
      const slip = JSON.parse(clean.slice(a, b + 1));
      slip.created = new Date().toISOString();
      setSlips((s) => [slip, ...s]);
      onSaveSlip(slip);
    } catch (e) {
      setErr("Couldn't build that slip — run it again. (" + e.message + ")");
    } finally { setBusy(false); setPhase(""); }
  }

  async function hyperAnalyze() {
    if (analyzing || cart.length === 0) return;
    setAnalyzing(true); setAnalyzeErr(""); setAnalysis("");
    try {
      const legsText = cart.map((c, i) => `${i + 1}. ${c.pick} — ${c.game} (${c.odds || "odds unknown"})${c.why ? " — flagged edge: " + c.why : ""}${c.pct != null ? ` — shown at ${c.pct}%` : ""}`).join("\n");
      const prompt = `Here are the legs I've manually selected for a parlay:\n${legsText}\n\nHyper-analyze this exact slip.`;
      const reply = await apiChat([{ role: "user", content: prompt }], { system: HYPER_ANALYZE_SYSTEM + historyBlock(), useSearch: true, max_tokens: 2500 });
      setAnalysis(reply);
    } catch (e) {
      setAnalyzeErr("Analysis failed — try again. (" + e.message + ")");
    } finally { setAnalyzing(false); }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <H1>Build a slip</H1>
      <div style={{ display: "flex", gap: 6, margin: "12px 0 4px" }}>
        {[["auto", "Auto-Build"], ["mypicks", "My Picks"]].map(([k, label]) => (
          <button key={k} onClick={() => setSubMode(k)} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${subMode === k ? T.amber : T.line}`,
            background: subMode === k ? T.amber : "transparent", color: subMode === k ? "#1A1300" : T.dim,
            fontFamily: D, fontWeight: 700, fontSize: 13.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
            {label}
            {k === "mypicks" && cart.length > 0 && (
              <span style={{
                background: subMode === k ? "#1A1300" : T.phosphor, color: subMode === k ? T.amber : "#04201E",
                borderRadius: 99, fontFamily: M, fontSize: 10, fontWeight: 700, width: 17, height: 17,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{cart.length}</span>
            )}
          </button>
        ))}
      </div>

      {subMode === "auto" && (
        <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        <div>
          <div style={lbl}>Slate — tap to mix multiple</div>
          <MultiSeg options={["MLB", "World Cup", "NBA", "NFL", "NHL"]} values={sports} onChange={setSports} />
        </div>
        <div><div style={lbl}>Legs</div><Seg options={[2, 3, 4, 5]} value={legs} onChange={setLegs} /></div>
        <div><div style={lbl}>Risk</div><Seg options={["Extreme Safe", "Safe", "Balanced", "Longshot"]} value={style} onChange={setStyle} /></div>
        <div>
          <div style={lbl}>Leg types</div>
          <Seg options={["ML + Props", "ML Only"]} value={includeProps ? "ML + Props" : "ML Only"} onChange={(v) => setIncludeProps(v === "ML + Props")} />
        </div>
        <button onClick={build} disabled={busy} style={{
          background: T.amber, border: "none", borderRadius: 12, padding: "14px 0",
          fontFamily: D, fontWeight: 800, fontSize: 19, letterSpacing: 1, color: "#1A1300",
          cursor: "pointer", textTransform: "uppercase", opacity: busy ? 0.5 : 1, marginTop: 4,
        }}>{busy ? "Working…" : "Print the slip"}</button>
        {busy && <Spinner label={phase} />}
        {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}
      </div>
      <div style={{ marginTop: 18 }}>
        {slips.map((s, i) => <Ticket key={i} slip={s} />)}
        {slips.length === 0 && !busy && (
          <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 30, lineHeight: 1.6 }}>
            Built from live FanDuel lines, saved automatically to My Slips.
          </div>
        )}
      </div>
        </>
      )}

      {subMode === "mypicks" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.dim, marginBottom: 10 }}>
            Picks you've tapped + on, from Board
          </div>
          {cart.length === 0 ? (
            <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 30, lineHeight: 1.6 }}>
              Nothing here yet. Go to the Board tab, tap <b style={{ color: T.text }}>+</b> on any pick, and it lands here.
            </div>
          ) : (
            <>
              {cart.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.text, fontSize: 13.5, fontWeight: 600 }}>{c.pick}</div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{c.game}{c.pct != null ? ` · ${c.pct}%` : ""}</div>
                  </div>
                  {c.odds && <div style={{ fontFamily: M, fontSize: 12.5, color: String(c.odds).startsWith("-") ? T.red : T.green, flexShrink: 0 }}>{c.odds}</div>}
                  <button onClick={() => removeFromCart(c.id)} aria-label="Remove" style={{ background: "transparent", border: "none", color: T.dim, fontSize: 20, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px 4px" }}>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: T.dim }}>Combined (est.)</span>
                <span style={{ fontFamily: M, fontWeight: 700, fontSize: 18, color: T.amber }}>{combinedOdds(cart)}</span>
              </div>
              <button onClick={hyperAnalyze} disabled={analyzing} style={{
                width: "100%", background: T.phosphor, border: "none", borderRadius: 12, padding: "14px 0",
                fontFamily: D, fontWeight: 800, fontSize: 18, letterSpacing: 1, color: "#04201E",
                cursor: "pointer", textTransform: "uppercase", opacity: analyzing ? 0.5 : 1, marginTop: 10,
              }}>{analyzing ? "Hyper-analyzing…" : "Hyper-Analyze This Slip"}</button>
              {analyzing && <Spinner label="Checking every leg — status, lines, matchups…" />}
              {analyzeErr && <div style={{ color: T.red, fontSize: 13, marginTop: 8 }}>{analyzeErr}</div>}
              <button onClick={clearCart} style={{
                width: "100%", background: "transparent", border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 0",
                fontFamily: D, fontWeight: 700, fontSize: 13, letterSpacing: 1, color: T.dim, cursor: "pointer", textTransform: "uppercase", marginTop: 8,
              }}>Clear all picks</button>
              {analysis && (
                <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: 16, marginTop: 14, whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6, color: T.text }}>
                  {analysis}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= TODAY (everything still bettable, across every sport) ================= */
const ALL_SPORTS = [
  { key: "mlb", label: "MLB" },
  { key: "nba", label: "NBA" },
  { key: "nfl", label: "NFL" },
  { key: "nhl", label: "NHL" },
  { key: "worldcup", label: "World Cup" },
];

function TodayTab({ onAsk }) {
  const [data, setData] = useState({}); // { sportKey: { odds, scores, err, loading } }
  const [filter, setFilter] = useState("Upcoming");

  useEffect(() => {
    let dead = false;
    ALL_SPORTS.forEach(({ key }) => {
      setData((d) => ({ ...d, [key]: { ...(d[key] || {}), loading: true } }));
      Promise.all([
        fetch("/api/odds?sport=" + key).then((r) => r.json()).catch(() => ({ games: [] })),
        fetch("/api/scores?sport=" + key).then((r) => r.json()).catch(() => ({ games: [] })),
      ]).then(([odds, scores]) => {
        if (dead) return;
        setData((d) => ({ ...d, [key]: { odds: odds.games || [], scores: scores.games || [], loading: false, err: odds.error } }));
      });
    });
    return () => { dead = true; };
  }, []);

  const now = Date.now();

  // Merge: for each sport, build a unified list of games with odds + live/final status
  const rows = [];
  for (const { key, label } of ALL_SPORTS) {
    const bucket = data[key];
    if (!bucket) continue;
    const odds = bucket.odds || [];
    for (const g of odds) {
      const startMs = g.start ? new Date(g.start).getTime() : 0;
      const scoreMatch = (bucket.scores || []).find((s) => {
        const a = (s.away || "").toLowerCase(), h = (s.home || "").toLowerCase();
        return (g.away || "").toLowerCase().includes(a) || a.includes((g.away || "").toLowerCase()) ||
               (g.home || "").toLowerCase().includes(h) || h.includes((g.home || "").toLowerCase());
      });
      const state = scoreMatch?.state || (startMs > now ? "pre" : "pre");
      const fd = (g.books || []).find((b) => /fanduel/i.test(b.book)) || (g.books || [])[0];
      const ml = fd?.markets?.find((m) => m.type === "h2h");
      rows.push({ sport: label, key, game: g, startMs, state, scoreMatch, ml });
    }
  }
  rows.sort((a, b) => a.startMs - b.startMs);

  const upcoming = rows.filter((r) => r.state !== "post" && (r.state === "in" ? filter !== "Upcoming" : true) && r.startMs > 0);
  const shown = filter === "Upcoming" ? rows.filter((r) => r.state === "pre") : filter === "Live" ? rows.filter((r) => r.state === "in") : rows.filter((r) => r.state === "post");

  const anyLoading = ALL_SPORTS.some(({ key }) => data[key]?.loading);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <H1>Today</H1>
      <div style={{ color: T.dim, fontSize: 12.5, margin: "6px 0 12px" }}>Every sport, one view — what's still on the board today.</div>
      <Seg options={["Upcoming", "Live", "Final"]} value={filter} onChange={setFilter} />
      <div style={{ marginTop: 14 }}>
        {anyLoading && shown.length === 0 && <Spinner label="Pulling today's full schedule…" />}
        {!anyLoading && shown.length === 0 && (
          <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 30 }}>Nothing in this view right now.</div>
        )}
        {shown.map((r, i) => {
          const when = fmtWhen(r.game.start);
          const live = r.state === "in";
          const finalG = r.state === "post";
          const dkOutcomes = bookML(r.game, /draftkings/i);
          return (
            <button key={i} onClick={() => onAsk(`Pull full stats and reasoning for ${r.game.away} @ ${r.game.home} (${r.sport}) — lines, lineups, injuries, best angle, and why.`)} style={{
              display: "block", width: "100%", textAlign: "left", background: T.surface, border: `1px solid ${T.line}`,
              borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontFamily: M, fontSize: 10.5, color: T.amber, letterSpacing: 1 }}>{r.sport.toUpperCase()}</div>
                <div style={{ fontFamily: M, fontSize: 11, color: live ? T.green : T.dim }}>
                  {live ? "● LIVE " + (r.scoreMatch?.statusDetail || "") : finalG ? "FINAL" : when}
                </div>
              </div>
              <div style={{ color: T.text, fontSize: 14, fontWeight: 600, marginTop: 3 }}>
                {r.game.away} <span style={{ color: T.dim }}>@</span> {r.game.home}
              </div>
              {(live || finalG) && r.scoreMatch && (
                <div style={{ fontFamily: M, fontSize: 13, color: T.amber, marginTop: 3 }}>
                  {r.scoreMatch.awayScore} — {r.scoreMatch.homeScore}
                </div>
              )}
              {r.ml?.outcomes && r.state === "pre" && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ fontFamily: M, fontSize: 9.5, color: T.dim, width: 20 }}>FD</span>
                    {r.ml.outcomes.map((o, j) => (
                      <div key={j} style={{ fontFamily: M, fontSize: 12 }}>
                        <span style={{ color: T.dim }}>{o.name?.split(" ").slice(-1)[0]} </span>
                        <span style={{ color: o.price > 0 ? T.green : T.red }}>{usd(o.price)}</span>
                      </div>
                    ))}
                  </div>
                  {dkOutcomes && (
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 3 }}>
                      <span style={{ fontFamily: M, fontSize: 9.5, color: T.dim, width: 20 }}>DK</span>
                      {dkOutcomes.map((o, j) => (
                        <div key={j} style={{ fontFamily: M, fontSize: 12 }}>
                          <span style={{ color: T.dim }}>{o.name?.split(" ").slice(-1)[0]} </span>
                          <span style={{ color: o.price > 0 ? T.green : T.red }}>{usd(o.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================= TRENDING ================= */
function TrendingTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [sportFilter, setSportFilter] = useState("All");
  const [volTier, setVolTier] = useState("High");

  useEffect(() => {
    let dead = false;
    fetch("/api/trending").then((r) => r.json())
      .then((d) => !dead && (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => !dead && setErr(e.message));
    return () => { dead = true; };
  }, []);

  const SPORT_WORDS = /world cup|mlb|nba|nfl|nhl|match|game|win|beat|score|vs\.?|champion|finals|cup|series|goal/i;
  const VOL_FLOOR = { "Whale": 100000, "High": 25000, "All": 0 };
  const floor = VOL_FLOOR[volTier] ?? 0;

  const markets = (data?.markets || [])
    .filter((m) => m.volume24h >= floor)
    .filter((m) => sportFilter === "All" || SPORT_WORDS.test(m.question || ""));

  const fmt = (n) => n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + n;
  const errs = data?.sourceErrors || {};

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <H1>What the market's on</H1>
      <div style={{ color: T.dim, fontSize: 12.5, margin: "6px 0 12px" }}>
        Polymarket + Kalshi merged — where real money is piling up, ranked by 24h volume.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Seg options={["Whale", "High", "All"]} value={volTier} onChange={setVolTier} />
        <Seg options={["All", "Sports"]} value={sportFilter} onChange={setSportFilter} />
      </div>
      {(errs.polymarket || errs.kalshi) && (
        <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>
          {errs.polymarket && "Polymarket unavailable right now. "}
          {errs.kalshi && "Kalshi unavailable right now."}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        {!data && !err && <Spinner label="Pulling live market volume…" />}
        {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}
        {data && markets.length === 0 && (
          <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 20 }}>Nothing at this volume tier right now — try "All".</div>
        )}
        {markets.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer" style={{
            display: "block", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
            padding: "12px 14px", marginBottom: 8, textDecoration: "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ color: T.text, fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{m.question}</div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontFamily: M, color: T.amber, fontSize: 12 }}>{fmt(m.volume24h)}</div>
                <div style={{ fontFamily: M, color: T.dim, fontSize: 9.5, marginTop: 1, letterSpacing: 0.5 }}>{(m.source || "").toUpperCase()}</div>
              </div>
            </div>
            {Array.isArray(m.outcomes) && m.outcomes.length > 0 && (
              <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                {m.outcomes.slice(0, 3).map((o, i) => (
                  <div key={i} style={{ fontFamily: M, fontSize: 12 }}>
                    <span style={{ color: T.dim }}>{o.name} </span>
                    <span style={{ color: o.price > 0.5 ? T.green : T.text }}>{o.price != null ? Math.round(o.price * 100) + "¢" : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ================= MY SLIPS ================= */
function SlipsTab({ slips, setSlips }) {
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState("photo");
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState("win");
  const [importing, setImporting] = useState(false);
  const [impErr, setImpErr] = useState("");
  const [shotImage, setShotImage] = useState(null);
  const fileRef = useRef(null);

  const graded = slips.filter((s) => s && (s.result === "win" || s.result === "loss"));
  const liveCount = slips.filter((s) => s && s.result === "live").length;
  const wins = graded.filter((s) => s.result === "win").length;
  const rate = graded.length ? Math.round((wins / graded.length) * 100) : null;

  function mark(i, result) {
    const next = slips.map((s, j) => (j === i ? { ...s, result } : s));
    setSlips(next); saveSlips(next);
  }

  function onPickShot(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setImpErr("");
    compressImageFile(f).then(setShotImage).catch((err) => setImpErr(err.message));
    e.target.value = "";
  }

  async function importFromPhoto() {
    if (!shotImage || importing) return;
    setImporting(true); setImpErr("");
    try {
      const raw = await apiChat(
        [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: shotImage.media_type, data: shotImage.base64 } },
          { type: "text", text: `This is a screenshot of a bet slip (win or loss result). Read every leg, the odds, and the combined price. Respond ONLY raw JSON: {"title":"short title","legs":[{"pick":"...","game":"...","odds":"..."}],"combined_odds":"..."}` },
        ] }],
        { useSearch: false, max_tokens: 1200 }
      );
      const clean = String(raw).replace(/```json|```/g, "").trim();
      const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
      if (a < 0 || b < 0) throw new Error("Couldn't read that screenshot");
      const slip = JSON.parse(clean.slice(a, b + 1));
      slip.result = pasteResult;
      slip.created = new Date().toISOString();
      slip.imported = true;
      const next = [slip, ...slips];
      setSlips(next); saveSlips(next);
      setShotImage(null); setShowImport(false);
    } catch (e) {
      setImpErr("Couldn't read that screenshot — try a clearer photo. (" + e.message + ")");
    } finally { setImporting(false); }
  }

  async function importSlip() {
    if (!pasteText.trim() || importing) return;
    setImporting(true); setImpErr("");
    try {
      const raw = await apiChat(
        [{ role: "user", content: `Parse this bet slip into JSON. Respond ONLY raw JSON: {"title":"short title","legs":[{"pick":"...","game":"...","odds":"..."}],"combined_odds":"..."}\n\nSLIP:\n${pasteText}` }],
        { useSearch: false, max_tokens: 1000 }
      );
      const clean = String(raw).replace(/```json|```/g, "").trim();
      const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
      if (a < 0 || b < 0) throw new Error("Couldn't read that slip");
      const slip = JSON.parse(clean.slice(a, b + 1));
      slip.result = pasteResult;
      slip.created = new Date().toISOString();
      slip.imported = true;
      const next = [slip, ...slips];
      setSlips(next); saveSlips(next);
      setPasteText(""); setShowImport(false);
    } catch (e) {
      setImpErr("Couldn't parse that — try cleaner formatting. (" + e.message + ")");
    } finally { setImporting(false); }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <H1>My slips</H1>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {[["Printed", slips.length], ["Live", liveCount], ["Cashed", wins], ["Hit rate", rate == null ? "—" : rate + "%"]].map(([k, v]) => (
          <div key={k} style={{ flex: 1, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
            <div style={{ fontFamily: M, fontWeight: 600, fontSize: 20, color: k === "Hit rate" && rate != null && rate >= 50 ? T.green : T.text }}>{v}</div>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1, color: T.dim, marginTop: 2 }}>{k}</div>
          </div>
        ))}
      </div>

      <button onClick={() => setShowImport(!showImport)} style={{
        width: "100%", marginTop: 12, padding: "11px 0", borderRadius: 10, cursor: "pointer",
        background: "transparent", border: `1.5px dashed ${T.amber}88`, color: T.amber,
        fontFamily: D, fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase",
      }}>{showImport ? "Close" : "+ Log a past slip"}</button>

      {showImport && (
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[["photo", "Upload screenshot"], ["text", "Paste text"]].map(([k, label]) => (
              <button key={k} onClick={() => setImportTab(k)} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${importTab === k ? T.phosphor : T.line}`,
                background: importTab === k ? T.phosphor + "22" : "transparent", color: importTab === k ? T.phosphor : T.dim,
                fontFamily: D, fontWeight: 700, fontSize: 12.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer",
              }}>{label}</button>
            ))}
          </div>

          {importTab === "photo" ? (
            <>
              <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 8, lineHeight: 1.5 }}>
                Upload a screenshot of your FanDuel bet history — win or loss. The AI reads it directly, no typing needed.
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPickShot} style={{ display: "none" }} />
              {shotImage ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, padding: 8, marginBottom: 8 }}>
                  <img src={shotImage.dataUrl} alt="slip screenshot" style={{ height: 52, width: 52, objectFit: "cover", borderRadius: 6 }} />
                  <div style={{ flex: 1, fontSize: 12.5, color: T.dim }}>Screenshot ready</div>
                  <button onClick={() => setShotImage(null)} style={{ background: "transparent", border: "none", color: T.red, fontFamily: D, fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "uppercase" }}>Remove</button>
                </div>
              ) : (
                <button onClick={() => fileRef.current && fileRef.current.click()} style={{
                  width: "100%", padding: "20px 0", borderRadius: 10, border: `1.5px dashed ${T.line}`,
                  background: T.surface2, color: T.dim, fontFamily: D, fontWeight: 700, fontSize: 14,
                  letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", marginBottom: 8,
                }}>📷 Choose a screenshot</button>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}><Seg options={["win", "loss"]} value={pasteResult} onChange={setPasteResult} /></div>
                <button onClick={importFromPhoto} disabled={importing || !shotImage} style={{
                  background: T.amber, border: "none", borderRadius: 10, padding: "0 16px",
                  fontFamily: D, fontWeight: 700, fontSize: 15, color: "#1A1300", cursor: "pointer",
                  textTransform: "uppercase", opacity: (importing || !shotImage) ? 0.5 : 1,
                }}>{importing ? "…" : "Save"}</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 8, lineHeight: 1.5 }}>
                Paste legs from your FanDuel bet history — the AI parses it into a ticket.
              </div>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4}
                placeholder={"e.g.\nYordan Alvarez to hit a HR +320\nDodgers ML -145\nCombined +510"}
                style={{ width: "100%", background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, padding: 10, color: T.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "'Inter', sans-serif" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}><Seg options={["win", "loss"]} value={pasteResult} onChange={setPasteResult} /></div>
                <button onClick={importSlip} disabled={importing} style={{
                  background: T.amber, border: "none", borderRadius: 10, padding: "0 16px",
                  fontFamily: D, fontWeight: 700, fontSize: 15, color: "#1A1300", cursor: "pointer",
                  textTransform: "uppercase", opacity: importing ? 0.5 : 1,
                }}>{importing ? "…" : "Save"}</button>
              </div>
            </>
          )}
          {impErr && <div style={{ color: T.red, fontSize: 12.5, marginTop: 6 }}>{impErr}</div>}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {slips.map((s, i) => <Ticket key={i} slip={s} onResult={(r) => mark(i, r)} />)}
        {slips.length === 0 && (
          <div style={{ color: T.dim, fontSize: 13, textAlign: "center", marginTop: 30 }}>
            Slips you print in the builder land here for tracking.
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= APP SHELL ================= */
export default function App() {
  return <Boundary><AppInner /></Boundary>;
}

function AppInner() {
  const [tab, setTab] = useState("chat");
  const [slips, setSlips] = useState(loadSlips);
  const [askSignal, setAskSignal] = useState({ text: "", ts: 0 });
  const [cart, setCart] = useState(loadCart);
  const [reviewSignal, setReviewSignal] = useState(0);

  function addSlip(slip) {
    setSlips((prev) => { const next = [slip, ...prev]; saveSlips(next); return next; });
  }

  // Board/Today → Desk handoff. Uses a timestamp so the same question can be
  // asked twice in a row, and works without remounting the Desk (which would
  // wipe its conversation — the whole point of keeping tabs alive).
  function askFromBoard(q) { setAskSignal({ text: q, ts: Date.now() }); setTab("chat"); }

  function addToCart(item) {
    setCart((prev) => {
      if (prev.some((p) => p.id === item.id)) return prev; // already in
      const next = [...prev, item];
      saveCart(next);
      return next;
    });
  }
  function removeFromCart(id) {
    setCart((prev) => { const next = prev.filter((p) => p.id !== id); saveCart(next); return next; });
  }
  function isInCart(id) { return cart.some((p) => p.id === id); }
  function goReviewCart() { setTab("parlay"); setReviewSignal(Date.now()); }

  const TABS = [["chat", "Desk"], ["today", "Today"], ["board", "Board"], ["parlay", "Builder"], ["trend", "Trending"], ["slips", "Slips"]];

  // Every tab stays mounted at all times — only visibility toggles. This is what
  // lets Desk research keep running in the background and preserves scroll/state
  // when you switch away and come back, instead of losing everything on tab change.
  const keep = (key, node) => (
    <div style={{ display: tab === key ? "block" : "none", height: "100%" }}>{node}</div>
  );

  return (
    <div style={{ minHeight: "100dvh", display: "flex", justifyContent: "center", background: "#050708", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        body { background: #050708; }
        input::placeholder, textarea::placeholder { color: ${T.dim}99; }
        .pulse { animation: pulse 1.1s ease-in-out infinite; display: inline-block; }
        @keyframes pulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
        .ticker-track { animation: ticker-scroll 38s linear infinite; }
        @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .pulse { animation: none } .ticker-track { animation: none } }
        button:focus-visible, input:focus-visible, a:focus-visible, textarea:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px; }
        button { transition: opacity .12s ease, transform .12s ease; }
        button:active { transform: scale(0.97); }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 680, height: "100dvh", display: "flex", flexDirection: "column",
        background: `linear-gradient(180deg, ${T.bg} 0%, #090C10 100%)`,
        borderLeft: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}`,
        boxShadow: "0 0 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: 23, letterSpacing: 1.5, color: T.text, textTransform: "uppercase" }}>
            Slip<span style={{ color: T.amber }}>Lab</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="pulse" style={{ width: 6, height: 6, borderRadius: 99, background: T.phosphor, display: "inline-block" }} />
            <div style={{ fontFamily: M, fontSize: 10, color: T.dim, letterSpacing: 1.5 }}>LIVE</div>
          </div>
        </div>

        <LiveTicker />

        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <Boundary>
            {keep("chat", <ChatTabCore askSignal={askSignal} />)}
            {keep("today", <TodayTab onAsk={askFromBoard} />)}
            {keep("board", <BoardTab onAsk={askFromBoard} cart={cart} addToCart={addToCart} isInCart={isInCart} onReviewCart={goReviewCart} />)}
            {keep("parlay", <ParlayTab onSaveSlip={addSlip} cart={cart} removeFromCart={removeFromCart} clearCart={() => { setCart([]); saveCart([]); }} reviewSignal={reviewSignal} />)}
            {keep("trend", <TrendingTab />)}
            {keep("slips", <SlipsTab slips={slips} setSlips={setSlips} />)}
          </Boundary>

          {cart.length > 0 && tab !== "parlay" && (
            <button onClick={goReviewCart} style={{
              position: "absolute", left: 14, right: 14, bottom: 14,
              background: T.amber, border: "none", borderRadius: 14, padding: "13px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.1)", cursor: "pointer",
            }}>
              <span style={{ fontFamily: D, fontWeight: 800, fontSize: 15, letterSpacing: 0.5, color: "#1A1300", textTransform: "uppercase" }}>
                {cart.length} pick{cart.length > 1 ? "s" : ""} selected
              </span>
              <span style={{ fontFamily: D, fontWeight: 800, fontSize: 15, letterSpacing: 0.5, color: "#1A1300" }}>Review →</span>
            </button>
          )}
        </div>

        <div style={{ display: "flex", borderTop: `1px solid ${T.line}`, background: T.bg, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "12px 0 10px", background: "transparent", border: "none", cursor: "pointer", position: "relative",
              fontFamily: D, fontWeight: 700, fontSize: 13.5, letterSpacing: 1, textTransform: "uppercase",
              color: tab === k ? T.amber : T.dim,
            }}>
              {label}
              {k === "parlay" && cart.length > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: "50%", marginRight: -22,
                  background: T.phosphor, color: "#04201E", fontFamily: M, fontWeight: 700, fontSize: 9.5,
                  borderRadius: 99, width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center",
                }}>{cart.length}</span>
              )}
              {tab === k && <span style={{ position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2, background: T.amber, borderRadius: 2 }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatTabCore({ askSignal }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [deep, setDeep] = useState(false);
  const [image, setImage] = useState(null); // { dataUrl, media_type, base64 }
  const [imgErr, setImgErr] = useState("");
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const started = useRef(0);

  useEffect(() => { try { endRef.current?.scrollIntoView({ behavior: "smooth" }); } catch {} }, [msgs, busy]);

  function onPickImage(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setImgErr("");
    compressImageFile(f).then(setImage).catch((err) => setImgErr(err.message));
    e.target.value = "";
  }

  async function send(text) {
    const q = String(text ?? input).trim();
    if ((!q && !image) || busy) return;
    setInput("");

    // Build the user message: array content if there's an image, else plain string
    let userContent;
    let displayText = q;
    if (image) {
      userContent = [
        { type: "image", source: { type: "base64", media_type: image.media_type, data: image.base64 } },
        { type: "text", text: q || "Read this bet slip / screenshot. Break down each leg, confirm today's lines and lineups, and give me the play." },
      ];
      displayText = (q || "Read this screenshot") + "  [📷 image attached]";
    } else {
      userContent = q;
    }

    const shownMsg = { role: "user", content: displayText };
    const apiMsg = { role: "user", content: userContent };
    const shownNext = [...msgs, shownMsg];
    setMsgs(shownNext);
    setImage(null);
    setBusy(true);

    // API history: reuse prior text messages + this one (images only on current turn)
    const apiHistory = msgs.map((m) => ({ role: m.role, content: m.content })).concat([apiMsg]);
    try {
      const reply = await apiChat(apiHistory, {
        system: (deep ? DEEP_SYSTEM : CHAT_SYSTEM) + historyBlock(),
        useSearch: true,
        max_tokens: deep ? 3000 : 1500,
      });
      setMsgs((m) => [...m, { role: "assistant", content: reply || "(empty response)" }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: "Request failed: " + (e && e.message ? e.message : String(e)) }]);
    } finally { setBusy(false); }
  }

  // Fire a handed-off question from Board/Today. Uses the signal's timestamp
  // so it fires exactly once per tap, even for a repeated question, and works
  // correctly now that Desk never unmounts between tab switches.
  useEffect(() => {
    if (askSignal && askSignal.ts && askSignal.ts !== started.current) {
      started.current = askSignal.ts;
      send(askSignal.text);
    }
    // eslint-disable-next-line
  }, [askSignal]);

  const starters = [
    "Confirmed MLB lineups tonight?",
    "World Cup slate — best SOT props today",
    "Best ML anchors for a 3-leg tonight",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 8px" }}>
        {msgs.length === 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: D, fontWeight: 800, fontSize: 34, lineHeight: 1.05, textTransform: "uppercase", color: T.text }}>
              Ask the desk<span style={{ color: T.amber }}>.</span>
            </div>
            <div style={{ color: T.dim, fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>
              Live-searched lines, lineups, injuries, matchup reads — or upload a screenshot of your slip for a leg-by-leg grade.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
              {starters.map((s) => (
                <button key={s} onClick={() => send(s)} style={{
                  textAlign: "left", background: T.surface, border: `1px solid ${T.line}`, color: T.text,
                  padding: "11px 14px", borderRadius: 10, fontSize: 13.5, cursor: "pointer", fontFamily: "'Inter', sans-serif",
                }}>
                  <span style={{ color: T.amber, marginRight: 8, fontFamily: M }}>›</span>{s}
                </button>
              ))}
              <button onClick={() => setInput("Grade this slip: ")} style={{
                textAlign: "left", background: T.surface, border: `1px solid ${T.line}`, color: T.text,
                padding: "11px 14px", borderRadius: 10, fontSize: 13.5, cursor: "pointer", fontFamily: "'Inter', sans-serif",
              }}>
                <span style={{ color: T.amber, marginRight: 8, fontFamily: M }}>›</span>Grade this slip (paste your legs)
              </button>
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{
              maxWidth: "88%", background: m.role === "user" ? T.amber : T.surface,
              color: m.role === "user" ? "#1A1300" : T.text, padding: "10px 13px",
              borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap",
              border: m.role === "user" ? "none" : `1px solid ${T.line}`,
            }}>{m.content}</div>
          </div>
        ))}
        {busy && <Spinner label={deep ? "Deep research — multiple searches running…" : "Searching live data…"} />}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${T.line}` }}>
        {imgErr && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 8 }}>{imgErr}</div>}
        {image && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: 8 }}>
            <img src={image.dataUrl} alt="attached" style={{ height: 44, width: 44, objectFit: "cover", borderRadius: 6 }} />
            <div style={{ flex: 1, fontSize: 12.5, color: T.dim }}>Screenshot attached — I'll read it.</div>
            <button onClick={() => setImage(null)} style={{ background: "transparent", border: "none", color: T.red, fontFamily: D, fontWeight: 700, fontSize: 14, cursor: "pointer", textTransform: "uppercase" }}>Remove</button>
          </div>
        )}
        <button onClick={() => setDeep(!deep)} style={{
          marginBottom: 8, background: deep ? T.amber : "transparent", color: deep ? "#1A1300" : T.dim,
          border: `1.5px solid ${deep ? T.amber : T.line}`, borderRadius: 99, padding: "5px 14px",
          fontFamily: D, fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
        }}>◆ Deep research {deep ? "ON" : "OFF"}</button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => fileRef.current && fileRef.current.click()} title="Attach screenshot" style={{
            background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 14px",
            color: T.amber, fontSize: 18, cursor: "pointer",
          }}>📷</button>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={image ? "Add a note (optional)…" : "Ask about props, lineups, matchups…"} style={{
              flex: 1, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10,
              padding: "11px 13px", color: T.text, fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif",
            }} />
          <button onClick={() => send()} disabled={busy} style={{
            background: T.amber, border: "none", borderRadius: 10, padding: "0 18px",
            fontFamily: D, fontWeight: 700, fontSize: 16, letterSpacing: 0.5, color: "#1A1300",
            cursor: "pointer", opacity: busy ? 0.5 : 1, textTransform: "uppercase",
          }}>Ask</button>
        </div>
      </div>
    </div>
  );
}
