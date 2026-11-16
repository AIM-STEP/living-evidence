# 同一研究多报告关联与结果来源管理

实现版本：`study-links-v1`，2026-11-16。核心模块为 `app/study-links.js`。本文描述已实现的工程规则及其限制，不将合成测试结果视为真实文献识别准确率。

## 1. 研究关联与重复记录去重

报告级去重处理同一篇报告的多个数据库记录，技术说明见 [Screening source 去重](SCREENING_SOURCE_DEDUPLICATION.md)。研究关联处理同一研究的方案、主结果、随访、二次分析等不同报告；这些报告仍分别保留、逐篇筛选，不计入 Duplicates removed，也不进入重复记录 Excel。

系统在报告级去重完成后，为每条保留记录添加 Report ID 和 Study ID。研究关联不改变标题摘要筛选候选集合，不产生需要逐对确认的去重任务。仅有弱证据的关系作为候选记录，全部继续筛选。

方法设计参照 Cochrane Handbook 对多报告研究识别及数据收集的讨论：[Chapter 4](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04)、[Chapter 5](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-05)。本实现采用以下自行定义的规则，未移植外部产品算法或其性能数据。

## 2. 数据结构与标识符

| 字段 | 含义 |
|---|---|
| `uid` | 现有源记录键，继续用于筛选决定和提取值的索引 |
| `reportId` | `R-` 加 UID 的确定性双 32 位指纹，同一 UID 跨阶段保持一致 |
| `studyIds` | 研究标识符数组；一篇报告可以对应多个研究 |
| `reportType` | protocol、results、follow-up、secondary analysis、notice 或 report |
| `studyLinkEvidence` | 注册号或已接受的明确 DOI 报告关系，包括原文片段和证据来源 |
| `relatedReports` | 同项目中共享研究标识的其他报告书目信息，包括其他步骤已知的报告 |
| `studyLinkVersion` | 关联规则版本 |

报告类型由标题关键词及正文前部的 results 标识粗略判定，仅用于展示和建议主报告排序，不作为删除、纳排或结果取值依据。

具有注册号的 Study ID 为 `S-NCT01234567` 或 `S-ISRCTN12345678`。无注册号时，为明确关联分量内最小 UID 的确定性指纹；没有明确关系的报告暂时各成一组。后续发现注册号、加入新的明确关联报告或撤回证据时，暂定 Study ID 可以改变。它不是人工验证过的永久研究编号。指纹不是密码学标识或防篡改证明；重新导入后 UID 变化也可能改变 Report ID。

一篇报告同时涉及两个注册试验时，会保留两个 Study ID；该报告不会将两个试验连成一个研究。当前不自动判断不同注册平台编号是否属于同一试验。

## 3. 自动建立研究关联的证据

### 3.1 本研究注册号

当前只识别 NCT 后八位数字与 ISRCTN 后八位数字，允许编号内部存在空格或短横线，并标准化为大写紧凑形式。格式检查不验证注册真实性。

导入记录的 `trialRegistration`、`registrationNumber`、`registryIds` 被视为明确注册字段。CSV/TSV 可从 Trial registration、Registration number、Trial ID、NCT、ISRCTN、Clinical trial number 等标准化列名读取注册字段；JSON 可携带这些字段。

标题、摘要和全文中的编号还需要同一句话包含注册语境，例如 Trial registration、Registration number、Registered at/with/in/under、ClinicalTrials.gov identifier/number/:，或者明确的 follow-up/secondary analysis of ... trial/study 表述。只出现注册号不足以建立关联。

包含 previous/prior/other/earlier trial/study 或 systematic review/meta-analysis 的句子不作为本研究注册声明。系统综述或 Meta 分析标题也阻止从普通正文注册声明提取本研究注册号。能够识别到独立 References/Bibliography/Literature cited 标题时，忽略其后文本。PDF 文本结构丢失时，该排除方法可能失效，不能保证消除所有误引用。

具有相同本研究注册号的报告共享对应 Study ID。每条证据保留原文句子，来源标为 title/abstract、full text 或 imported registration field。

### 3.2 明确的报告关系与 DOI

识别同一句中的明确关系声明，例如：

