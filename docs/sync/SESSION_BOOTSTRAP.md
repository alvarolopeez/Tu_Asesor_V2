# 🚀 Session Bootstrap — Tu Asesor V2

Every new AI coding session should run this procedure on startup, in order, before doing any real work.

---

## 1. Confirm working directory

Working directory should be `C:\dev\tu-asesor\next-app`.

If the path is anywhere inside `OneDrive`, **STOP** and tell the user to relaunch Claude Code from the correct location. The OneDrive copy is a legacy backup; never edit it.

Quick check:
```bash
pwd
# expected: /c/dev/tu-asesor/next-app (or C:\dev\tu-asesor\next-app on Windows)
```

---

## 2. Verify the 5 MCPs are loaded and responding

Ping each one with a trivial call and report status to user (✅ / ❌):

| MCP | Quick check |
|---|---|
| `gitnexus` | `gitnexus://repo/Tu_Asesor_V2/context` resource read — should return codebase overview with symbol count |
| `github` | List repos for owner `alvarolopeez` — should include `Tu_Asesor_V2` |
| `supabase` | List projects — should include project ref `hmzqgtitlonaxbwlhcob` |
| `netlify` | List sites — should include the Tu Asesor site |
| `n8n` | List workflows — should include `SCHdZGrCyWVvBsMZ` (WhatsApp Bot), `6E0AP0gqLUliPQtN` (Smart Matchmaker), `QikfXMJumWbpI3wL` (Nuevo Lead), `VnXhrEh2G8AeR0DT` (Seguimiento) |

If ANY fails:
- Stop and tell the user which one failed and the error.
- Common causes: PAT expired, `.mcp.json` not loaded (wrong cwd?), Claude Code session not restarted after config change.
- Do not proceed to real work until resolved.

---

## 3. Check GitNexus index freshness

```
gitnexus://repo/Tu_Asesor_V2/context
```

The context resource reports last-analyzed timestamp. If it's older than the most recent commit on `master`, the index is stale. Offer to run:

```bash
npx gitnexus analyze
```

Stale index ≠ blocker, but `impact` and `detect_changes` will be less accurate.

---

## 4. Read recent project context

Read (or re-read) in this order:
1. `AGENTS.md` — top section "Project Context for AI Agents" (auto-loaded but confirm).
2. `docs/sync/SYNC_AI.md` — at least the last 2-3 entries to know what other agents have touched recently.
3. `task.md` — current task log from prior agents.
4. `git log --oneline -10` — last 10 commits to see recent direction.

---

## 5. Greet user with a status report

Format:

```
✅ Sesión inicializada en C:\dev\tu-asesor\next-app
MCPs: gitnexus ✅ | github ✅ | supabase ✅ | netlify ✅ | n8n ✅
Rama: master @ <commit-hash> "<commit-msg>"
GitNexus index: <fresco | desactualizado>
Pendientes en SYNC_AI.md: <N items o "ninguno">

¿Por dónde quieres empezar?
```

---

## Common operations cheat sheet

### Edit any function/class/method
1. `gitnexus_impact({target: "symbolName", direction: "upstream"})` → report blast radius.
2. If HIGH/CRITICAL risk: warn user, get confirmation.
3. Edit the symbol.
4. Before commit: `gitnexus_detect_changes()` to verify scope.

### Database schema change
1. Log intent in `docs/sync/SYNC_AI.md` (date + what + why).
2. Write SQL migration file under `supabase/migrations/` (if convention exists) or via Supabase MCP.
3. Apply via Supabase MCP after user confirms.
4. Update RLS policies in the same migration if needed.

### New n8n workflow
1. Discuss with user first (cost, integration impact).
2. Create on `alvaroolopez.app.n8n.cloud` via n8n MCP.
3. Log workflow ID, webhook URL, and purpose in `SYNC_AI.md`.

### Deploy
1. Make sure `npm run build` passes locally.
2. Commit + push to `master`.
3. Netlify auto-deploys; verify via `netlify` MCP (`list deploys`, check status).

### Renaming a symbol
- NEVER use find-and-replace blindly.
- Use `gitnexus_rename` which understands the call graph.

---

## What's where

- **Repo on GitHub:** https://github.com/alvarolopeez/Tu_Asesor_V2
- **n8n Cloud:** https://alvaroolopez.app.n8n.cloud
- **Supabase project:** `hmzqgtitlonaxbwlhcob` (`https://hmzqgtitlonaxbwlhcob.supabase.co`)
- **Meta WhatsApp:** App ID `1018904287367632`, Phone ID `1072204902649747`, Business Account `860433866401549`
- **Production site:** managed by Netlify (use `netlify` MCP to get the URL/deploys)
