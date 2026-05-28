<!-- BEGIN:project-context -->
# Tu Asesor V2 — Project Context for AI Agents

> Read this before doing anything. For session startup steps, see `docs/sync/SESSION_BOOTSTRAP.md`.

## What this project is
CRM + public website for an independent real estate advisor in Seville, Spain. Single Next.js app (App Router, TypeScript) deployed on Netlify. Public site has lead capture (sellers, buyers), property catalogue and chatbot widget. Admin CRM lives at `/admin/dashboard`. Main communication channel is WhatsApp Business Cloud API (Meta, official).

## Stack
- **Next.js 16.2.6** + Turbopack (App Router, TypeScript). NOT Next 15 — heed deprecation notices.
- Tailwind CSS + vanilla CSS.
- **Supabase** Postgres + RLS. Project ref: `hmzqgtitlonaxbwlhcob` (URL: `https://hmzqgtitlonaxbwlhcob.supabase.co`).
- **Netlify** hosting + serverless functions.
- **n8n Cloud** broadcast automation: `https://alvaroolopez.app.n8n.cloud`.
- **WhatsApp Cloud API** via `graph.facebook.com/v21.0` (phone number ID `1072204902649747`).

## Local development
- Repo: `https://github.com/alvarolopeez/Tu_Asesor_V2` (default branch `master`).
- **Canonical local path: `C:\dev\tu-asesor\next-app`**. Do NOT use the legacy OneDrive copy (`...\OneDrive\Escritorio\Web-tuasesor-Alvaro-refactor-organizacion\Tu asesor 1.1\next-app`) — it's a backup, kept until the user confirms migration is solid.
- Setup: place `.env.local` in repo root (gitignored) → `npm install` → `npm run build` → `npm run dev` (port 3000).
- For Meta webhook testing locally, use `ngrok` or equivalent and update the webhook URL in the Meta developer console.

## MCP servers (`.mcp.json`, gitignored — contains PATs)
1. **`gitnexus`** — code intelligence, blast radius, impact analysis. Local stdio.
2. **`github`** — repo/PR/branch ops. Auth: GitHub PAT.
3. **`supabase`** — DB schema, migrations, SQL execution. Auth: Supabase account-level PAT.
4. **`netlify`** — env vars, deploys, site config. Auth: Netlify PAT.
5. **`n8n`** — workflows on `alvaroolopez.app.n8n.cloud`. Native HTTP MCP with JWT bearer.

## Critical files & directories
| Path | Purpose |
|---|---|
| `src/lib/chatbot/engine.ts` | Central chatbot engine (multi-provider LLM + keyword fallback) |
| `src/lib/chatbot/systemPrompt.md` | Chatbot system prompt (real-estate advisor "Paula") |
| `src/app/api/webhooks/whatsapp/route.ts` | Meta inbound webhook (verify + receive + reply) |
| `src/app/api/webhooks/whatsapp/status/route.ts` | Meta credentials check |
| `src/app/api/webhooks/n8n/route.ts` | n8n bridge |
| `src/app/api/webhooks/chatwoot/route.ts` | Chatwoot receiver |
| `src/app/api/n8n/diffusion/route.ts` | Smart Matchmaker (server-side lead matching for broadcast) |
| `src/app/api/chatbot/message/route.ts` | Web widget endpoint |
| `src/app/admin/dashboard/` | Admin CRM UI |
| `docs/sync/SYNC_AI.md` | **Sync inbox between agents** — always update for cross-agent changes |
| `docs/sync/SESSION_BOOTSTRAP.md` | Startup checklist for every new AI session |
| `task.md` | Running log of completed work from prior agents |

## Cross-agent sync rules
- Any DB schema change, infra change, or cross-cutting logic change MUST be logged in `docs/sync/SYNC_AI.md` (date + summary).
- Before editing any function/class/method, run `gitnexus_impact` (see GitNexus block below).
- Before committing, run `gitnexus_detect_changes()` (see GitNexus block below).
- Build must pass (`npm run build`) before any commit.

## Known tech debt (as of 2026-05-26)
- `middleware.ts` is deprecated in Next 16 → rename to `proxy.ts` (see Next 16 docs).
- 2 moderate npm vulnerabilities — inspect with `npm audit`, non-blocking.
- `ADVISOR_WHATSAPP_PHONE` placeholder still in some flows (see SYNC_AI.md "Peticiones Pendientes").
- Production env vars on Netlify must mirror `.env.local` (see SYNC_AI.md backlog).

## What NOT to touch without explicit user confirmation
- Supabase RLS policies (security-critical for client data).
- `.env.local` secrets — never paste in PRs, commits, public PRs, or shared transcripts.
- Live Supabase migrations on production.
- n8n workflows on production — duplicate to a test workflow first.
- WhatsApp Business credentials (`APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`).
<!-- END:project-context -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Tu_Asesor_V2** (1669 symbols, 2211 relationships, 25 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Tu_Asesor_V2/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Tu_Asesor_V2/clusters` | All functional areas |
| `gitnexus://repo/Tu_Asesor_V2/processes` | All execution flows |
| `gitnexus://repo/Tu_Asesor_V2/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
