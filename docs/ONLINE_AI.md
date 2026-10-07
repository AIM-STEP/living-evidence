# Online AI access

The public tool pages can use `https://ai.aimsetp.com/api/eligibility` instead of a visitor's localhost. The API is a dedicated loopback process on port 8767; never route a public hostname to the local site server (8765) or Ollama (11434).

## Deployment order

1. Keep the existing local model server and Ollama running. Install `tools/requirements-online.txt` in the gateway's Python environment.
2. Store `{"allowedEmails":["reviewer@example.com"]}` in `/Users/achieve/AIM-STEP/private/online-model.json`, mode 0600. This is an additional API allowlist; existing Firestore project access rules remain unchanged.
3. Run `python3 tools/online_model_gateway.py` or install its dedicated `com.aimstep.online-model` LaunchAgent. An unauthenticated GET to `http://127.0.0.1:8767/api/eligibility/health` must return 401.
4. Authorize with `cloudflared tunnel login` and select `aimsetp.com`. The account certificate remains outside the site at `~/.cloudflared/cert.pem`. Create a dedicated locally managed tunnel (deployed name: `aimstep-online-api`) and retain its credential JSON privately. Do not replace any other application's tunnel.
5. Route only `ai.aimsetp.com` to this tunnel (`cloudflared tunnel route dns <UUID> ai.aimsetp.com`). Its private config `/Users/achieve/AIM-STEP/private/online-tunnel.yml` maps this exact hostname to `http://127.0.0.1:8767`, with a catch-all 404. The dedicated `com.aimstep.online-api-tunnel` LaunchAgent starts cloudflared using this config and HTTP2 transport. Outbound TCP 7844 must be reachable. Do not add an interactive Cloudflare Access login in front of this API: Firebase already authorizes requests, and browser API preflights must reach it.
6. Verify the public health endpoint returns 401 without a token and 200 with a valid, verified, allowed Firebase identity. Verify a different signed-in user cannot poll another user's jobs.
7. Deploy the four tool pages and `app/online-model.js` **only after the public route works**. The frontend does not fall back to visitors' localhost on public domains. Local site pages continue to use the existing local backend.
8. In a second device's browser sign into AIM-STEP and exercise local generation and TypeSafe screening. Test Stop and sign-out. Keep the Mac Studio awake, online and logged into the service account; LaunchAgents start at user login, not before login.

## Security and operational behavior

The gateway validates Firebase-signed ID tokens against project `aim-step`, issuer, expiry, verified email and the private email allowlist on every request. It serves no static files. Public signing certificates are cached for five minutes. The API only accepts fixed model/embed endpoints and authenticated owner-scoped jobs. Caller-supplied provider keys and arbitrary providers are rejected. Browser ID tokens go only to the fixed API origin, never to publication databases. Model API keys remain in existing private configuration. Token revocation is bounded by ID token lifetime; removing an email from this API allowlist denies subsequent requests immediately.

Long inference uses POST/202 followed by authenticated GET polling, so model execution does not depend on one long Cloudflare HTTP request. Per-account concurrency is bounded; completed jobs are removed by the browser after receipt. Stop cancels pending work and hides the result; an already-running upstream inference may finish within the backend timeout. Jobs are in memory and do not survive gateway restarts. No prompts or identity tokens are written to gateway logs.

Public full-text pages use browser-based retrieval rather than probing a visitor's local download helper. This change does not implement cross-device synchronization of screening records or uploaded PDFs; those remain browser-local. Existing project login and cloud project metadata are unchanged.

## Validation

- `python3 tools/test_online_model_gateway.py`: signed-token validation, denied identities, CORS, fixed routes, private-file denial, scoped jobs, concurrency and cleanup.
- `node tools/test_online_model_client.cjs`: login gate, credentials restricted to API origin, local compatibility, long jobs and cancellation.
- `python3 tools/test_connect_online_tunnel.py`: token/full-command parsing without shell execution.
- `python3 ../scripts/check_inline_scripts.py --repo .`.

## Alternative remote-managed connector setup

If using a dashboard-managed tunnel instead, `python3 tools/connect_online_tunnel.py` accepts the whole Cloudflare install command at a hidden prompt, extracts a token without executing input, stores it privately and creates a separate `com.aimstep.online-tunnel` LaunchAgent. Do not run this alternative alongside the deployed locally managed route unless intentionally migrating. The older inactive dashboard tunnel `aimstep-mac-studio` is not the deployed API tunnel.

The original `api.aimsetp.com` hostname remains an alias to the same authenticated gateway; the frontend uses `ai.aimsetp.com` to avoid a cached negative lookup during initial deployment.
