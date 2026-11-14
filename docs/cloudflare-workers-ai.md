# Cloudflare Workers AI setup

The main Vantage-ARS app uses Cloudflare **as an optional AI inference API**
for its ten defined agents (`src/lib/office/ai-provider.ts` calls
`…/accounts/{ACCOUNT}/ai/v1/chat/completions`). The main app deploys to
**Vercel, Docker, or plain Node** — not to Cloudflare Workers. A separate
companion Worker exists under `workers/vantage-ars/` with its own D1 database,
AI binding, Durable Workflow, and deployment workflow. It is not required for
the main app's AI inference and its current live status is not established by
this guide.

`wrangler.jsonc` in this repo is context only for the main app's AI model
default (no secrets).
`export` in a terminal sets a variable for that shell alone; the running
server needs the values in **its own** environment (below).

## 1. Account id

Your account id is the 32-hex segment in the Cloudflare Dashboard URL:

```text
8501d3eeac693b7ada630058ee5e081a
```

It is already the right shape (the provider regex requires
`/^[a-f0-9]{32}$/i`). The id is not a secret, but keep it in host env
rather than committing it.

## 2. API token (the secret part)

1. Cloudflare Dashboard → **My Profile → API Tokens → Create Token**.
2. Use the **Workers AI** template (or a custom token with
   **Account → Workers AI → Read**… chat completions require write-style
   inference scope on some plans; if calls 403, widen to the template).
3. Copy the token once. It cannot be viewed again.

Never paste the token into chat, git, `wrangler.jsonc`, or `.env.example`.
Only into host environment settings.

## 3. Set the environment where the server runs

All three are needed for Workers AI (or set `XAI_API_KEY` instead to use xAI):

| Variable                | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | `8501d3eeac693b7ada630058ee5e081a`                            |
| `CLOUDFLARE_API_TOKEN`  | the token from step 2                                         |
| `WORKERS_AI_MODEL`      | optional, default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`  |
| `AI_PROVIDER`           | set to `xai` to prefer xAI when both providers are configured |
| `XAI_API_KEY`           | alternative xAI credential when Workers AI is not selected    |
| `XAI_MODEL`             | optional xAI model override                                   |

- **Local:** copy `.env.example` to `.env` and fill the three in.
- **Vercel:** Project → Settings → Environment Variables → add all three
  (all environments), then redeploy.
- **Docker:** put them in the host `.env` read by `docker-compose.yml`.

With neither Cloudflare nor xAI set, the staff answer that they are
unavailable — everything else still works.

## 4. Verify

```sh
npm run cf:check            # offline wiring report, secrets hidden
curl http://localhost:8080/api/ai/status   # live probe after `npm run dev`
```

Expect `"provider": "workers-ai"`. Then send the office chat a question;
a model-backed reply (not "unavailable") confirms end-to-end inference.

## 5. Secret hygiene (required)

A `FOUNDER_SETUP_TOKEN` was previously committed in `wrangler.jsonc` and has
been removed. Treat it as exposed:

1. Generate a fresh one: `openssl rand -base64 32`.
2. Set it in host env, complete founder setup at `/office`, then **remove
   the variable and redeploy** (sign-up closes once a founder exists).
3. Revoke the previously committed token and verify it is absent from every
   production and preview environment. The repository cannot verify whether
   this has been done.
4. If the Cloudflare API token ever shared a screen, chat log, or commit with
   the old value, revoke it and create a replacement scoped only to the
   account, Worker scripts, and D1 resources required by the deployment.
5. Verify the founder account exists and the setup token is absent from the
   host secret manager after setup. These are operator checks, not facts proven
   by a local test or this guide.

## Troubleshooting

| Symptom                     | Cause / fix                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- |
| `cf:check` says `MALFORMED` | Whitespace or truncated id; must be exactly 32 hex chars.                     |
| Status probe says `none`    | Token or id missing on the _server_ host; `export` locally is not enough.     |
| Model 401/403               | Token lacks Workers AI scope, or belongs to another account.                  |
| Model 429/5xx               | The app retries once, then reports "did not answer in time". Wait and retry.  |
| `AI_PROVIDER=xai` set       | Forces xAI even when Cloudflare is configured; unset it to prefer Workers AI. |
