# 纳入与排除标准生成模块：实现、运行与验收

技术规格全文保存在 [eligibility-spec.md](eligibility-spec.md)。本次沿用项目现有的静态 HTML、原生 JavaScript/CSS、浏览器项目存储及 Python/Ollama 模型后端，没有引入前端构建框架，也没有为各框架复制流程。

## 已实现的产品流程

1. 在已注册项目中输入完整研究问题和补充要求；可选综述方法、问题类型、框架、证据单位和有版本的明确授权规则。支持添加多个子问题，每个子问题可有不同框架和方法。首次输入中的明确编号问题可拆分，同时保留完整原文块。
2. 模型先生成结构化候选，再由程序验证结构、枚举、来源版本、Unicode 引用位置和已知数值/逻辑规则，并单独调用模型核对标准化忠实度与信息用途。置信度不作为确认依据。
3. 原文明确的范围直接生成条款；未提及的非必要维度保持 `unspecified`。老年人边界、实际冲突、范围逻辑等必要决定才进入阻塞确认。可选建议不阻止完成。PICO 不意味着仅 RCT；PCC 不强制补充对照组。
4. 可回答部分问题、选择中性选项、自由回答、暂不决定、明确不限或不适用。自然语言回答先解析为候选更新；程序验证目标和实际回答，保存来源与 Decision，再重建受影响条款。必要事项全部解决后自动生成最终版本。
5. 可修订已提取要素和已确认决定。每次修订保留旧值、新值、来源、作用问题和版本。没有明确修改意图的冲突回答不会静默覆盖旧决定。无法对应的回答先保留并确认对应关系。
6. 条款同时保存文字、结构化值和 predicate/all_of/any_of/not 逻辑；保留严格边界、或/且、联合要求、实施者角色、适用范围和例外。排除条款保存实际排除情形；没有独立排除条款时说明现有纳入条件决定资格范围，不补造反向列表。
7. 最终界面按子问题显示研究目标、纳入/排除、逻辑、研究关注内容、明确不限、未设定维度、版本与变更。来源通过条款旁的按钮按需查看；原文摘录和自动核对记录作为内部数据保存，不附加到标准正文。
8. JSON 导出完整项目、历史和追溯记录；文本导出当前或选中的历史版本。任务自动恢复。最终版本同步到原有标准库、检索及筛选预览；新草案或失败结果保留此前已发布的有效版本。

## 本地启动与模型连接

在 `living-evidence` 仓库目录中运行：

```sh
python3 tools/local_model_server.py
```

打开 `http://127.0.0.1:8765/`，创建或打开项目，再进入 Eligibility criteria。直接工具地址需要已有注册项目：

```text
http://127.0.0.1:8765/eligibility.html?projectId=<已有项目ID>
```

后端需要可访问的 Ollama 和已安装模型。现有默认模型为 `gemma4:31b-it-q8_0`。可使用：

```sh
AIMSTEP_MODEL=<已安装模型名> python3 tools/local_model_server.py
# 或
python3 tools/local_model_server.py --model <已安装模型名> --ollama http://127.0.0.1:11434
```

Ollama 地址也可由现有 `OLLAMA_HOST_URL` 环境变量配置。健康检查为 `/api/eligibility/health`，调用为 `/api/eligibility/model`。线上沿用 `AIMSTEPOnlineModel.request` 网关，不把密钥写入项目或浏览器导出。纳排模块继续采用已有本地模型连接；本次真实调用已成功，不缺 API 密钥。

每次模型调用携带步骤、项目版本、框架/方法配置版本、当前输入、已确认内容和响应 schema。默认结构错误/回答解析重试一次，可通过 `analyze`/`parse_answers` 的 `retries` 参数调整。模型客户端超时默认十分钟，可通过 `client({timeout_ms})` 调整。错误保留已有有效版本，并显示步骤及原因。

## 数据、兼容性与并发保护

