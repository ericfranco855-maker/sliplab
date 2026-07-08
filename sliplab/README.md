# SlipLab — launch guide

AI sports research app: live-searched chat, parlay builder on real FanDuel/DK lines, Polymarket money-flow feed, and a slip tracker. Free to run except AI usage.

---

## Step 1 — Get your two keys (10 min)

1. **Anthropic key** (the brain): console.anthropic.com → sign up → API Keys → create key. Add $5 credit to start.
2. **Odds key** (real sportsbook lines, free): the-odds-api.com → free tier → copy your key. 500 requests/month, and the app caches for 10 minutes so that goes far.

## Step 2 — Put the code on GitHub (5 min)

1. github.com → New repository → name it `sliplab`.
2. Upload this whole folder's contents (drag and drop works in the browser).

## Step 3 — Deploy on Vercel free (5 min)

1. vercel.com → sign up with GitHub → Add New Project → import `sliplab`.
2. Framework preset: **Vite** (it should auto-detect).
3. Before deploying, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `ODDS_API_KEY` = your Odds API key
4. Deploy. You get a live URL like `sliplab.vercel.app`.

## Step 4 — Install it like a real app (1 min)

Open your URL on your phone → Share → **Add to Home Screen**. Full-screen icon, no browser bar. That's your app, on your phone, for $0.

## Step 5 — Test everything

- Research tab: ask for tonight's confirmed lineups.
- Builder: print a 3-leg MLB slip — it pulls live FanDuel lines first.
- Trending: should show live Polymarket volume with no key needed.
- My Slips: mark a slip win/loss and watch the hit rate update.

---

## Running locally (optional)

```
npm install
npm install -g vercel
vercel dev        # runs frontend + API functions together at localhost:3000
```

---

## What's real vs. what's next

**Working today:** AI chat with live web search · parlay builder seeded with real FanDuel/DraftKings moneylines · Polymarket 24h volume feed (free public API) · slip tracking with hit rate · installable PWA.

**Known limits to be honest about:**
- The free odds tier covers moneylines/totals, not player props. Prop lines still come from web search, so verify on FanDuel before locking.
- "What everyone is betting" — true public-betting percentages (like ticket % vs. handle %) come from paid feeds (Action Network, Sports Insights). Polymarket volume is the best free proxy for real money flow. Budget option later: the Odds API paid tiers, or partner data once you have users.
- Hit-rate tracking is per-device (localStorage). User accounts need a database — see roadmap.

## Roadmap to a paid app

1. **Accounts + cloud sync** — Supabase free tier (auth + database). Slips follow users across devices. This also unlocks a real **community leaderboard**: rank users by tracked hit rate.
2. **Player props data** — upgrade The Odds API plan (~$30/mo gets prop markets) and feed those lines into the builder the same way moneylines flow in now.
3. **Paywall** — Stripe (web) is the fastest path: free tier = 3 AI questions/day, paid = unlimited + builder. Add a `subscriptions` table in Supabase and check it in `/api/chat`.
4. **App stores** — wrap with Capacitor (free) to ship the same code to iOS/Android. Apple requires: 17+ rating, "insights not gambling advice" disclosure, and a responsible-gambling resource link — copy how RotoBot words its listing.
5. **Cost control as you grow** — route quick questions to `claude-haiku-4-5` and reserve `claude-sonnet-4-6` for parlay builds; cache aggressively.

## File map

```
api/chat.js       Claude proxy (your key stays server-side)
api/odds.js       Live FanDuel/DK lines, cached 10 min
api/trending.js   Polymarket top markets by 24h volume, cached 5 min
src/App.jsx       The whole UI: Research / Builder / Trending / My Slips
public/           PWA manifest, service worker, icons
```
