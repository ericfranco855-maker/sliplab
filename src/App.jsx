import React, { useState, useRef, useEffect } from "react";

/* ================= THEME ================= */
const T = {
  bg: "#0D1015", surface: "#151A22", surface2: "#1C232E", line: "#262F3C",
  paper: "#F5F1E6", paperInk: "#17130A", amber: "#FFB627",
  green: "#43D98A", red: "#F26D6D", text: "#E8ECF2", dim: "#8B96A5",
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
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, useSearch, max_tokens }),
  });
  const d = await r.json().catch(() => ({ error: "Bad response from server" }));
  if (d.error) throw new Error(d.error);
  return d.text || "";
}

const CHAT_SYSTEM = `You are SlipLab, a sharp sports research agent for an experienced bettor. Always web search for current lines, confirmed lineups, injuries, and matchups before answering. Be direct and concise: the read, the number, a clear lean or swap. No hedging walls. Use betting shorthand freely (SGP, ML, juice, SOT, TNB). If something can't be confirmed, say exactly what's unconfirmed.`;

const DEEP_SYSTEM = `You are SlipLab in Deep Research mode. Run multiple web searches: confirmed lineups/injuries first, then lines and line movement, then matchup splits and recent form. Structure the answer: THE READ (2-3 sentences), THE NUMBERS (key stats/lines found), THE PLAY (clear recommendation with alternatives). Be thorough but never pad. Flag anything unconfirmed.`;

const PARLAY_SYSTEM = `You are a parlay construction engine. You will be given live sportsbook lines. Build from those exact numbers; use web search only to confirm lineups and injuries. Respond ONLY with raw JSON, no fences, matching:
{"title":"short slip title","legs":[{"pick":"team/player + market + line","game":"matchup","odds":"-115","why":"one-sentence data-backed reason"}],"combined_odds":"+450","risk_note":"one sentence on correlation/risk","confidence":"A-"}`;

/* ================= SLIP STORAGE ================= */
const loadSlips = () => {
  try {
    const raw = JSON.parse(localStorage.getItem("sliplab_slips") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => s && typeof s === "object");
  } catch { return []; }
};
const saveSlips = (s) => { try { localStorage.setItem("sliplab_slips", JSON.stringify(s)); } catch {} };

function historyBlock() {
  const slips = loadSlips().filter((s) => s && s.result);
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
  <div style={{ fontFamily: D, fontWeight: 800, fontSize: 28, textTransform: "uppercase", color: T.text }}>{children}</div>
);

const lbl = { fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.dim, marginBottom: 6 };

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: 3, gap: 3 }}>
      {options.map((o) => (
        <button key={String(o)} onClick={() => onChange(o)} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
          background: value === o ? T.amber : "transparent", color: value === o ? "#1A1300" : T.dim,
          fontFamily: D, fontWeight: 700, fontSize: 14.5, letterSpacing: 0.5, textTransform: "uppercase",
        }}>{String(o)}</button>
      ))}
    </div>
  );
}

const usd = (p) => (p > 0 ? "+" + p : String(p));