- `aimstep-eligibility-v3:<projectId>` 保存新版项目。Source 原文不可覆盖；相同来源修改追加 source revision。位置统一为 **Unicode code point**，从零开始，`end` 为开区间，引用针对精确来源版本验证。
- Element 的信息、决定、范围、语义角色分别保存。每条 Criterion 关联要素、人工决定和授权规则。Snapshot 保存该版本要素、问题、条款、逻辑、问题状态、检查和配置版本。Q1/E1 等展示编号与稳定内部 ID 分离。
- `base_revision` 控制异步更新；旧模型结果返回明确的 `VERSION_CONFLICT`。`request_id` 实现同一回答的幂等应用。跨页面保存同时检查新版修订号和旧编辑器标准签名，失败时回滚相关存储。
- 旧版 `aimstep-eligibility:<projectId>` 保留。已有原文附件及仍在生效的人工决定可迁移为有来源的数据；已经被修改或删除的历史规则不会重新生效。旧标准也可明确沿用为补充要求。旧手动/附件编辑器仍可通过 `&legacy=1` 打开，嵌入式标准预览继续可用。
- 项目持久化沿用浏览器存储；它不是新的跨设备云数据库。完整 JSON 导出可用于外部归档。内部摘录和检查不会出现在生成正文，但保存在项目及导出记录中。模型请求/响应摘要可追溯；真实评价另存完整的合成案例请求与响应。

## 模块与配置

| 文件 | 职责 |
| --- | --- |
| `app/eligibility/registries.js` | 框架和方法注册表、大小写敏感别名解析 |
| `app/eligibility/domain.js` | 枚举、稳定 ID、来源定位、数值/角色/例外及逻辑校验 |
| `app/eligibility/engine.js` | 原文保存、框架映射、问题检测、受控决定更新、条款构建/检查、快照和输出 |
| `app/eligibility/model.js` | 现有模型适配、分段提取、独立语义核对、自然语言回答解析和受限重试 |
| `app/eligibility/workspace.js` / `.css` | 输入、要素、确认、标准、来源、版本和导出的项目界面 |
| `config/eligibility-frameworks.json` | 框架字段、别名、定义、示例、关系、检查规则及方法学来源 |
| `config/eligibility-review-profiles.json` | 适用维度、必要决定、条件检查、证据单位、方法规则和配置版本 |

内置内部 ID：`pico`、`peco`、`peo`、`pcc`、`pico_qualitative`、`cocopop`、`pird`、`spider`。`PICO` 与 `PICo` 分开；`pECO` 通过维护的别名表映射到 PECO。输入小写 `pico` 时根据干预/体验语义消歧，不能确定时提出必要确认，不使用统一大写匹配。

新增框架可在界面粘贴配置，也可添加到框架配置文件。例如：

```json
{
  "framework_id": "custom_documents",
  "display_name": "Documents–Context",
  "version": "1.0",
  "aliases": ["Documents–Context"],
  "slots": [
    {"slot_id": "document_type", "display_label": "Document type", "definition": "拟研究的文件种类", "examples": ["政策文件"]},
    {"slot_id": "context", "display_label": "Context", "definition": "文件适用的环境"}
  ],
  "relationships": [],
  "check_rules": [],
  "source_references": []
}
```

自定义字段保留原名及定义；缺少定义时提出确认。框架外的限制继续作为扩展维度保留。框架 `check_rules` 支持声明式 `core_scope`、`dimension`、`evidence_unit`、`advice`，与方法的必要决定联合执行；不接受任意代码。`dimension` 指定 `dimension_id` 和 `description`。可选 `when` 支持 `review_methods`、`question_types`、`present_dimensions`、`absent_dimensions`；`advice` 始终不阻塞。

新增方法配置时更新 `profiles` 和配置版本；`required_decisions` 的上述维度/核心/证据单位规则决定必须确认什么。问题类型关联核心维度单独存于 `question_types`。已知的年龄边界、冲突、来源、数值和逻辑一致性为内置检查；新增专业检查种类需要实现并测试对应处理器，不能仅写一个未被支持的配置名字。

