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

## 从线上站点使用

线上站点（GitHub Pages）没有后端。页面找不到同源服务时，会再找 `http://127.0.0.1:8765` 上的本服务：

1. 本机运行 Ollama 和 `python3 tools/local_model_server.py`
2. 打开 aimsetp.com 上的纳排标准页面，点 Start
3. Chrome 若询问是否允许该网站访问本地网络设备，选择允许

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