/* ================= TICKET ================= */
function Ticket({ slip, onResult }) {
  if (!slip) return null;
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const status = slip.result;
  return (
    <div style={{ margin: "10px 0", opacity: status === "loss" ? 0.75 : 1 }}>
      <div style={{ background: T.paper, color: T.paperInk, borderRadius: "10px 10px 0 0", padding: "14px 16px 10px", boxShadow: "0 6px 24px rgba(0,0,0,0.45)", position: "relative", overflow: "hidden" }}>
        {status && (
          <div style={{
            position: "absolute", top: 18, right: -34, transform: "rotate(35deg)", padding: "3px 40px",
            background: status === "win" ? "#1B7A46" : "#A33", color: "#FFF",
            fontFamily: D, fontWeight: 800, fontSize: 13, letterSpacing: 2,
          }}>{status === "win" ? "CASHED" : "DEAD"}</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: 20, letterSpacing: 0.5, textTransform: "uppercase" }}>{slip.title || "Generated Slip"}</div>
          {slip.confidence && <div style={{ fontFamily: M, fontWeight: 600, fontSize: 12, background: T.paperInk, color: T.paper, padding: "2px 8px", borderRadius: 4 }}>{slip.confidence}</div>}
        </div>
        <div style={{ borderTop: `1.5px dashed ${T.paperInk}33`, margin: "10px 0" }} />
        {legs.map((leg, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: i < legs.length - 1 ? `1px solid ${T.paperInk}18` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{leg?.pick}</div>
              <div style={{ fontFamily: M, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", color: String(leg?.odds || "").startsWith("-") ? "#A33" : "#1B7A46" }}>{leg?.odds}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "#5A5340", marginTop: 2 }}>{leg?.game}</div>
            {leg?.why && <div style={{ fontSize: 12, color: "#3A3527", marginTop: 3, lineHeight: 1.4 }}>{leg.why}</div>}
          </div>
        ))}
        <div style={{ borderTop: `1.5px dashed ${T.paperInk}33`, margin: "10px 0 8px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#6B6350" }}>Combined</span>
          <span style={{ fontFamily: M, fontWeight: 600, fontSize: 18 }}>{slip.combined_odds}</span>
        </div>
        {slip.risk_note && <div style={{ fontSize: 11.5, color: "#6B6350", marginTop: 6, fontStyle: "italic" }}>{slip.risk_note}</div>}
        {onResult && !status && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
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
const PROPS_SYSTEM = `You are a player-prop ranking engine. FIRST web search today's date and which games are actually being played today in the requested sport, then confirmed lineups/injuries, then the current prop lines. Only include players in games happening today. Respond ONLY with raw JSON, no fences: {"slate_note":"e.g. 8 MLB games today","props":[{"player":"name","prop":"market + line (e.g. Over 6.5 Ks)","game":"AWY @ HOM","odds":"-115","est_prob":62,"why":"one short data reason"}]} — return 12 to 18 props ranked by est_prob descending, spread across multiple games, not all from one player. est_prob is your honest estimated hit percentage (integer 1-99), never inflated. If no games today, return {"slate_note":"No games today","props":[]}.`;

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
        <div style={{ width: Math.min(pct, 100) + "%", height: "100%", background: color }} />
      </div>
      <span style={{ fontFamily: M, fontWeight: 600, fontSize: 13, color, minWidth: 38, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function BoardTab({ onAsk }) {
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
    if (ml?.outcomes?.length >= 2) {
      for (const o of devig(ml.outcomes)) {
        edge.push({ pick: o.name + " ML", game: g.away + " @ " + g.home, odds: usd(o.price), pct: Math.round(o.prob * 100), start: g.start });
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0 12px" }}>
        <Seg options={["Edge", "Props", "Lines"]} value={mode} onChange={setMode} />
        <Seg options={["mlb", "worldcup", "nba", "nfl", "nhl"]} value={sport} onChange={setSport} />
      </div>

      {loading && mode !== "Props" && <Spinner label="Pulling the board…" />}
      {err && mode !== "Props" && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}

      {mode === "Props" && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.dim, margin: "4px 0 8px" }}>
            Every player prop ranked by hit % · today's slate only
          </div>
          <button onClick={scoreProps} disabled={propBusy} style={{
            width: "100%", background: T.amber, border: "none", borderRadius: 12, padding: "13px 0",
            fontFamily: D, fontWeight: 800, fontSize: 18, letterSpacing: 1, color: "#1A1300",
            cursor: "pointer", textTransform: "uppercase", opacity: propBusy ? 0.5 : 1,
          }}>{propBusy ? "Ranking the slate…" : props_ ? "Refresh rankings" : `Rank today's ${sport.toUpperCase()} props`}</button>
          {propBusy && <Spinner label="Checking today's games, lineups, and lines…" />}
          {propErr && <div style={{ color: T.red, fontSize: 13, marginTop: 8 }}>{propErr}</div>}
          {slateNote && <div style={{ fontFamily: M, fontSize: 12, color: T.green, margin: "10px 0 4px" }}>● {slateNote}</div>}
          {(props_ || []).map((p, i) => (
            <button key={i} onClick={() => onAsk(`Deep read: ${p.player} ${p.prop} (${p.game}). Worth a leg today?`)} style={{
              display: "block", width: "100%", textAlign: "left", background: T.surface, border: `1px solid ${T.line}`,
              borderRadius: 12, padding: "11px 14px", marginTop: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ color: T.text, fontSize: 13.5, fontWeight: 600 }}>
                  <span style={{ fontFamily: M, color: T.amber, fontSize: 12, marginRight: 8 }}>{String(i + 1).padStart(2, "0")}</span>
                  {p.player} · {p.prop}
                </div>
                {p.odds && <div style={{ fontFamily: M, fontSize: 12.5, color: String(p.odds).startsWith("-") ? T.red : T.green }}>{p.odds}</div>}
              </div>
              <div style={{ fontSize: 11, color: T.dim, margin: "3px 0 6px" }}>{p.game}{p.why ? " — " + p.why : ""}</div>
              <ProbBar pct={Math.round(p.est_prob || 0)} />
            </button>
          ))}
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
          {edge.map((e, i) => (
            <button key={i} onClick={() => onAsk(`Is ${e.pick} (${e.game}) worth anchoring a slip? Lines, lineups, injuries, best angle.`)} style={{
              display: "block", width: "100%", textAlign: "left", background: T.surface, border: `1px solid ${T.line}`,
              borderRadius: 12, padding: "11px 14px", marginBottom: 7, cursor: "pointer", fontFamily: "'Inter', sans-serif",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ color: T.text, fontSize: 13.5, fontWeight: 600 }}>
                  <span style={{ fontFamily: M, color: T.dim, fontSize: 11, marginRight: 8 }}>{String(i + 1).padStart(2, "0")}</span>
                  {e.pick}
                </div>
                <div style={{ fontFamily: M, fontSize: 12.5, color: String(e.odds).startsWith("-") ? T.red : T.green }}>{e.odds}</div>
              </div>
              <div style={{ fontSize: 11, color: T.dim, margin: "3px 0 6px" }}>{e.game}</div>
              <ProbBar pct={e.pct} />
            </button>
          ))}
          <div style={{ fontSize: 11, color: T.dim, marginTop: 12, lineHeight: 1.5 }}>
            Want player props ranked instead? Switch to the Props tab above.
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
            const when = g.start ? new Date(g.start).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
            return (
              <button key={g.id} onClick={() => onAsk(`Full read on ${g.away} @ ${g.home} — lines, lineups, injuries, best angle.`)} style={{
                display: "block", width: "100%", textAlign: "left", background: T.surface, border: `1px solid ${T.line}`,
                borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{g.away} <span style={{ color: T.dim }}>@</span> {g.home}</div>
                  <div style={{ fontFamily: M, fontSize: 11, color: T.dim }}>{when}</div>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= BUILDER ================= */
function ParlayTab({ onSaveSlip }) {
  const [sport, setSport] = useState("MLB");
  const [legs, setLegs] = useState(3);
  const [style, setStyle] = useState("Balanced");
  const [slips, setSlips] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [err, setErr] = useState("");

  async function build() {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      setPhase("Pulling live FanDuel lines…");
      const sportKey = sport === "World Cup" ? "worldcup" : "mlb";
      let linesBlock = "No live lines available — confirm current odds via search.";
      try {
        const r = await fetch("/api/odds?sport=" + sportKey);
        const d = await r.json();
        if (Array.isArray(d.games) && d.games.length) {
          linesBlock = d.games.slice(0, 12).map((g) => {
            const fd = (g.books || []).find((b) => /fanduel/i.test(b.book)) || (g.books || [])[0];
            const ml = fd?.markets?.find((m) => m.type === "h2h");
            const mlStr = ml ? ml.outcomes.map((o) => `${o.name} ${usd(o.price)}`).join(" / ") : "";
            return `${g.away} @ ${g.home} — ML: ${mlStr}`;
          }).join("\n");
        }
      } catch {}

      setPhase("Confirming lineups & building…");
      const prompt = `LIVE LINES:\n${linesBlock}\n\nBuild a ${legs}-leg ${style.toLowerCase()} parlay for today's ${sport} slate using these lines. ${
        style === "Safe" ? "Target +150 to +250 combined, high-floor legs." :
        style === "Balanced" ? "Target +300 to +500 combined." :
        "Target +600 or longer with at least one upside prop."
      } Return ONLY the JSON.`;
      const raw = await apiChat([{ role: "user", content: prompt }], { system: PARLAY_SYSTEM + historyBlock(), useSearch: true, max_tokens: 2000 });
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

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <H1>Build a slip</H1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        <div><div style={lbl}>Slate</div><Seg options={["MLB", "World Cup"]} value={sport} onChange={setSport} /></div>
        <div><div style={lbl}>Legs</div><Seg options={[2, 3, 4, 5]} value={legs} onChange={setLegs} /></div>
        <div><div style={lbl}>Risk</div><Seg options={["Safe", "Balanced", "Longshot"]} value={style} onChange={setStyle} /></div>
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
    </div>
  );
}

/* ================= TRENDING ================= */
function TrendingTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    let dead = false;
    fetch("/api/trending").then((r) => r.json())
      .then((d) => !dead && (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => !dead && setErr(e.message));
    return () => { dead = true; };
  }, []);

  const SPORT_WORDS = /world cup|mlb|nba|nfl|nhl|match|game|win|beat|score|vs\.?|champion|finals|cup|series|goal/i;
  const markets = (data?.markets || []).filter((m) => filter === "All" || SPORT_WORDS.test(m.question || ""));
  const fmt = (n) => n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + n;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <H1>What the market's on</H1>
      <div style={{ color: T.dim, fontSize: 12.5, margin: "6px 0 12px" }}>
        Live Polymarket volume — where real money is going, ranked by 24h action.
      </div>
      <Seg options={["All", "Sports"]} value={filter} onChange={setFilter} />
      <div style={{ marginTop: 14 }}>
        {!data && !err && <Spinner label="Pulling live market volume…" />}
        {err && <div style={{ color: T.red, fontSize: 13 }}>{err}</div>}
        {markets.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer" style={{
            display: "block", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
            padding: "12px 14px", marginBottom: 8, textDecoration: "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ color: T.text, fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{m.question}</div>
              <div style={{ fontFamily: M, color: T.amber, fontSize: 12, whiteSpace: "nowrap" }}>{fmt(m.volume24h)}<span style={{ color: T.dim }}> /24h</span></div>
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
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState("win");
  const [importing, setImporting] = useState(false);
  const [impErr, setImpErr] = useState("");

  const graded = slips.filter((s) => s && s.result);
  const wins = graded.filter((s) => s.result === "win").length;
  const rate = graded.length ? Math.round((wins / graded.length) * 100) : null;

  function mark(i, result) {
    const next = slips.map((s, j) => (j === i ? { ...s, result } : s));
    setSlips(next); saveSlips(next);
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
        {[["Printed", slips.length], ["Cashed", wins], ["Hit rate", rate == null ? "—" : rate + "%"]].map(([k, v]) => (
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
          <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 8, lineHeight: 1.5 }}>
            Paste legs from your FanDuel bet history — the AI parses it into a ticket. Log old wins and losses so recommendations learn what hits for you.
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
  const [pendingAsk, setPendingAsk] = useState("");

  function addSlip(slip) {
    setSlips((prev) => { const next = [slip, ...prev]; saveSlips(next); return next; });
  }

  // Board → Desk handoff
  function askFromBoard(q) { setPendingAsk(q); setTab("chat"); }

  const TABS = [["chat", "Desk"], ["board", "Board"], ["parlay", "Builder"], ["trend", "Trending"], ["slips", "Slips"]];

  return (
    <div style={{ minHeight: "100dvh", display: "flex", justifyContent: "center", background: "#080A0E", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        body { background: #080A0E; }
        input::placeholder, textarea::placeholder { color: ${T.dim}99; }
        .pulse { animation: pulse 1.1s ease-in-out infinite; display: inline-block; }
        @keyframes pulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
        @media (prefers-reduced-motion: reduce) { .pulse { animation: none } }
        button:focus-visible, input:focus-visible, a:focus-visible, textarea:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 680, height: "100dvh", display: "flex", flexDirection: "column", background: T.bg, borderLeft: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: 22, letterSpacing: 1.5, color: T.text, textTransform: "uppercase" }}>
            Slip<span style={{ color: T.amber }}>Lab</span>
          </div>
          <div style={{ fontFamily: M, fontSize: 10.5, color: T.dim, letterSpacing: 1 }}>LIVE DATA</div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Boundary>
            {tab === "chat" && <ChatTabCore key={pendingAsk || "chat"} initialQuestion={pendingAsk} onConsumed={() => setPendingAsk("")} />}
            {tab === "board" && <BoardTab onAsk={askFromBoard} />}
            {tab === "parlay" && <ParlayTab onSaveSlip={addSlip} />}
            {tab === "trend" && <TrendingTab />}
            {tab === "slips" && <SlipsTab slips={slips} setSlips={setSlips} />}
          </Boundary>
        </div>

        <div style={{ display: "flex", borderTop: `1px solid ${T.line}`, background: T.bg, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "12px 0 10px", background: "transparent", border: "none", cursor: "pointer",
              fontFamily: D, fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase",
              color: tab === k ? T.amber : T.dim,
              borderTop: tab === k ? `2px solid ${T.amber}` : "2px solid transparent",
            }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatTabCore({ initialQuestion, onConsumed }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [deep, setDeep] = useState(false);
  const [image, setImage] = useState(null); // { dataUrl, media_type, base64 }
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const started = useRef(false);

  useEffect(() => { try { endRef.current?.scrollIntoView({ behavior: "smooth" }); } catch {} }, [msgs, busy]);

  function onPickImage(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(",")[1];
      setImage({ dataUrl, media_type: f.type, base64 });
    };
    reader.readAsDataURL(f);
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

  // Fire a handed-off question exactly once, safely
  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      send(initialQuestion);
      if (typeof onConsumed === "function") onConsumed();
    }
    // eslint-disable-next-line
  }, [initialQuestion]);

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
