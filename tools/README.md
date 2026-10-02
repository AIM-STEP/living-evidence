# 本地模型服务（eligibility.html）

`eligibility.html` 的 Machine generate 和 Standardize 会先请求同源后端
`api/eligibility/health` 和 `api/eligibility/model`。`local_model_server.py` 实现的就是这个后端：
它托管整个站点，并把模型请求转交给本机的 Ollama。

## 启动

```bash
ollama list                                  # 确认已安装 gemma4:31b-it-q8_0
python3 tools/local_model_server.py          # 在仓库根目录运行
# 浏览器打开 http://127.0.0.1:8765/eligibility.html
# 或直接用线上站点 http://aimsetp.com/ ，页面会自动找到本机的这个服务
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
在浏览器所在的电脑上开一个 SSH 端口转发，并保持窗口打开：

```bash
ssh -N -L 8765:127.0.0.1:8765 <用户>@<模型所在机器的地址>
```

之后浏览器里的 `127.0.0.1:8765` 就会转到那台机器上的服务。

## 从线上站点使用

线上站点（GitHub Pages）没有后端。页面找不到同源服务时，会再找 `http://127.0.0.1:8765` 上的本服务：

1. 本机运行 Ollama 和 `python3 tools/local_model_server.py`
2. 打开 aimsetp.com 上的纳排标准页面，点 Start
3. 必须用 **https** 地址打开（http 页面一律被浏览器拒绝访问本机）
4. Chrome / Firefox 若询问是否允许该网站访问本机（Firefox 称 Device apps and services），选择允许；Firefox 也可在 `about:config` 把 `network.lna.skip-domains` 设为 `aimsetp.com`

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
python3 tools/test_local_model_server.py     # 20 项，用假 Ollama，无需真实模型
```
