# Minimi Autonomous Chat Agent with Grounded Web Search

> **Target:** Autonomous Chat Agent with Grounded Web Search & Episodic Temporal Memory  
> **Evaluation Focus:** Speed, factual correctness, temporal disambiguation, and comparative delta auditing.

---

## Quickstart (< 30 Seconds)

### 1. Install Dependencies
```bash
npm install
# or
pnpm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
- **`GEMINI_API_KEY`** *(Optional)*: Free tier key from [Google AI Studio](https://aistudio.google.com/). If omitted, the agent operates in deterministic grounded mode.
- **`TAVILY_API_KEY`** *(Optional)*: Free tier key from [Tavily](https://tavily.com/). If omitted, the agent automatically falls back to an unauthenticated DuckDuckGo scraper.

### 3. Run Development Server
```bash
npm run dev
# or
pnpm dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Evaluation Benchmark Scenarios

The repository is pre-seeded with baseline evaluation interactions (`agent.db` auto-seeds on first launch or via `npm run seed`):
- **November 3 Turn:** User consulted on Postgres hosting options (Supabase, Neon, AWS RDS, Railway).
- **Monday Turn:** User shortlisted 5 CRM tools for a 20-person sales team (HubSpot, Pipedrive, Close, Zoho, Copper).

### Test Queries in the UI
Click any of the quick-action benchmark cards on the home screen:
1. *"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"*
2. *"What did I ask you on 3 November? Is your answer still correct today?"*
3. *"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"*

### Test Queries via CLI
You can also run the full benchmark suite directly from the command line:
```bash
npm run test:benchmark
```

---

## System Architecture

```
                             USER INPUT QUERY
   ("On Monday we shortlisted 5 CRM tools... Has any changed pricing since?")
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: INTENT & TEMPORAL DISAMBIGUATION                                   │
│ • Current Reference: CURRENT_TIMESTAMP (Tue, Nov 10, 2026)                  │
│ • Chrono-Node Extraction: "On Monday" -> [2026-11-09T00:00:00Z to 23:59:59Z]  │
│ • Reference Resolver: Detects retrospective & comparative intent            │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: EPISODIC CONVERSATION MEMORY RETRIEVAL (SQLite)                    │
│ • Query: SELECT * FROM messages WHERE created_at BETWEEN start AND end      │
│ • Extracted Entities: ['HubSpot', 'Pipedrive', 'Close', 'Zoho', 'Copper']   │
│ • Extracted Baseline: Pricing & features recorded in Monday's answer        │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: TARGETED SEARCH QUERY GENERATION & PARALLEL DISPATCH                │
│ • Sub-query 1: "HubSpot pricing changes updates 2026"                       │
│ • Sub-query 2: "Close pricing changelog updates 2026"                       │
│ • Sub-query 3: "Pipedrive pricing changes updates 2026"                     │
│ • Execution: Promise.allSettled() parallel retrieval (< 1.2s total)         │
│ • Providers: Tavily AI Search with zero-key DuckDuckGo scraper fallback     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: GROUNDED DELTA VERIFICATION & SYNTHESIS                            │
│ • Evaluator Prompt: Compares Historical State vs. Fresh Search Data         │
│ • Strict Fact-Checking: Confirmed Changes vs. Unchanged Specifications      │
│ • Output Generation: Formatted response with inline Markdown citations [1]  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
                      STREAMING SSE RESPONSE TO CLIENT
            (Live status chips: Memory -> Search -> Delta -> Synthesis)
```

---

## Architectural Highlights

- **Episodic & Temporal Long-Term Memory:** Persistent local SQLite storage with sub-second ISO timestamps, cross-conversation entity tracking, and conversation threading.
- **Universal SQLite Resilience:** Automatically loads native `better-sqlite3`, seamlessly falling back to WebAssembly `sql.js` on platforms without C++ build tools, persisting to `agent.db`.
- **Zero-Key DuckDuckGo Fallback:** Guarantees that the repository runs out of the box even without any external API keys configured.
- **Delta-Verification Engine:** Directly answers questions regarding changes over time by evaluating what was agreed upon at $T_0$ vs what is current at $T_1$.
- **Design-Taste Frontend:** Clean, high-performance interface with dark technical palette, live SSE pipeline stepper, and interactive citations inspector.

---

## Project Structure

```
├── README.md                    # Quickstart & benchmark instructions
├── DESIGN.md                    # 1-page architectural defense
├── package.json                 # Scripts: dev, build, start, seed, test:benchmark
├── tsconfig.json                # Strict TypeScript configuration
├── .env.example                 # Environment documentation
├── scripts/
│   ├── seed.ts                  # Seeds baseline evaluation turns (Nov 3, Monday)
│   └── test_eval.ts             # CLI benchmark execution test
└── src/
    ├── db/
    │   ├── index.ts             # SQLite connection & WASM fallback persistence
    │   └── schema.ts            # Tables, indexes, and schema definitions
    ├── agent/
    │   ├── engine.ts            # 5-stage orchestrator & state machine
    │   ├── temporal.ts          # Chrono-node natural language date resolver
    │   ├── memory.ts            # SQLite episodic recall & entity lookup
    │   ├── search.ts            # Tavily search + DuckDuckGo fallback scraper
    │   ├── delta.ts             # Comparative fact-checker & diff engine
    │   └── prompts.ts           # System prompts & grounding instructions
    └── app/
        ├── api/
        │   ├── chat/route.ts    # SSE streaming endpoint with tool-status events
        │   └── conversations/   # Conversation history and re-seed route
        ├── page.tsx             # Chat interface with benchmark cards & inspector
        ├── layout.tsx           # Layout shell
        └── globals.css          # Theme tokens & animations
```

---

## License
MIT

