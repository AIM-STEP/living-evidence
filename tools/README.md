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

要确认浏览器这一侧也通，从本机服务打开 `http://127.0.0.1:8765/local-model-diagnostic.html`。
它检查健康接口，并发一次真实的模型请求，最后报告是否可达。它用的是相对地址，所以只诊断
“从本机服务打开”这一种情况；隧道和 Tailscale 两种做法仍按上文各自的第 3 步确认。

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
