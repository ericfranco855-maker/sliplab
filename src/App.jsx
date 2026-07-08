import { useState, useRef, useEffect } from "react";

/* ================= THEME ================= */
const T = {
  bg: "#0D1015", surface: "#151A22", surface2: "#1C232E", line: "#262F3C",
  paper: "#F5F1E6", paperInk: "#17130A", amber: "#FFB627",
  green: "#43D98A", red: "#F26D6D", text: "#E8ECF2", dim: "#8B96A5",
};
const D = "'Barlow Condensed', sans-serif";
const M = "'IBM Plex Mono', monospace";

/* ================= API HELPERS ================= */
async function apiChat(messages, { system, useSearch = true, model } = {}) {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, useSearch, model }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.text;
}

const CHAT_SYSTEM = `You are SlipLab, a sharp sports research agent for an experienced bettor. Always web search for current lines, confirmed lineups, injuries, and matchups before answering. Be direct and concise: the read, the number, a clear lean or swap. No hedging walls. Use betting shorthand freely (SGP, ML, juice, SOT, TNB). If something can't be confirmed, say exactly what's unconfirmed.`;

// Builds a summary of the user's tracked slips so the AI knows what's been hitting
function historyBlock() {
  const slips = loadSlips().filter((s) => s.result);
  if (!slips.length) return "";
  const lines = slips.slice(0, 20).map((s) => {
    const legs = (s.legs || []).map((l) => l.pick).join(" + ");
    return `[${s.result.toUpperCase()}] ${legs} (${s.combined_odds || "?"})`;
  });
  return `\n\nUSER'S TRACKED SLIP HISTORY (learn their patterns — what leg types and odds ranges have cashed vs died for them, and factor that into recommendations):\n${lines.join("\n")}`;
}

const PARLAY_SYSTEM = `You are a parlay construction engine. You will be given live sportsbook lines. Build from those exact numbers; use web search only to confirm lineups and injuries. Respond ONLY with raw JSON, no fences, matching:
{"title":"short slip title","legs":[{"pick":"team/player + market + line","game":"matchup","odds":"-115","why":"one-sentence data-backed reason"}],"combined_odds":"+450","risk_note":"one sentence on correlation/risk","confidence":"A-"}`;

/* ================= SLIP STORAGE ================= */
const loadSlips = () => { try { return JSON.parse(localStorage.getItem("sliplab_slips") || "[]"); } catch { return []; } };
const saveSlips = (s) => localStorage.setItem("sliplab_slips", JSON.stringify(s));

/* ================= SMALL PARTS ================= */
const Spinner = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.dim, fontSize: 13, padding: "6px 0" }}>
    <span className="pulse" style={{ width: 8, height: 8, borderRadius: 99, background: T.amber }} />{label}
  </div>
);

const SectionTitle = ({ children }) => (
  <div style={{ fontFamily: D, fontWeight: 800, fontSize: 28, textTransform: "uppercase", color: T.text }}>{children}</div>
);

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: 3, gap: 3 }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
          background: value === o ? T.amber : "transparent", color: value === o ? "#1A1300" : T.dim,
          fontFamily: D, fontWeight: 700, fontSize: 14.5, letterSpacing: 0.5, textTransform: "uppercase",
        }}>{o}</button>
      ))}
    </div>
  );
}