> This is a secondary analysis of the trial reported in 10.1000/main.

需要同时满足 follow-up/secondary analysis/subgroup analysis/extension of 及 reported/published/described in/at 的限定表达；目标 DOI 必须唯一对应项目中一篇已知报告。

明确关系形成连接分量。两个待连接分量具有不同本研究注册号，或涉及多个注册试验时，不自动连接，转为注册冲突候选。普通参考文献 DOI、标题相似或作者相同不能单独触发该规则。

## 4. 候选关系

以下情况只记录候选，不共享新的 Study ID：

1. 两篇报告提到同一注册号，但缺少两者均属于该试验的声明；
2. 共享作者姓氏键，标题词集合 Dice 相似度至少 0.45，并且有共同研究地点、干预字段或一致招募期；
3. 明确 DOI 关系与已识别注册号发生冲突。

候选比较通过注册号提及和作者键分块，不是全量两两比较。标题去除标点、转小写、过滤部分常见词，以词集合 Dice 比较。地点、干预和招募期主要来自导入结构化字段；地点与招募期也进行有限英文模式提取。缺失信息不提供支持。

0.45 是工程阈值，不是概率或经过标定的置信度。候选可以漏掉跨语言、作者写法变化或缺少共同键的报告。大量报告共享作者键时，比较数仍可能呈二次增长。

研究组、关联依据及候选关系在后台维护，Study and report links 详情及渲染调用已从各阶段页面移除，不要求确认合并、保持分开或暂不处理。不同报告始终保留，完整源数据关系保存在 JSON 导出中。

## 5. 各阶段的数据流

| 阶段 | 行为 |
|---|---|
| Screening source | 报告级去重后在后台建立关联，保留暂定研究组、各报告、建议主报告和依据 |
| Pilot / Title and abstract screening | 继续按报告抽样、判断；关联和候选不减少筛选记录 |
| Full-text assess | 全文保存、替换、读取及工作区恢复时补充关系；删除全文会撤回该全文的关联证据 |
| Risk of bias | 沿用相同 Study ID/Report ID，保留逐报告评估及来源，不自动复制另一报告的偏倚判断 |
| Extraction | 保留逐报告原始提取值，按研究、当前结局和目标时间点准备分析数据 |

标题摘要到全文的内部交接保留注册与研究特征字段、关联标识和证据。全文到提取及偏倚风险评估继续携带报告信息。本地 PDF 导入后也会更新研究关联；无法读取全文时保留原记录。

关联元数据的变化不会作为标题摘要或全文筛选内容变化来重置既有纳排决定。实际标题、摘要、筛选标准或全文内容变化，仍按原有有效性规则处理。

建议主报告依次按 results、report、follow-up、secondary analysis、protocol、notice 排序，同级按 Report ID 确定。该建议仅用于展示，不能决定结局数据来源，不能代替逐报告筛选。

其他步骤已知的关联报告保留为后台书目引用，不会自动变成当前步骤的记录、恢复被排除的报告或增加分析行。

## 6. 提取、结果冲突与防止重复计入

仅将已确认且包含分析所需有效数值的报告结果送入研究级整理；NR/NA 等缺失值仍沿用原有分析排除规则。

同一结局内，按 Study ID 与配置的目标时间点分组；每篇报告的整套研究臂结果作为一个来源集合。比较的签名包括治疗节点、臂名称、实际时间点、样本量及连续结局 mean/SD 或二分类 event。

- 多报告整套结果完全一致时，确定性保留一套分析行，并在 `sourceReports` 保留全部来源报告 UID；不累加样本量。
- 任一数值、研究臂、名称或实际时间点不同，则在 Included studies 显示来源选择。选择前该研究在该结局的数据暂不进入分析；原始提取值不删除。
- 用户为该结局选择一篇报告后，采用其整套研究臂数据，保存选择并保留 Report ID 与 Study ID。当前不跨报告自动拼接干预臂或挑选单个数值。
- 一篇报告对应多个研究时，必须先将当前结局的这套提取结果指定到其中一个 Study ID。当前不会从混合报告结果自动拆分出各子研究；需要分别整理的子研究数据不能直接依赖自动关联完成。

