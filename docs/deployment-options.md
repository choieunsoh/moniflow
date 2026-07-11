# Moniflow — deployment & architecture options

- **Date:** 2026-07-11
- **Status:** Reference note. PoC continues on the **local stack (Option 0)**; no option is committed.
- **Context:** single user, mobile-first, private financial data, currently server-rendered
  Next.js + `better-sqlite3`.

Related: the WASM/OPFS PWA path (Option 2) is fully designed and planned —
`docs/superpowers/specs/2026-07-11-wasm-sqlite-opfs-pwa-design.md` +
`docs/superpowers/plans/2026-07-11-wasm-sqlite-opfs-pwa-plan-1-data-layer.md`. Parked until the
PoC earns it.

## The three axes

Every option combines: **where data lives**, **where the app runs**, **how the phone reaches it.**

| # | Data lives | App runs | Phone reaches it | Code change | Cost/mo | Best when |
|---|---|---|---|---|---|---|
| **0. Local PoC (now)** | server SQLite file | `next dev`/`start` on your box | Tailscale | none | $0 (your machine + Tailscale free) | Validating the idea. Current state. |
| **1. Self-host** | server SQLite file | Docker on Pi/mini-PC/VPS | Tailscale (or CF Access public) | tiny (Dockerfile) | $0 on owned hardware¹; ~$5 on a VPS | PoC works, want always-on without a laptop awake |
| **2. Client PWA** | browser OPFS (WASM) | static host *or* installed PWA | install to home screen | large (Plan 1+2) | $0 (CF Pages / GH Pages / Vercel hobby) | True offline + installed feel, single device |
| **3. Hosted SQLite** | Turso/libSQL (cloud) | Vercel/CF serverless | public URL + auth | medium (libsql driver swap) | $0 (Turso free + host free + CF Access free) | Ever go multi-device / off your network |
| **4. Hosted Postgres** | Neon/Supabase | Vercel serverless | public URL + auth | large (dialect change) | $0 free tier → ~$25 paid² | ❌ overkill — don't |

¹ One-time hardware only: Raspberry Pi ~$50–80 or mini-PC ~$100–200, then ~$0/mo (electricity).
Tailscale personal plan is free (up to 100 devices).
² Free tiers pause/sleep on inactivity (Supabase) or cap compute (Neon); the ~$25 is Supabase Pro
if you outgrow free — which a single-user tracker won't.

## Natural staging (lazy path)

```
PoC useful? ──no──→ stop, you learned it cheap
     │yes
     ▼
Need always-on without a laptop awake?
  └─ yes → Option 1 (Docker + Tailscale)   ← smallest step
           │
           ▼
Which itch dominates?
  ├─ "offline + installed, one device" → Option 2 (PWA, spec + Plan 1 ready)
  └─ "use it on 2+ devices / share"    → Option 3 (Turso + auth)
```

## Takeaways

- **Cost is not a differentiator.** Every sane option is $0/mo at single-user scale; free tiers
  dwarf the usage. Decide on **code effort** and **which itch dominates**, not price. The only
  money is an optional one-time Pi/mini-PC for Option 1.
- **Options 1 and 2 keep SQLite + drizzle** — never leave the known stack. Option 1 keeps the
  *server* model; Option 2 moves it *client-side*. That is the only real fork.
- **Option 3 is the "I was wrong about single-device" escape hatch.** drizzle has a `libsql`
  driver, so `schema.ts` and most queries survive a Turso move; it's mostly rewriting
  `db/client.ts` and adding auth. Know it exists; don't build it now.
- **Skip Option 4.** A single-user spending tracker has no reason to run Postgres.
- **For the PoC itself, change nothing:** keep `npm run dev:web`; `tailscale serve 4010` puts it
  on your phone today with zero code.
