# 本地模型服务（eligibility.html）

`eligibility.html` 的 Machine generate 和 Standardize 会先请求同源后端
`api/eligibility/health` 和 `api/eligibility/model`。`local_model_server.py` 实现的就是这个后端：
它托管整个站点，并把模型请求转交给本机的 Ollama。

## 启动

```bash
ollama list                                  # 确认已安装 gemma4:31b-it-q8_0
python3 tools/local_model_server.py          # 在仓库根目录运行
# 浏览器打开 http://127.0.0.1:8765/eligibility.html
# 或直接用线上站点 https://aimsetp.com/ ，页面会自动找到本机的这个服务
#   （必须是 https；见下文「从线上站点使用」）
```

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--port` | `8765` | 只监听 127.0.0.1；页面默认找这个端口（8000 常被其他程序占用） |
| `--allow-origin` | aimsetp.com（http/https，含 www） | 允许调用本机模型的线上站点，可重复；`--allow-origin none` 表示一个都不允许 |
| `--model` | `gemma4:31b-it-q8_0` | 也可用环境变量 `AIMSTEP_MODEL` |
| `--ollama` | `http://127.0.0.1:11434` | 必须是本机地址，否则拒绝启动 |
| `--log-dir` | 关闭 | 把每次模型请求与回复追加到 `<目录>/eligibility-<日期>.jsonl`，供审计；日志含研究内容 |

## 长期运行（macOS launchd）

在终端里运行会随窗口关闭而停止。要开机/登录后自动启动、退出后自动重启，用 launchd：
把下面内容保存为 `~/Library/LaunchAgents/com.aimstep.local-model-server.plist`
（把路径换成本机实际路径；`python3` 必须写绝对路径，可用 `command -v python3` 查看）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.aimstep.local-model-server</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/python3</string><string>-u</string>
    <string>/Users/YOU/AIM-STEP/living-evidence/tools/local_model_server.py</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/YOU/AIM-STEP/living-evidence</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/Users/YOU/Library/Logs/aimstep-model-server.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/Library/Logs/aimstep-model-server.log</string>
</dict></plist>
```

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.aimstep.local-model-server.plist   # 启用
launchctl kickstart -k gui/$(id -u)/com.aimstep.local-model-server                              # 重启（改代码后）
launchctl bootout  gui/$(id -u)/com.aimstep.local-model-server                                  # 停止并取消自启
tail -f ~/Library/Logs/aimstep-model-server.log                                                  # 查看日志
```

## 模型在另一台电脑上时

页面的 `127.0.0.1` 指浏览器所在的电脑。若模型和本服务在另一台机器（例如远程的 Mac Studio），
有两类做法。差别不在快慢，而在**浏览器数据留在哪个来源**：各步骤的纳排标准、筛选进度都存在
浏览器里，按来源隔离，换了地址就看不到。

| 做法 | 浏览器地址 | 已有数据 | 前置条件 |
| --- | --- | --- | --- |
| SSH 端口转发 | 仍是 `https://aimsetp.com` | 全部保留 | 模型机器开启远程登录 |
| Tailscale 提供整个网站 | 换成服务器自己的地址 | 不迁移，需先导出 | 两台在同一 Tailscale 网络 |

已经在 `aimsetp.com` 上做了工作的，用 SSH 端口转发。

### Tailscale 私有 HTTPS 地址

通过 Tailscale 私有 HTTPS 地址使用服务器上的整个网站。两台电脑均须连接同一 Tailscale 网络；
访问规则沿用该网络的设备和用户权限。

在**模型服务器的终端**运行（可以是你当前使用的 SSH 远程终端）：

```bash
cd /Users/achieve/AIM-STEP/living-evidence
python3 tools/remote_model_server.py
```

该脚本会：

1. 检查 Tailscale、本地模型服务和所选端口。
2. 在 `127.0.0.1:8766` 启动后台转发服务，通过 Tailscale Serve 的 HTTPS `8443` 端口提供网站。
3. 从 HTTPS 地址实际检查模型健康状态，并发送一次 `{"ok":true}` 模型测试。
4. 通过后输出 `https://<服务器>.<网络>.ts.net:8443/eligibility.html`。在另一台电脑打开这个地址。