不同时间点不会在同一结局数据集中作为独立研究自动重复计入。需要多个时间点分析时，应在提取表中分别定义相应结局/时间点，并核对来源选择。

来源选择以结局为单位存入 `studyOutcomeSources`：`sources` 保存研究分组到报告的选择，`assignments` 保存多研究报告的研究指定。选择保存失败会恢复之前的选择，不发布失败的新选择。分析交接包含整理后的行、来源选择及未解决冲突。

当前的防重复计入依赖已识别的研究关联。未被识别为同一研究的两篇报告、不同结局对同一结局的重复定义、同一注册试验内部的重叠亚组，仍需要方法学核查。

## 7. 存储、缓存与输出

关联存入浏览器 IndexedDB `aimstep-study-links`，版本 1，`projects` 对象仓库按项目 scope 隔离。每次更新在读写事务中读取前一版本、计算和保存，事务完成后才向调用者返回。没有新增模型调用或外部网络请求。

共享仓库保留书目信息、注册和候选所需特征、证据片段、内容指纹及全文特征缓存，不额外保存完整全文或 PDF。原始文献文件仍使用现有全文仓库。缓存随全文指纹变化重算；没有传入文档表示沿用已知全文特征，显式传入 null 表示撤回。项目中其他步骤的已知报告保留，供跨阶段追溯；清除浏览器站点数据会清除这些本地关联。

更新失败时显示提示，继续保留原报告及筛选、提取数据，不因关联失败删除记录。没有可用关联时，不能保证实现研究级防重复计入。

输出约定：

- Source CSV 在原有列后增加 Report ID、Study IDs、Report type。
- Source JSON 增加 `studyLinks`，包含规则版本、研究组、候选及明确连接；逐报告记录同时保留关联字段和证据。
- RIS/BibTeX 继续输出逐报告书目信息，不保证携带研究关系。
- Extraction Excel 的逐报告内容增加关联标识，并增加 Study and report links 工作表；原始逐报告数值仍分别输出，不能将该原始值表直接视为已消除研究级重复的分析数据。
- `Export duplication` 继续只导出实际移除的重复数据库记录。没有移除重复记录时禁用；五列仍为 ID号、标题、作者、年份、重复理由。

## 8. 验证与范围

运行：

```sh
node tools/test_study_links.cjs
node tools/test_study_link_pipeline.cjs
node tools/test_screening_dedup.cjs
node tools/test_screening_dedup_export.cjs
node tools/test_screening_source_sync.cjs
node tools/test_screening_clear.cjs
node tools/test_fulltext_stages_save.cjs
node tools/test_fulltext_ai_review.cjs
node tools/test_extraction_results.cjs
node tools/test_extraction_sources.cjs
node tools/test_extraction_delete.cjs
node tools/test_extraction_workflow.cjs
node tools/test_rob_sources.cjs
```

新增测试覆盖：研究关联保留所有报告及决定、无关注册号提及、多研究报告不会连接两个试验、明确 DOI 关系与注册冲突、全文证据增加/缓存/撤回、项目隔离和事务失败、实际筛选交接、实际 CSV 字段对应、实际提取数据整理，以及来源选择保存失败回滚。页面内脚本也进行语法解析。

上述检查采用合成记录、Node VM 页面函数与事务存储替身。它们验证实现行为，不验证真实文献上的敏感度、特异度或误关联率。部署前检查时，旧 `test_fulltext_workflow.cjs` 因缺少 `AIMScreeningCriteriaDialog` 测试替身而失败；在修改前的 HEAD 页面运行也有同样失败。相关全文保存及 AI review 专项测试通过。本次环境没有可用的交互浏览器，未完成真实浏览器视觉及下载操作验收。

当前是确定性规则实现，没有训练研究关联模型。只支持上述两种注册号及有限英文关系表达；不处理所有注册平台、语义等价的治疗名称、跨语言关系、自动注册别名合并或复杂多研究结果拆分。后续应使用人工标注的真实报告集合，分别评估错误关联、漏关联、候选数量和最终分析中的重复计入，并检查不同文献类型、导入顺序及语言的影响。
