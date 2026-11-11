# Accounts, sync and recipe suggestions

Kookapp remains local-first. Ingredients, groups, saved recipes and marinades are stored on the device and can be synced to one private account. OpenAI requests run through a Supabase Edge Function; the OpenAI key is never sent to the browser. The app now uses OpenAI only.

## 1. Set up the Kookapp Supabase project

The app is configured for the Supabase project `ytcbsmqiwyezhoazeeql`. In that project's **SQL Editor**, run [`supabase-schema.sql`](./supabase-schema.sql). It creates the private data table, revision-checked save function and atomic daily usage counter. Only the signed-in user can read their own data; writes go through the revision-checked function.

In **Authentication**, enable email/password sign-up. Set the site URL to your deployed app URL and add the same URL to the allowed redirect URLs. Also add the local development URL when testing. If email confirmation is enabled, users must confirm their email; Supabase's default email service is intended for testing and has limited delivery capacity.

## 2. Configure and deploy the recipe function

An administrator must configure the OpenAI key **once for the project**, not for each account. In **Edge Functions → Secrets**, add `OPENAI_API_KEY` with your OpenAI API key. The key stays on Supabase and is used automatically for signed-in accounts. Optionally add:

| Secret | Default | Purpose |
|---|---|---|
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model supporting structured JSON output |
| `RECIPE_DAILY_LIMIT` | `20` | Requests per account per UTC day (1–10000) |

Deploy [`supabase/functions/recipe-suggestions/index.ts`](./supabase/functions/recipe-suggestions/index.ts) as `recipe-suggestions`, using the Supabase dashboard or `supabase functions deploy recipe-suggestions`. Keep JWT verification enabled. The function also verifies the user's token itself. The usage counter is reserved atomically before an OpenAI request; failed requests after reservation also count toward the limit.

**Cost warning:** sign-up is open, so a per-account limit does not stop someone from creating multiple accounts. Configure Supabase authentication rate limits and email confirmation, monitor usage, and set OpenAI project spending limits and alerts. Restrict sign-ups separately if the risk is unacceptable.

## 3. Use the app

The Supabase project URL and publishable key are built into [`cloud.js`](./cloud.js), so users do not need to enter or edit a connection. These values are public; never put an OpenAI key, Supabase secret or `service_role` key in client code. If the project changes, update the public values in that file and redeploy the app.

The account screen opens automatically when the app starts without a saved session. Create an account, sign in, or continue without an account to use local data. Once signed in, the session is retained on that device and refreshed automatically; an expired or rejected session may require signing in again. The first time a device connects to an account, choose **Upload this device to cloud** to keep its data, or **Use cloud copy on this device** to replace it with an existing cloud copy. The app asks for confirmation. Use the same account on your other devices.

Local edits save immediately and sync when connected. When an offline device and the cloud both changed, sync pauses and asks which copy to keep; copies are not merged. **Check sync** retries a failed sync or refreshes the cloud state. Sign-out leaves local data on the device, so do not use a shared device for private data without clearing its browser storage afterward. Use one tab per device while editing.

Email confirmation links can be opened on another device. For local development, serve the app over HTTP on `localhost` or `127.0.0.1` and add that URL to Supabase's allowed redirects.

## Existing API keys

Older versions saved AI keys in browser storage. This update does not use or upload those keys, but it does not delete them automatically. Remove the old `apiKey`, `key_gemini`, `key_claude` and `key_openai` entries from each device's browser storage when you no longer need them, and rotate any key that may have been exposed. Set the OpenAI key only as the server secret above.

## Tests

Run `node --test tests/cloud.test.mjs tests/recipe-suggestions.test.mjs` with Node.js 24 to test account configuration and the Edge Function with mocked Supabase and OpenAI responses. These tests do not deploy the function or exercise the database policies; verify sign-up, email confirmation, sync and recipe generation against your configured Supabase project as well.