网页与模型接口在这个地址下同源，不再连接访问者电脑上的 `127.0.0.1`。
Ollama 和原来的 `8765` 服务继续只监听服务器本机；转发仅允许指定的站点地址和模型接口，
不提供公网 Funnel。已有的其他 Tailscale 服务不会被覆盖。

若 Tailscale 提示开启 HTTPS，按其输出的链接完成设置，再运行脚本。
若端口已被其他服务使用，可传入 `--port 8767 --https-port 9443`。
关闭 SSH 窗口后仍会运行；服务器重启后需再次运行上述命令。日志在本仓库根目录的
`logs/remote-model-server.log`（已在 `.gitignore` 中）。

这个 HTTPS 地址与 `https://aimsetp.com` 是不同的网站来源，浏览器中已有的纳排标准、筛选进度
不会自动迁移。使用时保持在同一个 HTTPS 地址下完成各步骤；已有内容先从原页面导出。

官方说明：[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)。

### Tailscale CLI 无法读取配置时，直接使用设备 IP

服务器已连接 Tailscale，但 CLI 报 `Failed to load preferences` 时，可以在服务器终端运行：

```bash
python3 /Users/achieve/AIM-STEP/living-evidence/tools/remote_model_server.py --tailnet-ip 100.114.199.15
```