/* ================= TICKET ================= */
function Ticket({ slip, onResult }) {
  const status = slip.result; // undefined | "win" | "loss"
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
        {(slip.legs || []).map((leg, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: i < slip.legs.length - 1 ? `1px solid ${T.paperInk}18` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{leg.pick}</div>
              <div style={{ fontFamily: M, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", color: String(leg.odds).startsWith("-") ? "#A33" : "#1B7A46" }}>{leg.odds}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "#5A5340", marginTop: 2 }}>{leg.game}</div>
            <div style={{ fontSize: 12, color: "#3A3527", marginTop: 3, lineHeight: 1.4 }}>{leg.why}</div>
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

/* ================= RESEARCH TAB ================= */
function ChatTab() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  const starters = ["Confirmed MLB lineups tonight?", "World Cup slate — best SOT props today", "Grade this slip: (paste your legs)"];

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setBusy(true);
    try {
      const reply = await apiChat(next, { system: CHAT_SYSTEM + historyBlock(), useSearch: true });
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: "Request failed: " + e.message }]);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 8px" }}>
        {msgs.length === 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: D, fontWeight: 800, fontSize: 34, lineHeight: 1.05, textTransform: "uppercase", color: T.text }}>
              Ask the desk<span style={{ color: T.amber }}>.</span>
            </div>
            <div style={{ color: T.dim, fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>
              Live-searched lines, lineups, injuries, matchup reads — or paste a full slip for a leg-by-leg grade.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
              {starters.map((s) => (
                <button key={s} onClick={() => s.includes("paste") ? setInput("Grade this slip: ") : send(s)} style={{
                  textAlign: "left", background: T.surface, border: `1px solid ${T.line}`, color: T.text,
                  padding: "11px 14px", borderRadius: 10, fontSize: 13.5, cursor: "pointer",
                }}>
                  <span style={{ color: T.amber, marginRight: 8, fontFamily: M }}>›</span>{s}
                </button>
              ))}
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
        {busy && <Spinner label="Searching live data…" />}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about props, lineups, matchups…" style={{
              flex: 1, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10,
              padding: "11px 13px", color: T.text, fontSize: 14, outline: "none",
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

/* ================= PARLAY TAB ================= */
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
      // 1) Pull real FanDuel/DK lines from our odds endpoint
      setPhase("Pulling live FanDuel lines…");
      const sportKey = sport === "MLB" ? "mlb" : sport === "World Cup" ? "worldcup" : "mlb";
      let linesBlock = "No live lines available — confirm current odds via search.";
      try {
        const r = await fetch("/api/odds?sport=" + sportKey);
        const d = await r.json();
        if (d.games?.length) {
          linesBlock = d.games.slice(0, 12).map((g) => {
            const fd = g.books.find((b) => /fanduel/i.test(b.book)) || g.books[0];
            const ml = fd?.markets.find((m) => m.type === "h2h");
            const mlStr = ml ? ml.outcomes.map((o) => `${o.name} ${o.price > 0 ? "+" : ""}${o.price}`).join(" / ") : "";
            return `${g.away} @ ${g.home} — ML: ${mlStr}`;
          }).join("\n");
        }
      } catch { /* fall through with search-only */ }

      // 2) Build the slip from real numbers
      setPhase("Confirming lineups & building…");
      const prompt = `LIVE LINES:\n${linesBlock}\n\nBuild a ${legs}-leg ${style.toLowerCase()} parlay for today's ${sport} slate using these lines. ${
        style === "Safe" ? "Target +150 to +250 combined, high-floor legs." :
        style === "Balanced" ? "Target +300 to +500 combined." :
        "Target +600 or longer with at least one upside prop."
      } Return ONLY the JSON.`;
      const raw = await apiChat([{ role: "user", content: prompt }], { system: PARLAY_SYSTEM + historyBlock(), useSearch: true });
      const clean = raw.replace(/```json|```/g, "").trim();
      const slip = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      slip.created = new Date().toISOString();
      setSlips([slip, ...slips]);
      onSaveSlip(slip);
    } catch (e) {
      setErr("Couldn't build that slip — run it again. (" + e.message + ")");
    } finally { setBusy(false); setPhase(""); }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <SectionTitle>Build a slip</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        <div><div style={lbl}>Slate</div><Seg options={["MLB", "World Cup", "Mixed"]} value={sport} onChange={setSport} /></div>
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
const lbl = { fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.dim, marginBottom: 6 };

/* ================= TRENDING TAB (Polymarket) ================= */
function TrendingTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    fetch("/api/trending").then((r) => r.json()).then((d) => d.error ? setErr(d.error) : setData(d)).catch((e) => setErr(e.message));
  }, []);

  const SPORT_WORDS = /world cup|mlb|nba|nfl|nhl|match|game|win|beat|score|vs\.?|champion|finals|cup|series|goal/i;
  const markets = (data?.markets || []).filter((m) => filter === "All" || SPORT_WORDS.test(m.question));
  const fmt = (n) => n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + n;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 14px 20px" }}>
      <SectionTitle>What the market's on</SectionTitle>
      <div style={{ color: T.dim, fontSize: 12.5, margin: "6px 0 12px" }}>
        Live Polymarket volume — where real money is actually going, ranked by 24h action.
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
            {m.outcomes?.length > 0 && (
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

/* ================= MY SLIPS TAB ================= */
function SlipsTab({ slips, setSlips }) {
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState("win");
  const [importing, setImporting] = useState(false);
  const [impErr, setImpErr] = useState("");

  const graded = slips.filter((s) => s.result);
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
        { useSearch: false }
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const slip = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
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
      <SectionTitle>My slips</SectionTitle>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {[
          ["Printed", slips.length],
          ["Cashed", wins],
          ["Hit rate", rate == null ? "—" : rate + "%"],
        ].map(([k, v]) => (
          <div key={k} style={{ flex: 1, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
            <div style={{ fontFamily: M, fontWeight: 600, fontSize: 20, color: k === "Hit rate" && rate >= 50 ? T.green : T.text }}>{v}</div>
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
            Paste legs from FanDuel (copy from bet history) — the AI parses it into a ticket. Log your old wins and losses so recommendations learn what hits for you.
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
  const [tab, setTab] = useState("chat");
  const [slips, setSlips] = useState(loadSlips);

  function addSlip(slip) {
    const next = [slip, ...slips];
    setSlips(next); saveSlips(next);
  }

  const TABS = [["chat", "Research"], ["parlay", "Builder"], ["trend", "Trending"], ["slips", "My Slips"]];

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: T.bg, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        body { background: ${T.bg}; }
        input::placeholder { color: ${T.dim}99; }
        .pulse { animation: pulse 1.1s ease-in-out infinite; display: inline-block; }
        @keyframes pulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
        @media (prefers-reduced-motion: reduce) { .pulse { animation: none } }
        button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ fontFamily: D, fontWeight: 800, fontSize: 22, letterSpacing: 1.5, color: T.text, textTransform: "uppercase" }}>
          Slip<span style={{ color: T.amber }}>Lab</span>
        </div>
        <div style={{ fontFamily: M, fontSize: 10.5, color: T.dim, letterSpacing: 1 }}>LIVE DATA</div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "chat" && <ChatTab />}
        {tab === "parlay" && <ParlayTab onSaveSlip={addSlip} />}
        {tab === "trend" && <TrendingTab />}
        {tab === "slips" && <SlipsTab slips={slips} setSlips={setSlips} />}
      </div>

      <div style={{ display: "flex", borderTop: `1px solid ${T.line}`, background: T.bg, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "12px 0 10px", background: "transparent", border: "none", cursor: "pointer",
            fontFamily: D, fontWeight: 700, fontSize: 14.5, letterSpacing: 1, textTransform: "uppercase",
            color: tab === k ? T.amber : T.dim,
            borderTop: tab === k ? `2px solid ${T.amber}` : "2px solid transparent",
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}
