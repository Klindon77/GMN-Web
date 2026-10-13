# Globus AI Content Studio — Phases 1–3

Files (paste each into its own file in Apps Script, same names):
`Config.gs`, `Setup.gs`, `Menu.gs`, `Log.gs`, `Gemini.gs`, `Article.gs`
(Phase 3 changed `Config.gs`, `Setup.gs`, `Menu.gs` — re-paste those three too.)

## Install (about 5 minutes)
1. Open your content Google Sheet. Menu: **Extensions > Apps Script**.
   (Create it from the Sheet so the script is "bound" to it.)
2. If a default `Code.gs` has only an empty `myFunction`, you may delete it.
   **Do not delete other code you recognise** (e.g. a newsletter `doPost`) — see note below.
3. Click **+ > Script**, name it `Config`, paste `Config.gs`. Repeat for `Setup` and `Menu`.
4. Click **Save**. Select `setupContentStudio` in the function dropdown, click **Run**.
5. Authorize: Review permissions > choose your account > Advanced > "Go to project (unsafe)" > Allow.
   (Google shows this warning for every personal script. It only asks for access to this spreadsheet.)
6. Expected: alert "Setup complete" and a new **Content** tab with 9 headers and the sample topic.
7. Run `testSheetsConnection`. Expected: all lines `PASS`, "Sheets test PASSED".
8. Reload the Sheet: the **Globus AI Studio** menu appears.

## Common errors
| Message | Fix |
|---|---|
| `Cannot read properties of null` / "No active spreadsheet" | Script was made at script.google.com, not from the Sheet. Recreate via Extensions > Apps Script. |
| "STOPPED: headers do not match" | A tab named `Content` already has different headings. Rename that tab or fix row 1. Nothing was changed. |
| Authorization blocked | Advanced > Go to project (unsafe). If your Workspace admin blocks it, use a personal Gmail. |
| Menu missing | Reload the Sheet; or run `onOpen` once from the editor. |

## Existing newsletter script
`index.html` posts newsletter emails to a deployed Apps Script web app. Its code was not
available to me. If it lives in this same Sheet's script project, keep its `doPost`/`doGet`
and don't also define another `onOpen`/`doPost` with the same name (duplicates overwrite each other).
Tell me if you see one, and I'll merge them.

---
# Phase 3 — Gemini article generation

## What you need
A free Gemini API key: https://aistudio.google.com/apikey (sign in with Google, create a key).
No credit card is needed for the free tier, and **do not enable billing**.

## Steps
1. In Apps Script, add new files `Log`, `Gemini`, `Article` (paste each). Re-paste `Config`, `Setup`, `Menu`. Save.
2. Reload the Sheet. Menu **Globus AI Studio > Set Gemini API Key**, paste the key, OK.
   (The key is stored in Project Settings > Script Properties as `GEMINI_API_KEY`. Never put it in a cell or in code.)
3. Run **Setup Content Studio** again (safe) — it also creates a `Logs` tab.
4. **Test Connections**. Expected: Sheets PASS, then Gemini: key found, N models, "Model ... replied: OK".
   If it says the model is not in your list, add Script Property `GEMINI_MODEL` with one of the listed names.
5. Click the sample topic row (row 2), menu **Generate Article**. Takes 20–90 seconds.
   Expected: Status becomes `REVIEW_REQUIRED`; columns B, C, D, F filled. Hover the Article cell for review notes.

## Rules built in
- Only `TOPIC` or `ERROR` rows are generated; finished rows are never overwritten.
- Generated rows are always `REVIEW_REQUIRED` — you check facts before anything moves on. Nothing is sent to Blogger yet.
- Sources are limited to official organisations' main websites; live link-checking and current-data research come in Phase 4.
- Errors go to the `Logs` tab with secrets removed.

## Free tier notes (verify yourself — I could not open Google's official pages)
Third-party sources say: free tier covers Flash models, not Pro; limits are per-minute and per-day and change often;
free-tier prompts may be used by Google to improve its products; image generation has no free tier.
Check your real limits at https://aistudio.google.com/rate-limit.

| Error | Meaning / fix |
|---|---|
| Key is missing | Run Set Gemini API Key |
| Error 400 invalid key | Wrong/expired key. Make a new one, set it again |
| Error 404 model not found | Set `GEMINI_MODEL` to a name shown by Test Connections |
| Error 429 | Free quota reached. Wait (minutes/next day) — never enable billing without deciding to |
| Output cut off (MAX_TOKENS) | Run again; or raise `GEMINI_MAX_OUTPUT_TOKENS` in Config.gs |
| Row stuck on GENERATING | The run timed out. Set Status to `ERROR` or `TOPIC` by hand and retry |
