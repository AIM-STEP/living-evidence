<!-- Agent: Codex | Task: Pilot screening prompt | Session: 2026-11-16 -->
# Screening prompt 研究与实施依据

## 结论

截至 2026-11-16 的定向检索支持：明确的逐项筛选问题、固定标准来源、保守处理不确定性、真实原文证据、迭代反馈和版本记录。不同模型与提示方式存在交互，不能把其他研究的结果当成本工具或 TypeSafe/JEV 的性能保证。本次自动生成采用确定性编译，保存的编辑/导入内容进入实际 TypeSafe 请求。

## 方法

检索共五个查询：2025–2026 LLM筛选提示工程；few-shot与优化；2026结构化筛选与敏感度；TypeSafe官方API；BMJ研究的开放全文。优先原始研究、作者预印本和官方接口文档。部分期刊直接访问403，改用PubMed检索摘要、PMC及作者机构版本；未进行全系统综述或声称穷尽最新研究。仓库没有可复用的本地RAG研究索引，采用现有筛选代码及文档作为内部上下文。

## 外部来源与发现

1. **Homiar et al., 2025-07-22, BMJ Mental Health**，*Development and evaluation of prompts for a large language model to screen titles and abstracts in a living systematic review*，doi:10.1136/bmjment-2025-301762。开发集迭代、按标准组织的问题及独立更新集验证支持保留逐项问题和纠错；最终纳入研究的敏感度与标题摘要阶段的人类决定一致性是不同指标。https://pmc.ncbi.nlm.nih.gov/articles/PMC12306261/
2. **Evaluating prompting strategies and large language models in systematic literature review screening: Relevance and task-stage classification**, Research Synthesis Methods，2026-10-19，PMID:42895556。原始比较显示明显模型—提示交互；高召回、精确率/F1的最优配置并不一致。支持简洁默认指令和实测迭代，不默认强制长推理或自我反思。https://pubmed.ncbi.nlm.nih.gov/42895556/ （作者预印本：https://arxiv.org/html/2510.16091v1）
3. **A prompt-based tutorial for large language model-assisted screening in systematic reviews and meta-analyses**, 2026，PMID:42543845。摘要描述理解检查、针对标准的反馈和迭代提示优化，并在其他综述数据集验证；支持复用现有人工纠错流程，不能据此保证JEV复现同等效果。https://pubmed.ncbi.nlm.nih.gov/42543845/
4. **TypeSafe 官方 API 0.2.0**：`/v1/systemone` 通过共享 `state` 和逐问题 `instructions` 执行结构化选择；模型由 `/v1/models` 返回，官方示例为 `jev-latest`。自定义Prompt进入state，并由分类和证据选择两阶段问题明确引用；不把它伪装成聊天接口。https://api.typesafe.ai/redoc ，https://api.typesafe.ai/openapi.json

## 已有实现

- `app/screening-stages.js`：启用后的编辑标准；禁用/删除元素不得通过背景问题或纠错重新激活。
- `title-abstract-screening.html`：`pilotPrompt`、逐项判断校验、精确引文检查、Pilot反馈、两次正式阅读及版本批准。
- `app/screening-calibration.js`：人工确认的规则与有来源的示例；反馈不是权重微调，不是独立验证。
- `tools/typesafe_model.py`：分类后选择真实来源片段；没有有效排除证据时保留。

## 设计决策

| 决策 | 依据与理由 |
|---|---|
| 自动生成可读、可编辑Prompt，附当前启用标准 | 来源1、2；确定性生成避免重写标准或增加未知条件 |
| 支持TXT、Markdown和JSON导入；先编辑后Save应用 | 用户要求；沿用项目对话框草稿和存储约定 |
| 当前标准始终作为执行依据；自定义文本指导应用方式 | 来源1、4；避免过期或额外条件覆盖实际阶段配置 |
| 缺失为unclear；排除需要原文证据 | 来源1、3；保留当前保守聚合与证据保护 |
| 分类和证据选择都读取保存Prompt | 来源4；确保按钮编辑内容实际进入API |
| 修改Prompt归档旧结果、清除批准并重新Pilot | 来源1、2、3；改变执行方法后不能沿用旧校准结论 |

## 风险与处理

| 风险 | 影响/可能性 | 处理 |
|---|---|---|
| 模型不遵从提示或提示与标准矛盾 | 高/中 | 固定阶段边界、逐项核验、真实引文、人工Pilot；不宣称语义冲突已自动全部识别 |
| 自定义Prompt过期 | 高/中 | 绑定criteriaSig及stageSig，过期时要求复核或重新生成；不静默覆盖编辑内容 |
| 编辑、导入、同步或保存失败造成丢失 | 高/中 | 草稿隔离、关闭保护、事务保存及工作区回滚 |
| 编辑反馈导致指标过拟合 | 高/中 | 区分Pilot一致率与独立敏感度，保留原始版本和示例来源 |
| 老连接器忽略新增字段 | 高/中 | Prompt同时放入既有stagePolicy；新版连接器两阶段显式引用并返回版本标识 |

## 实施及验证

P0：生成/导入/编辑模块与按钮；实际请求传递；Prompt版本、归档及旧批准失效；导入验证和存储回滚测试。P1：文档、翻译、线上静态部署和本地连接器核验。P2：使用独立人工参考样本评估不同Prompt/模型的敏感度、误排除与工作量；不在本次功能变更中声称完成。

研究报告小于10KB；来源与代码模式已记录。研究结果用于设计选择，不等同于本实现的临床或方法学性能验证。
