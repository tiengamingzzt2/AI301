# An Tín Renewal Agent — online

The online deployment includes the complete existing CSV/XLSX cleaning and review workflow. A bundled Worker handles `/api/run`, `/api/repair` and `/api/ai`; static files and the downloadable Excel template are embedded in the same deployment. The Gemini key is stored as a secret runtime variable named `GEMINI_API_KEY`, never in the source bundle or browser assets. No dependency on the local PC or port 4173 remains.

Uploaded datasets are processed within the request and are not written to server storage. Browser selections, drafts and local audit history retain the existing browser-scoped behavior. Local datasets, outputs, credentials and logs are excluded from this source checkout.
Gemini receives a compact data quality summary, analysis totals or the single contract being used to draft an email only after a visitor clicks an AI button. Deterministic validation, monetary calculations and human approvals remain in the application. AI requests are bounded and limited per visitor in each Worker instance.
For contract files with broad usage, ticket or price gaps, visitors can download the template and reupload, or explicitly continue with partial analysis. Required contract identity/date errors still block renewal recommendations. The optional industry, business model and analysis goal fields are sent only when an AI button is clicked; generic tables can request a sample-based business analysis.
The current Sites Worker outbound network receives Google's `User location is not supported for the API use` response. The same key works from the local Node server. The AI buttons explain this limitation and keep drafts intact; the deterministic online workflow remains available. The Worker can send AI tasks to a separate regional backend when `AI_RELAY_URL` and secret `AI_RELAY_TOKEN` are configured. The backend in `D:/BTVN/ai-relay-vercel` is prepared for Vercel `iad1`; its region and Gemini response must be tested before enabling the route on this Site. No relay token or Gemini key belongs in browser assets.

## Update

From this directory:

1. `node scripts/sync-local.mjs D:/BTVN` copies the current Agent logic and public assets.
2. `pnpm install --frozen-lockfile` installs the pinned build dependencies.
3. `node scripts/build.mjs` creates `dist/server/index.js` and `dist/.openai/hosting.json`.
4. `node --test tests/worker.test.mjs` verifies the actual bundled request handler.
5. Use the Sites source workflow for the project ID in `.openai/hosting.json`, then save and deploy that pushed source and its built archive. Preserve the site's audience.

The local server and starter remain in `D:/BTVN` and can still run independently.
