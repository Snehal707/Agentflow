# AgentFlow

Private monorepo for the live AgentFlow stack on **Arc Testnet**: Circle **x402** agents, chat + AgentPay UI, Hermes brain, PM2 production.

Backend (`server.ts`, `agents/`, `facilitator/`) and frontend (`agentflow-frontend/`) ship together.

- **Private GitHub:** `pvt` → https://github.com/Snehal707/agentflow-pvt  
- **Prod process list:** [`ecosystem.config.cjs`](ecosystem.config.cjs) (PM2)

## Product UI (current)

Nav from `agentflow-frontend/lib/appData.ts`:

| Route | Purpose |
|-------|---------|
| `/chat` | Main app — wallet JWT chat; money actions confirm with YES (incl. “Yes, swap & send” when swap has a recipient) |
| `/pay` | AgentPay — `.arc` handles, send/request, contacts, schedule/split/batch, invoices, history |
| `/pay/[handle]` | Public pay page for a handle |
| `/funding` | Circle Gateway + move funds to the **execution (DCW)** wallet (`/vault` re-exports this page) |
| `/portfolio` | Portfolio / holdings UI |
| `/agents` | Agent Store (catalog from `lib/coreAgentSpecs.ts`) |
| `/telegram` | Link wallet to the Telegram bot |
| `/docs` | Marketing docs (also fetches `GET /api/docs`) |
| `/` | Landing → `/chat` |

**Wallets (as implemented in the funding UI):** connected EOA (WalletConnect) for auth; **Gateway** for funding USDC; **execution wallet (DCW)** for agent spend. See `GatewayWalletPanel` / `/funding`.

## DeFi providers (from code, not marketing)

| Area | What the code does |
|------|---------------------|
| **Swap** | `lib/dex/router.ts` quotes **`swaparc`**, **`achswap`**, and **`lunex`**, then picks a route. Not Lunex-only. |
| **Vault** | `lib/vault/router.ts` — **Lunex only** today (`luneUSDC`, `luneEURC` in `lib/vault/providers/lunex.ts`). |
| **Pred markets** | `lib/predmarket/router.ts` — **AchMarket only** (`lib/predmarket/providers/achmarket.ts`). |
| **Bridge** | CCTP into Arc; source chains listed in `lib/bridge/supportedSources.ts`. |
| **AgentPay tokens** | USDC and EURC (`lib/agentpay-transfer.ts`). |

## Agent Store catalog

Source of truth: `lib/coreAgentSpecs.ts`.

| Slug | Name | Notes from that file |
|------|------|----------------------|
| `research` | Research | Research → Analyst → Writer pipeline |
| `swap` | Swap | Live Arc swap flows with guardrails |
| `vault` | Vault | Lunex vaults (testnet, experimental) |
| `predmarket` | Prediction Markets | AchMarket (testnet, experimental) |
| `bridge` | Bridge | USDC into Arc, CCTP progress |
| `portfolio` | Portfolio | Balances, positions, transfers, PnL |
| `invoice` | Invoice | Invoice review / business settlement |
| `schedule` | Schedule | Recurring USDC schedules |
| `split` | Split | Split USDC across recipients |
| `batch` | Batch | Bulk USDC from CSV |
| `vision` | Vision | Images / text / single-page PDF |
| `transcribe` | Voice Input | Short voice → text |

Prices: `*_AGENT_PRICE` env keys in that file (fallback prices included).

## How the stack runs

### Local — `npm run dev:stack`

`scripts/start-dev-stack.cjs` starts (separate processes, `EMBEDDED_AGENT_SERVERS=false`):

- frontend (`:3005`), Hermes, facilitator, research, analyst, writer, API (`server.ts` `:4000`)
- swap, vault, predmarket, bridge, portfolio, invoice, vision, transcribe, schedule, split, batch
- Telegram bot (`lib/telegram-bot.ts`)

It does **not** start `crons/`.

Health: `GET :4000/health`, `GET :4000/health/stack`, `GET :3005/api/health`, Hermes `/health`.

Windows: if `:8000` is occupied, set in `.env` (also documented in `.env.example`):

```env
AGENTFLOW_HERMES_PORT=8001
AGENTFLOW_HERMES_URL=http://127.0.0.1:8001
```