通用系统评价和范围综述不预置设计、语言、年代、全文获取等范围限制。伞状综述需要明确证据单位；明确选择 `cochrane_intervention_review` 才启用其比较/设计范围决定。模型猜测的综述方法仅保存为候选，不自动启用该专门配置。预后、预测模型、经济学类型已可表达并保留要素，但不臆造未授权的专门设计规则。

所有内置 `authorized_defaults` 为空。团队默认限制应作为明确授权规则输入，包含 `name`、`content`、`version` 和 `scope`；scope 为 `"project"`，或包含问题 ID/方法/问题类型的对象。不要把方法学建议直接填成授权默认值。

方法来源及访问版本记录在两份配置中，包括 JBI、Cochrane 第3章、PECO 和 SPIDER 原始资料。PEO 字段映射按本次规格维护，不能声称这些来源授权了当前项目的具体范围决定。

## 程序测试与真实模型评价

程序回归命令：

```sh
node tests/eligibility/acceptance.cjs
node tests/eligibility/invariants.cjs
node tests/eligibility/ui.cjs
```

前两组分别覆盖规格32项验收和19项额外边界/迁移/来源规则。语义候选及其评审结果为人工编写的合成测试夹具，不代表真实模型能力。

DOM 集成测试使用 LinkeDOM，模型响应明确为模拟，覆盖输入→分析→年龄确认→自动最终条款→旧工具同步→失败保留→恢复→跨页面冲突/回滚。若未安装 LinkeDOM，可使用固定独立测试运行库，不改项目依赖：

```sh
curl -sS -L --max-time 30 https://unpkg.com/linkedom@0.18.12/worker.js -o /tmp/aimstep-linkedom-0.18.12.mjs
shasum -a 256 /tmp/aimstep-linkedom-0.18.12.mjs
ELIGIBILITY_DOM_MODULE=/tmp/aimstep-linkedom-0.18.12.mjs node tests/eligibility/ui.cjs
```

该文件预期 SHA-256 为 `196efeb17c260e001979dbc54a3c30e701a881c6e8a3eedaddc5ad83c99ee5ff`。这项测试不等同于浏览器视觉验收。

真实模型评价：

```sh
node tools/evaluate_eligibility_v3.cjs --case all --output /tmp/eligibility-real
# 可设置 AIMSTEP_ELIGIBILITY_MODEL_BASE，或使用 --base 指定已有纳排模型后端。
```

评价器使用开发者编写的合成研究问题和规格导出的预期值，保存原始请求、输出、实际模型名、来源状态、调用摘要及条款；没有冒充独立专家标注的测试集。实际模型采样参数未由后端报告时明确记录 `not_reported`。

网络受限的开发环境可使用 `--exchange-dir`：评价器写出 `request-N.json`，外部 HTTP 客户端按 `url-N.txt` 请求，将响应写入 `response-N.json`。`--resume` 恢复相同输入状态；`--replay` 校验请求散列一致后重放真实历史响应，不能把改变了提示词的离线输出算作同一次真实调用。本次工具的 HTTP 验证窗口为30秒，个别冷调用超时；这与产品客户端十分钟超时分别记录。

本次运行的真实案例、修正前失败及最终观察结果见 [eligibility-evaluation/README.md](eligibility-evaluation/README.md)。发现过错误范围状态、错误回答动作、错误语义用途和不完整逻辑树；这些案例用于修正本次实现，所以不作为独立留出集，也不据此给出临床准确率。

## 验收边界和仍需提供的信息

已完成的程序检查、兼容性回归和真实调用结果会随本次提交归档。真实浏览器工具尝试因其运行目录不可写而失败；本次没有完成截图和真实浏览器视觉验收，不能由 DOM 测试推断布局已经验收。

下一步方法学评价需要研究团队提供独立裁定的实际研究问题、原始方案、预期范围和必要澄清答案；若有团队默认限制，还需规则名称、内容、作用范围、授权记录和版本。当前不依赖这些资料才能运行，默认不替团队补设限制。复杂未编号子问题的自动拆分、跨段落条件关系和各专业问题类型的真实语义表现尚未完成独立专家评价。来源引用存在、程序检查通过以及第二次模型评审都不构成任意自然语言条件的形式化等价证明。
