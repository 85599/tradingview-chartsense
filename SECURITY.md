# Security

ChartSense is a local tool that holds a live API key and a history of your charts. This page states what is protected,
what is not, and what you have to do yourself.

## Where keys live

Keys and chart history are written to `~/.chartsense/` (`C:\Users\<you>\.chartsense` on Windows), **outside the project
folder**, so copying, zipping, committing or publishing the source can never carry a key with it.

- Override the location with `CHARTSENSE_DATA_DIR`.
- On first run anything left in an old `.data/` folder is copied to the new location, byte-length verified, and the
  original deleted.
- `.env.local` and `.data/` are git-ignored; `.env.example` ships with empty placeholders only.
- A key can also come from the environment (`GEMINI_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`),
  which is the safer option on a shared machine.
- The UI only ever receives a masked form of a key (`AIza…abcd`). Full keys never leave the server process except in the
  Authorization/x-goog-api-key header to the provider you configured.

### If a key was ever shared

A key that appeared in an uploaded ZIP, a screenshot, a repo, or a chat log is **compromised** — delete it from the
Settings modal ("Remove key") and revoke it at the provider console (AI Studio → API keys, console.x.ai,
platform.openai.com/api-keys, openrouter.ai/settings/keys). Then paste the new key into Settings. Revocation is a human
step: the app cannot do it for you.

## Who may call the API

All four routes (`/api/analyze`, `/api/chat`, `/api/settings`, `/api/history`) check the request `Host` header:

| Situation | Behaviour |
| --- | --- |
| Host is `localhost`, `127.0.0.1`, `::1`, `0.0.0.0` or `*.localhost` | Allowed — this is the normal local use. |
| Any other host, `CHARTSENSE_ACCESS_TOKEN` not set | `403` — the instance refuses to serve strangers. |
| Any other host, token set, no/wrong token | `401`. Paste the same token in Settings → deployment token. |
| Any other host, correct token (header `x-chartsense-token` or `chartsense_token` cookie) | Allowed. |

So the safe default is: it works on your machine, and it refuses to work for anyone else until you deliberately enable it.

## Request limits

Per IP, rolling 60-second window (`lib/guard.ts`): 6 analyses, 12 chat messages, 20 settings writes, 30 history reads.
Over the limit returns `429` with `retry-after`.

Body and field limits (`lib/request.ts`): 24 MB request body, at most 4 images, each image ≤ 6 MB of base64 (~4.5 MB
decoded) and must match `data:image/(png|jpeg|jpg|webp|heic|heif);base64,…`, hint 400 characters, pasted price data
40 000 characters, chat message 4 000 characters with at most 8 messages kept, saved analysis 24 000 characters, API key
300 characters with no whitespace, model name 80 characters. Anything else is a `400` with a plain-English reason.
Provider and language values are checked against a whitelist — an unknown provider is ignored, not passed through.

The `system` prompt is built on the server; a client cannot overwrite it. The analysis JSON a client sends back into the
chat route is shape-checked and size-capped before it is put into the prompt.

## What is deliberately not protected

- **No user accounts.** One token per deployment. Anyone with the token can spend your API credits, so treat the token
  like a password and only use it for yourself.
- **No authentication for the HTML page itself.** Only the API routes are gated. If you expose port 3000 to a network,
  anyone on it can load the UI; they still cannot call the API without the token.
- **No TLS.** Terminate HTTPS in a reverse proxy you control and set the token there.
- **The chart screenshots and pasted price data leave your machine** — to the vision provider whose key you configured.
  That is inherent to using a cloud model.
- History and settings files are plain JSON with no encryption at rest. Use your OS disk encryption.

## Reporting

Open an issue only for non-sensitive problems. Mail or DM the maintainer privately for anything that involves a key,
a token, or a way to reach another user's data.