Helpers: `npm run stack:detach`, `npm run dev:stack:clean`, `node scripts/stack-cleanup.cjs`. Prefer `FACILITATOR_PORT=3010`.

Hermes process: `scripts/start-hermes.cjs` → local **`hermes-brain/`** (gitignored checkout + venv). Skills pack in-repo: `hermes-skills/`.

### Production — PM2

```bash
npm install
npm run build --prefix agentflow-frontend
pm2 start ecosystem.config.cjs    # first time
pm2 reload all                    # after pull
pm2 save && pm2 startup
```

Apps in `ecosystem.config.cjs`: hermes, **backend** (`server.ts` — embeds facilitator + research/analyst/writer), swap, vault, portfolio, vision, transcribe, bridge, invoice, split, batch, schedule, predmarket, **cron**, **telegram-bot**, **frontend** (`next start -p 3005`).

### Default ports

| Service | Port |
|---------|------|
| Frontend | 3005 |
| API | 4000 (`PORT`) |
| Hermes | 8000 (`AGENTFLOW_HERMES_PORT`) |
| Facilitator | 3010 (`FACILITATOR_PORT`; code default can be 3000 — set 3010 locally) |
| Research / Analyst / Writer | 3001 / 3002 / 3003 |
| Swap / Vault / Predmarket / Portfolio | 3011 / 3012 / 3013 / 3014 |
| Invoice / Vision / Transcribe | 3015 / 3016 / 3017 |
| Schedule / Split / Batch / Bridge | 3018 / 3019 / 3020 / 3021 |

## Hermes (two clients)

1. **Python gateway** — `scripts/start-hermes.cjs` / PM2 `agentflow-hermes`; chat brain talking to API brain tools.
2. **HTTP LLM client** — `lib/hermes.ts` (`OpenAI` SDK, `HERMES_BASE_URL` / `HERMES_API_KEY`, default host `inference-api.nousresearch.com`). Used for research pipeline and other direct model calls — not the same process as the gateway.

## Quick start

1. Node **20+**, npm **8+**, `CLOUDSMITH_TOKEN` ([.npmrc](.npmrc)).
2. Copy [.env.example](.env.example) → `.env`; `npm run setup`.
3. Copy `agentflow-frontend/.env.local.example` → `agentflow-frontend/.env.local` (`NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; optional Telegram username; `OPENAI_API_KEY` for transcribe as noted there).
4. Ensure `hermes-brain/` is set up for local Hermes.
5. `npm run dev:stack` → open `http://localhost:3005`.

## Environment

Do not invent a full env list here — use [.env.example](.env.example) and `agentflow-frontend/.env.local.example`.

Areas you will hit for a working stack: Cloudsmith, Hermes API + gateway ports/keys, Circle DCW, JWT, Redis/Supabase (runtime), facilitator/agent ports, Telegram, WalletConnect, Firecrawl/search as needed for research, `MAINNET_KILL_SWITCH` for money safety.

DB access notes: [docs/db-access-security.md](docs/db-access-security.md). Known issues: [docs/known-issues.md](docs/known-issues.md).

## Repo layout

```text
server.ts                 API gateway (+ embeds facilitator/R/A/W in PM2 backend)
agentflow-frontend/       Next.js UI
agents/                   Agent microservices
facilitator/              x402 facilitator
api/                      Routers mounted by server.ts
lib/                      Shared backend (dex/vault/predmarket routers, brain, AgentPay, …)
hermes-skills/            Skills for Hermes gateway
crons/                    PM2 cron worker only
scripts/                  dev:stack, Hermes launcher, QA
ecosystem.config.cjs      Production PM2 apps
docs/                     Ops / historical notes
contracts/ · foundry/     On-chain tooling
```

Gitignored: `hermes-brain/`, `tmp/`, `.logs/`, `.agentflow-telemetry/`, etc. (see `.gitignore`).

## Arc Testnet

Chain ID `5042002` · RPC `https://rpc.testnet.arc.network` · Explorer https://testnet.arcscan.app · USDC as gas

## Out of scope for this README

Not the live product path: `/dashboard`, `orchestrator/` / `dev:orchestrator`, Railway docs, one-off probe scripts. Prefer code + `ecosystem.config.cjs` over old writeups.
