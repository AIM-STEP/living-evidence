# 原文要素提取记录本

本记录本用于 Eligibility criteria 的生成流程。它记录已复现的问题、下次遇到同类原文时的处理方法，以及可以重新运行的检查。通用技巧由版本库保存，模型每次最多读取两条。模型的判断依据始终是本次研究问题、原文附件和作者明确的决定。[模型实际读取的技巧](../../app/eligibility/lessons.js) · [方法来源与本地评估](source-grounded-extraction.md)

## 提取与核对

| 记录代码 | 已观察到的错误 | 处理方法与复现检查 |
| --- | --- | --- |
| `exclusion_list` | 原文列举多项排除，结果漏项、反转方向，或页面显示无排除。 | 从排除动词或小标题读到列举结束。逐条保留被排除的对象及相关否定，并核对页面与导出中的条数。区分研究资格与仅从某一分析中剔除。[排除列举](../../tests/eligibility/explicit-study-exclusions.cjs) |
| `source_coverage` | 原文明示的要素未提取，或同类多个选项只留下一个。 | 逐项对应原文段落、列举和要素记录。发现缺项时保留原文出处，恢复其范围后送既有核对流程。[来源覆盖](../../tools/test_eligibility_source_coverage.cjs) |
| `comparison_arms` | Intervention 与 Comparison 都照抄了整句目的，或比较组落入 Other。 | 定位每组接受的处理，保留剂量、主动对照、自身组间比较及“任何”等范围词，再分别命名。[组别方向](../../tests/eligibility/comparison-arms.cjs) · [对照选项](../../tests/eligibility/comparison-review.cjs) |
| `outcome_role` | 宽泛目的与明细结局重复，随访时间和判定依据丢失，或结局被误写为必须报告。 | 按作者逐项列出的结局保留时间点与定义。有明确测量或报告门槛时，另立资格条件。[完整结局](../../tests/eligibility/neonatal-clinical-prose.cjs) |
| `analysis_role` | 亚组因素遗漏，分析方法或数据层级变成筛选条件。 | 把效应修饰因素、数据层级与合并方法写入分析描述。另查作者是否明确以数据可用性作为门槛。[分析计划与独立数据要求](../../tests/eligibility/nutrition.cjs) |
| `scope_status` | 原文没有设限，却被标作明确不限，随后核对失败。 | 区分未提及、明确不限、范围已限定和不适用。只有来源含有相应表述，才录入明确的豁免。[限制状态](../../tests/eligibility/scope-status.cjs) |
| `age_bound` | 年龄限定在改写时消失，严格不等号改变，或模型自行补上年龄界值。 | 保留年龄原词、运算符、单位和比较方向。仅在未确定的界值确实影响筛选时询问作者。[年龄与必需确认](../../tests/eligibility/nutrition.cjs) · [阈值核验记录](../../docs/eligibility-evaluation/strict-age-recorded-real.json) |
| `logical_scope` | 分段后把并列备选条件合并为全部须满足，或把例外附到错误分支。 | 用原文中的连接词、限定词和例外重建分支。若跨段关系确实未交代，保留针对这一关系的确认。[分段逻辑](../../tests/eligibility/fragment-logic.cjs) |
| `repeated_passage` | 相同短语在不同段落出现，引用歧义引发中断或选错方向。 | 核对来源版本、Unicode 位置、小标题和否定。上下文相同的引文可共享依据；相反语义的出现位置须分开。[重复引文与上下文](../../tests/eligibility/repeated-citations.cjs) |
| `source_fidelity` | 候选措辞改变了受试人群、干预实施者或条件，出现引用与表述不符。 | 回到当前候选的原文和逻辑分支，只修正失败项，再独立核对。原文不能支持时不保存该改写。[独立核对与定向修正](../../tests/eligibility/semantic-repair.cjs) |
| `question_identity` | 模型遗漏或更改问题 ID。 | 复用该请求提供的标识；由结构约束绑定问题，检查返回的引用属于当前问题。[问题标识](../../tools/test_eligibility_question_id.cjs) |
| `topic_wording` | 标题只说“某人群的干预”，或主题、人群和干预描述重复整句研究目的。 | 主题概括明确比较、临床用途和关键人群；来源定义的同一人群限定写成连贯的表达。[标题](../../tests/eligibility/concise-topic.cjs) · [各要素描述](../../tests/eligibility/neonatal-clinical-prose.cjs) |

## 生成流程中已发生的其他问题

| 记录代码 | 现象与处理 | 复现检查 |
| --- | --- | --- |
| `framework_display` | 框架外信息落入 Context 或 Other 显示行，或在隐藏这些行时从预览、导出消失。显示所选框架的原生维度，描述保留额外信息，显式排除同时在排除区交代。 | [框架投影](../../tests/eligibility/framework-projection.cjs) |
| `clear_project` | 旧草稿或来源污染新任务。清除项目标准、旧记录和反馈，保留有独立清除键的研究问题，拒绝清除前发出的旧请求回写。 | [Clear 与并发保护](../../tests/eligibility/clear-project.cjs) |
| `author_decision` | 确认项离开对应要素，作者明确回答后仍要等待再次推理。把确认定位到规则，并直接应用作者决定。 | [作者决定路由](../../tests/eligibility/author-answer-routing.cjs) · [确认目标](../../tests/eligibility/author-targets.cjs) |
| `progress_display` | 工作期间进度停在 0% 或 15%，用户无法判断是否仍在运行。显示阶段进度、等待状态及实际完成的批次。 | [进度反馈](../../tests/eligibility/wait-progress.cjs) |
| `service_availability` | 上游服务返回 502、忙碌或超时，流程中断。记录运行故障类别并保留可诊断的阶段，把这些问题交给传输层处理。 | [传输层](../../tools/test_eligibility_transport.py) · [用户可见错误](../../tests/eligibility/semantic-error-display.cjs) |
| `residual_validation` | 程序发现尚未归入具体技巧的校验错误。累计发生运行次数，待可复现后分配更具体的记录代码。 | [校验不变量](../../tests/eligibility/invariants.cjs) |

## 一次运行如何反馈到下一次

1. 系统按当前批次原文或待核对引文选择匹配的技巧。在同一项目内，上次出现过且与本次内容有关的错误类别优先。既有纠错重试也可直接采用对应技巧。
2. 程序在生成成功或失败时记录能由验证器或实际修正识别的类别。同一类别在一次运行内只计一次；一次运行可以命中多个类别。作者决定及原文自身的歧义不作为模型犯错的证据。界面类历史问题保留在表内，其回归测试负责发现重现。
3. 项目反馈只保存版本、固定类别和计数。它随 Criteria Clear 一起删除。所有项目共用的版本库笔记只记通用方法；模型通过推理时读取技巧来利用反馈。
4. 出现新的错误模式时，在这里登记触发条件、错误表现、处理办法和一条可重现的回归检查；需要模型提示时，把经过核实的一句通用技巧和匹配条件增补到运行时代码。新增例子使用不含项目内容的最小合成材料，复现正例，并覆盖最容易误伤的反例。[提示与清除回归](../../tests/eligibility/learning-notebook.cjs)