`100.114.199.15` 是当前服务器已分配的 Tailscale IP；其他服务器须换成它自己的地址。
该模式先检查本机模型服务，再仅监听指定的 Tailscale 接口，使用前台运行方式。
看到“远程入口已监听”后，保持终端运行，在另一台已连接同一 Tailscale 网络的电脑打开
`http://100.114.199.15:8766/eligibility.html`，从这个地址执行模型任务。
网页和模型接口同源；使用 HTTP 页面，设备之间的传输由
[Tailscale 加密连接](https://tailscale.com/docs/concepts/tailscale-encryption)保护。
此模式不调用 Tailscale CLI，也不配置 Serve。原网站的浏览器数据同样需要先导出。

如果 Codex 工具执行时返回 `Operation not permitted`，表示工具环境禁止该网络操作，
入口没有启动；需要在服务器的普通终端执行上述命令。

离线测试（无需端口权限、Tailscale 或真实模型）：

```bash
python3 tools/test_remote_model_server.py -v
```

### SSH 端口转发（保留 aimsetp.com 上的已有数据）

这种做法不改变网站来源：页面仍在 `https://aimsetp.com`，浏览器里已有的纳排标准和筛选进度
不受影响。模型机器上的服务继续只监听本机，跨机传输由 SSH 加密。

1. 在**模型所在的机器**上开启远程登录。一次性操作，需要管理员：

   ```bash
   sudo systemsetup -setremotelogin on
   ```

   也可走系统设置 → 通用 → 共享 → 远程登录。

2. 在**浏览器所在的电脑**上开隧道，并保持窗口打开：

   ```bash
   ssh -N -L 8765:127.0.0.1:8765 achieve@100.114.199.15
   ```

   `achieve` 和 `100.114.199.15` 是当前模型服务器的用户名和 Tailscale IP；换服务器时改成它自己的。
   `-N` 表示只转发、不开 shell。本地端口必须是 `8765`，页面只找这个端口。

3. 确认隧道通了。在浏览器所在的电脑另开一个终端：

   ```bash
   curl -s http://127.0.0.1:8765/api/eligibility/health
   ```

   应返回 `{"service": "aimstep-local-eligibility", ..., "status": "ok"}`。

4. 打开 `https://aimsetp.com/eligibility.html`，点 Start。Chrome 142 及以后会询问
   Local network access，选 Allow。

这个询问只在浏览器**连接成功之后**才出现。所以第 3 步不通时不会弹框，页面也拿不到模型——
那是隧道或服务的问题，不是权限问题。关掉 ssh 窗口隧道即断；模型机器重启后远程登录设置保留，
但模型服务需要重新启动。

## 从线上站点使用

线上站点（GitHub Pages）没有后端。页面找不到同源服务时，会再找 `http://127.0.0.1:8765` 上的本服务：

1. 本机运行 Ollama 和 `python3 tools/local_model_server.py`
2. 打开 aimsetp.com 上的纳排标准页面，点 Start
3. 必须用 **https** 地址打开（http 页面一律被浏览器拒绝访问本机）
4. Chrome / Firefox 若询问是否允许该网站访问本机（Firefox 称 Device apps and services），选择允许；Firefox 也可在 `about:config` 把 `network.lna.skip-domains` 设为 `aimsetp.com`

第 4 步的询问只在浏览器**连接成功之后**出现。所以第 1 步没做时根本不会弹框，
而权限状态仍是“未授予”——此时报错指向权限是误导，真正缺的是本机服务。

只有在运行本服务的那台电脑上才能用；页面调用的是**访问者自己电脑上的**模型。建议用 Chrome；Safari 可能阻止网页访问本机地址。

## 与浏览器直连 Ollama 的区别

不启动本服务时，页面会退回到浏览器直连 Ollama（需从 `http://localhost` 打开）。实测同一问题：

| | 直连 | 本服务 |
|---|---|---|
| Machine generate | 336 s，最后被页面校验拒绝 | 91 s，成功（连续两次结果相同） |
| Standardize | — | 66 s，成功 |

本服务固定：模型由服务端决定、`think:false`、temperature 0、JSON 输出、`num_ctx` 16384、`num_predict` 4096；
回复不是 JSON 对象时以 temperature 0.3 重试一次。

## 安全

- 只绑定 `127.0.0.1`；`Host` 不是本机名时拒绝（防 DNS rebinding）；`Origin` 既不是本服务自身、也不在 `--allow-origin` 名单内时拒绝，跨域预检同样只回应名单内站点
- 无密钥、无账号、无第三方服务；研究内容只在浏览器、本进程和本机 Ollama 之间传递
- 请求体须为 `{"messages": [...]}`，角色限 system/user/assistant，最多 6 张图片，40 MB 上限；不合格直接拒绝

## 测试

```bash
python3 tools/test_local_model_server.py     # 30 项，用假 Ollama，无需真实模型
python3 tools/test_remote_model_server.py    # 22 项，不需要端口权限、Tailscale 或真实模型
```

要确认浏览器这一侧也通，打开 `local-model-diagnostic.html`：从本机服务
（`http://127.0.0.1:8765/local-model-diagnostic.html`）或从线上站点
（`https://aimsetp.com/local-model-diagnostic.html`）都可以。它按工作流页面的同样顺序先探同源、
再探 `127.0.0.1:8765`，记录 `loopback-network` 权限状态，并发一次真实的模型请求。

失败时它指出是哪一环，而不是只说一句不可达：服务没在浏览器所在的电脑上运行、权限被拒、
授权框从未出现（因为连接就没成功）、页面用的是 http，或者端口上是另一个程序。

## Faster screening: Ollama in parallel

Title and abstract screening sends up to 4 model requests at once
(`AI_WORKERS` in `title-abstract-screening.html`). Ollama answers them
together only when its server runs with `OLLAMA_NUM_PARALLEL=4`; otherwise
they queue and nothing breaks. The Ollama desktop app ignores
`launchctl setenv`, so `tools/start_ollama_parallel.sh` restarts the app with
the variable set (only if it is not already set). The login agent
`~/Library/LaunchAgents/com.aimstep.ollama-parallel.plist` runs it at each
login; its log is `~/Library/Logs/aimstep-ollama-parallel.log`.

Measured on the Mac Studio (M3 Ultra, gemma4:31b-it-q8_0), one screening
reading: 10.5 s one at a time, 7.3 s with 2, 6.6 s with 4 (throughput).
Each request waits longer (about 25 s with 4), but more finish per minute.
Restarting Ollama stops any screening in progress; finished readings are
kept and Resume continues.

    tools/start_ollama_parallel.sh                         # set it now
    launchctl bootout gui/501/com.aimstep.ollama-parallel  # remove the login agent

## Full-text screening: embeddings

`full-text-screening.html` finds each criterion's most relevant passages by
contrastive semantic highlighting with the embedding model `embeddinggemma`
(`ollama pull embeddinggemma`, about 620 MB). The server forwards
`POST /api/eligibility/embed {"input": [texts]}` to Ollama `/api/embed`
(`--embed-model`, default `embeddinggemma`).

While the chat model is busy with parallel requests, the main Ollama does not
load a second model, so embeddings get their own small Ollama on port 11435
(same model folder, local only), started at login by
`~/Library/LaunchAgents/com.aimstep.ollama-embed.plist`, and the server is
started with `--embed-ollama http://127.0.0.1:11435`. Without an embedding
model the page falls back to keyword scoring and records that it did.

    launchctl kickstart -k gui/501/com.aimstep.ollama-embed   # restart it
    curl -s http://127.0.0.1:8765/api/eligibility/health      # shows "embedModel"

PDF text is read in the browser with pdf.js 4.10.38 (`vendor/pdfjs/`,
Apache-2.0); open-access articles come from Europe PMC as JATS XML.

## Eligibility: 本地模型 / 接入 API

Eligibility 页面新增 Model source，作用于 Machine generate 和 Standardize。
默认使用本地模型；切换会停止当前生成。API 请求经本后端转发，失败不会切回本地。
远端访问仍需要 SSH 转发或既有私有入口。

API 模式支持 HTTPS 的 Chat Completions 兼容接口，要求支持
`messages`、`response_format: {"type":"json_object"}` 和
`choices[0].message.content`。目前仅支持文本输入；图片和扫描 PDF 使用本地模式。
TypeSafe 的 `/v1/systemone` 是判断接口，不支持本页文本生成，会明确拒绝。

在运行后端的 Mac Studio 进程环境中设置：

- `AIMSTEP_API_URL`：完整 HTTPS 接口地址，包含 `/chat/completions`。
- `AIMSTEP_API_MODEL`：服务商提供的文本生成模型名称。
- `AIMSTEP_API_KEY`：密钥，仅存于服务端环境。不要写进网站目录或提交到 Git。

配置后重启后端；launchd 服务必须在自己的进程环境中配置，普通终端的 export
不会修改已经运行的 launchd 服务。健康接口的 api.ready 仅确认配置齐全，
不是远端认证或推理测试成功。云端模式会把本次任务内容发送给所配置服务商。
无真实凭证时仅用模拟服务验证；接入真实服务后需另做端到端验证。


### API key confirmation in Eligibility

The English-only page shows a password input and Confirm button when API is selected.
Configure `AIMSTEP_API_URL` and `AIMSTEP_API_MODEL` on the server first. The page accepts
an API key for this tab, then sends a short JSON test through the backend. Successful
confirmation clears the input and keeps the key only in tab memory. Editing the key,
switching model source, or refreshing clears confirmation. No browser storage or logs
contain the pasted key. Each API request carries its own key; it never changes the
server environment or another user's credentials. The server environment key remains
available to existing non-UI clients. Confirm may incur a small provider charge.


## Title and abstract screening: TypeSafe API

The Pilot screening panel has the same Local model / API choice and password-style
API key + Confirm controls as Eligibility. Here API means **TypeSafe**, using fixed
`https://api.typesafe.ai/v1/models` and `/v1/systemone` destinations. No API URL,
server API model environment variable, or server API key is required. Confirm
checks account access and loads model names; it does not claim to test inference.
The key remains in tab memory and travels only through the guarded model backend
to TypeSafe. Reloading or changing the key requires confirmation again. No keys
are persisted to workspace, audit logs or exported results. Existing SSH / private
remote access to Mac Studio is still required. Ollama need not be running for API
mode; AIM-STEP's Python backend must be running.

TypeSafe uses one named choice question per eligibility criterion: met, not_met,
unclear. Its probabilities are shown as model output, not evidence certainty or a
validated clinical threshold. For not_met, a second request selects an exact
source span from a fixed menu; it cannot invent a quote. No supporting span means
unclear. The page requires an exact matching quotation for exclusion; explicit title
evidence can suffice when no abstract is available. Missing text alone never
supports exclusion. Reasons are application labels, not
model-generated explanations. JSON exports retain probabilities, provider,
requested/resolved model, adapter version, raw responses and token usage.

Both pilot and formal screening use the selected provider. TypeSafe runs one
record request at a time, and authentication/credits/rate-limit errors stop the
run for the user to resolve. The two formal passes use the same model with a
changed question order, not two independent reviewers. Human pilot approval and
existing human checks remain required. Changing provider/model asks to archive
the current pilot and full-screening results, resets the active run, and requires
a new pilot. Archived runs can be downloaded from the model panel.

Validation (synthetic inputs / mocked API; no real credentials):

```bash
python3 tools/test_typesafe_model.py
python3 tools/test_local_model_server.py
python3 tools/test_remote_model_server.py
node tools/test_typesafe_screening.cjs
```

API contract: https://api.typesafe.ai/openapi.json (checked 2026-10-05).
A real authenticated screening run still needs the user's key in the UI.


## Screening workflow update (2026-10-05)

At least one complete, compared pilot is required. The reviewer can approve after
round one or choose more rounds; starting a new round withdraws the previous approval.
One criterion explicitly not met with source evidence is sufficient. Another reading
that is merely unclear does not veto it. If every supported exclusion criterion is
explicitly judged met in another reading, the record remains a human conflict.
Default Human check now covers conflicts and uncertain records only; exclusion
sampling and all-exclusion checks remain selectable. Legacy default sample scopes
migrate to this default; existing votes and AI readings are preserved.

Human-check abstracts support per-record and all-record expansion/collapse. Human
No votes require an entered exclusion reason. All five export formats (CSV, RIS,
RevMan RIS, BibTeX, JSON) include an exclusion reason. AI exclusions include criteria
and exact evidence; reviewer-entered reasons take precedence. Legacy reviewer
exclusions without notes are explicitly marked as missing reasons, never inferred.
Source-only bibliographic exports remain unchanged.

Regression checks: `node tools/test_screening_workflow.cjs` covers minimum pilot
gating, criterion-level conflicts, missing evidence, review scope migration,
abstract controls, reviewer reasons and every result export format.


## Learning from pilot corrections

This is project-scoped in-context calibration, not model weight training. Every
completed pilot disagreement needs a reviewer-selected criterion (or Overall)
and a correction rationale. An entered exclusion reason can supply that rationale.
Optional evidence must exactly match the original title/abstract. The application
does not invent or summarize clinical rules with another model: confirmed reviewer
wording and outcomes become versioned lessons in the existing project workspace.

`app/screening-calibration.js` builds deterministic calibration snapshots. Every
pilot round freezes feedback from previous completed rounds. Pilot approval freezes
all confirmed feedback for formal screening. At request time, relevance ranking
selects up to 12 rules and 4 worked examples within a 20,000-character budget; all
lessons remain saved, and any shortened example abstract is explicitly marked.
The current record's original criteria always take precedence; examples must not
supply missing facts, new thresholds or quotations for a different record.

Both local chat prompts and TypeSafe's judgment/evidence-selection requests receive
the same `reviewerCalibration` block. Each result records the calibration hash,
selected lesson IDs and total lesson count. CSV includes version and selected IDs;
JSON exports include the frozen approved calibration. Download calibration also
exports the feedback and optional correction-replay results.

Check corrections replays the corrected records with the selected model. It keeps
the original blinded pilot readings and agreement metrics unchanged. This is an
adherence check on examples supplied to the model, not independent validation or
proof of improved screening accuracy. It is optional; further fresh pilot rounds
remain the user's choice.

Editing votes, feedback, criterion mapping or supporting quotes invalidates the
approval through its fingerprint. Reapproval with a different calibration archives
any previous formal run (with user confirmation) and starts a new formal run;
outputs with a different calibration hash cannot be reused as current results.
Legacy approvals require review and reapproval; existing pilot records are retained.
Keys are never part of a calibration snapshot.

Regression checks:

```bash
node tools/test_screening_calibration.cjs
node tools/test_calibration_runtime.cjs
node tools/test_screening_workflow.cjs
python3 tools/test_typesafe_model.py
```

All automated checks use synthetic records and mocked model responses. A real
provider replay is initiated by the reviewer in the page; no accuracy gain is
claimed without such evaluation and a separate fresh sample.

## Full-text screening (2026-10-06)

`full-text-screening.html` now shares title/abstract screening's local / TypeSafe
selection and tab-only key confirmation. TypeSafe receives selected **full-text
passages**, the criteria and frozen reviewer corrections; it does not substitute
an abstract for a full text. Exact exclusion quotations must match the named
passage. Both positive and negative retrieval scores are represented in the
bounded evidence context; missing evidence remains Unclear. Two readings are
model readings, not independent human reviewers.

- Complete and compare at least one pilot round; additional rounds are optional.
  Confirm a criterion and explanation for every disagreement. Approval freezes
  the correction bundle; changes invalidate approval. Optional correction replay
  does not overwrite the original pilot or constitute independent validation.
- Eligibility criteria → Edit applies only to the full-text workspace. Criteria,
  provider and document changes archive affected runs and require new screening.
  “Download previous screening runs” retains the prior results and criteria.
- One supported unmet criterion excludes unless the other reading directly
  contradicts it. Default human review covers uncertainty and conflicts; users
  may include a random sample of up to 300 exclusions or all exclusions.
- Human exclusions require a reason. CSV, RIS, RevMan RIS, BibTeX and JSON retain
  reasons; CSV/JSON also trace criteria, document and calibration versions.

Open-access retrieval uses the existing guarded `/api/eligibility/model` endpoint
with `provider: "fulltext"`, so the remote proxy needs no new public route.
`tools/fulltext_sources.py` queries Europe PMC XML/OA links, OpenAlex OA locations,
Semantic Scholar openAccessPdf, and optionally Unpaywall DOI locations. Recognized
arXiv DOIs also resolve to arXiv PDF downloads. A real user-supplied email is needed
for Unpaywall; no placeholder email is sent. Downloads are limited to 24 MiB,
public HTTPS, checked DNS addresses pinned for TLS, and individually validated
redirects. No caller-provided download URL, authentication cookies or paywall
bypass is accepted. PDFs must match the report DOI/title before automatic import.
Rate limits, unavailable metadata, HTML landing pages and unreadable files are
reported as retrieval failures, not proof that a report is unobtainable. Upload
remains available. PDF extraction processes all pages; OCR is not included.

Provider references checked for this implementation:
- https://europepmc.org/RestfulWebService
- https://help.openalex.org/api/authentication/
- https://api.semanticscholar.org/api-docs/
- https://unpaywall.org/products/api

Validation: `python3 tools/test_fulltext_sources.py`,
`node tools/test_fulltext_workflow.cjs`, existing local/remote server, TypeSafe,
calibration and title/abstract tests, and the repository inline-script checker.
Live checks retrieved Europe PMC XML and an arXiv PDF and reached OpenAlex and
Semantic Scholar metadata. No private TypeSafe credential was available for a
live paid screening request. The browser connector was unavailable; DOM bindings
and workflow behavior were checked by the VM harness, not a visual browser run.

### Automatic full-text source synchronization

The full-text page displays the previous step’s Yes/Maybe records automatically
on opening, focus and every five seconds while visible and idle. There is no
Import button. Clear is local to this page, archives screening runs and persists
across reloads; it does not delete upstream decisions or downloaded documents.
Restore results re-enables synchronization. Empty upstream selections remove old
reports too. Record/criterion changes invalidate affected screening results;
page-local criteria edits are retained. The workflow regression covers automatic
updates, persistent clear, restoration, empty sources and deferral during runs.
