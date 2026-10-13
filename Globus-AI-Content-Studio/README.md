# Globus AI Content Studio — Phase 1 & 2

Files (paste each into its own file in Apps Script, same names):
`Config.gs`, `Setup.gs`, `Menu.gs`

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
