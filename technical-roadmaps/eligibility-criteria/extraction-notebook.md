# Eligibility Criteria 错误与反馈记录本

本记录本用于 Eligibility criteria 的生成流程。它记录已复现的问题、下次遇到同类原文时的处理方法，以及可以重新运行的检查。通用技巧由版本库保存，模型每次最多读取两条。模型的判断依据始终是本次研究问题、原文附件和作者明确的决定。[模型实际读取的技巧](../../app/eligibility/lessons.js) · [方法来源与本地评估](source-grounded-extraction.md)

## 提取与核对

| 记录代码 | 已观察到的错误 | 处理方法与复现检查 |
| --- | --- | --- |
| `excluded_intervention` | 以氧饱和度目标为干预的研究被排除，曾误归入 Study design 或 Other。 | 先识别排除所依据的特征。目标导向治疗策略归入 Intervention，保留整项研究为排除对象；随机分配等研究方法归入 Study design。原文另外提到的按目标滴定给氧仍用作亚组分析因素。[排除要素归类](../../tests/eligibility/explicit-study-exclusions.cjs) |
| `exclusion_list` | 原文列举多项排除，结果漏项、反转方向，或页面显示无排除。 | 从排除动词或小标题读到列举结束。逐条保留被排除的对象及相关否定。同一条产房限制曾出现两次，合并时核对原文位置、对象和例外，再检查展示条数。区分研究资格与仅从某一分析中剔除。[排除列举](../../tests/eligibility/explicit-study-exclusions.cjs) |
| `source_coverage` | 原文明示的要素未提取，或同类多个选项只留下一个。 | 逐项对应原文段落、列举和要素记录。发现缺项时保留原文出处，恢复其范围后送既有核对流程。[来源覆盖](../../tools/test_eligibility_source_coverage.cjs) 「仅考虑随机对照试验」改写为「研究设计仅限随机对照试验」时，原先会将空提取判为完整。现在保留原文条款清单，按缺项补提。仍未核对的明示条款标记为生成不完整，并暂停自动筛选。若联合干预需在对照组匹配，主干预和条件应一同送审。[心力衰竭出院随访回归测试](../../tests/eligibility/heart-failure-discharge.cjs) |
| `comparison_arms` | Comparison 曾包含整句研究目的、结局和人群，或被归入 Other。括号内的联合干预也曾干扰组别识别。 | 分别引用每组接受的处理。保留各自的剂量、主动对照、“任何”等限定词，以及括号内的干预变体。具名对照显示组名并保留否定和剂量；原文引文保留完整组别标签。对照组后列出的研究结局应单独识别。[组别方向与心脏康复实例](../../tests/eligibility/comparison-arms.cjs) · [对照选项](../../tests/eligibility/comparison-review.cjs) · [完整多句输入](../../tests/eligibility/cardiac-rehabilitation.cjs) “受试者服用 A 或安慰剂至少一年”给出两个组及共同疗程。制剂和可选合用药修饰该治疗。[分组与共同疗程](../../tests/eligibility/hormone-therapy.cjs) |
| `outcome_role` | 宽泛目的与明细结局重复，随访时间和判定依据丢失，或结局被误写为必须报告。 | 仅当所选框架含结局维度且原文将测量或报告某结局作为资格门槛，才纳入该条件，保留时间点和定义。原文分别列出的主要、次要关注结局，在所选框架的 Outcomes 位置连续编号，用分号在同一段内分隔，保留同一结局内部的限定。Description 用完整句子说明这些结局在研究中的作用。[三部分布局及投稿用描述](../../tests/eligibility/cardiac-rehabilitation.cjs)[完整结局](../../tests/eligibility/neonatal-clinical-prose.cjs) 原文将某种疗效列为综述范围之外时，在 Description 说明这一边界。研究同时报告该疗效，仍可能符合纳入条件。[长期治疗、关注结局与范围声明](../../tests/eligibility/hormone-therapy.cjs) |
| `analysis_role` | 亚组因素遗漏，分析方法或数据层级变成筛选条件。 | 区分分析计划与纳排要求。仅当作者明示筛选门槛且属于所选框架时，才记录相应条件。[分析计划与独立数据要求](../../tests/eligibility/nutrition.cjs) |
| `scope_status` | 原文没有设限，却被标作明确不限，随后核对失败。 | 区分未提及、明确不限、范围已限定和不适用。只有来源含有相应表述，才录入明确的豁免。[限制状态](../../tests/eligibility/scope-status.cjs) |
| `age_bound` | 年龄限定在改写时消失，严格不等号改变，或模型自行补上年龄界值。 | 保留年龄原词、运算符、单位和比较方向。逐字明确的定性年龄组可直接采用；只有原文确实要求另定界值、存在冲突或适用范围不清时才问作者。[年龄与必需确认](../../tests/eligibility/nutrition.cjs) · [阈值核验记录](../../docs/eligibility-evaluation/strict-age-recorded-real.json) |
| `logical_scope` | 分段后把并列备选条件合并为全部须满足，或把例外附到错误分支。 | 曾将“可纳入三种试验设计”错读为研究设计、人群、干预和对照任选其一。先确定连接词管辖的短语，再按原文重建各字段与共同条件。排除清单、结局关注和亚组分析中的并列选项各自保留在其原有范围。[明确纳入句](../../tests/eligibility/explicit-inclusion-logic.cjs) 若跨段关系确实未交代，保留针对这一关系的确认。[分段逻辑](../../tests/eligibility/fragment-logic.cjs) |
| `repeated_passage` | 同一短语在不同段落出现时容易选错方向。PDF 中的排版合字也可能使模型引文与原文逐字比较失败。 | 核对来源版本、Unicode 位置、小标题和否定。遇到排版差异，保留原文切片和全部可能的位置。上下文相同的引文可共享依据；相反语义的出现位置须分开。[重复引文与上下文](../../tests/eligibility/repeated-citations.cjs) |
| 数值与时间 | 起止年龄、小时缩写及时间参照在标准化后被误判为阈值改变。 | 逐条从同一处原文核对范围两端、严格程度、单位和参照事件。仅机器数值属性与完整原文措辞相冲突时，先按原文校正。 |
| `source_fidelity` | 候选措辞改变了受试人群、干预实施者或条件，出现引用与表述不符。 | 由 Jev 逐条核对候选措辞与对应原文。明确不符合的候选略过。原文含义或适用范围不清时交作者核对，作者答复立即生效。[独立核对与定向修正](../../tests/eligibility/semantic-repair.cjs) 中文对照和排除项补回后，第一次翻译仍可能省略备选项、纳排方向或范围。随条目传递完整支配短语。首版措辞被判不符时只修正该条，再交 Jev 核对。 |
| `question_identity` | 模型遗漏或更改问题 ID。 | 复用该请求提供的标识；由结构约束绑定问题，检查返回的引用属于当前问题。[问题标识](../../tools/test_eligibility_question_id.cjs) |
| `topic_wording` | 标题只说“某人群的干预”，或重复整句研究目的。 | 用原文支持的最简名称概括干预，如 supervised cycling。仅给出干预类别时保留该类别，如 nutritional interventions。按需补充临床用途和关键人群。对照组在 Comparison 和 Description 中交代。首次使用含义明确的缩写时写出全称，Description 单独处理首次使用。[标题](../../tests/eligibility/concise-topic.cjs) · [各要素描述](../../tests/eligibility/neonatal-clinical-prose.cjs) |
| 混合人群的纳入条件 | 胰岛素治疗的成年 2 型糖尿病问题中，附加条件无法归类时，已识别的字段被退回通用提取。结果丢失干预、对照和结局，且整句原题被当成人群。 | 人群与混合组数据可单独提取的条件共用一条规则，两处原文一起核对。其他字段独立保留。英文规则必须完成英文标准化。 [糖尿病回归测试](../../tests/eligibility/mixed-diabetes-cohort.cjs) |

## 生成流程中已发生的其他问题

| 记录代码 | 现象与处理 | 复现检查 |
| --- | --- | --- |
| `framework_display` | 框架外的信息一度混入纳排标准，随后明确的排除和作者确认的规则也曾被过滤。保留所选框架的字段。原文明示且通过核对的排除，以及作者确认的规则，从其实际所属领域进入预览、导出和筛选。 | [框架投影](../../tests/eligibility/framework-projection.cjs) · [作者新增规则](../../tests/eligibility/unbound-author-criteria.cjs) |
| 重复生成 | 输入未变时，旧版本曾直接沿用原结果。现在每次 Generate 都重新提取和核对。已脱离当前页面的附件须重新提交。模型使用固定采样种子，推理输入保留与研究有关的信息。 | [相同附件重新生成](../../tests/eligibility/repeat-generation.cjs) · [模型请求](../../tools/test_eligibility_transport.py) |
| 同一治疗的限定 | 从目标和纳入段分别读到疗法、制剂和共同疗程时，曾重复列出同一治疗，或把人群内部的选择误解为整个标准的选择。题目使用目标指明的疗法和人群。制剂并入对应治疗，两组共同疗程在 Description 统一说明，并保留为内部纳入条件。真正待确认的条目直接注明字段、纳入或排除方向以及原文依据。 | [治疗、人群和疗程](../../tests/eligibility/hormone-therapy.cjs) · [人工核对](../../tests/eligibility/semantic-repair.cjs) |
| 目标与纳入条件 | 原文含排版连字并将研究目的、纳入段、剂量定义和关键结局分开时，模型曾把整段目的填入 Population 和 Outcomes。用明确的纳入段恢复人群和试验设计，按声明逐条展示关键结局。保留辐照度的严格不等号、单位和带宽条件，并识别独立的交叉试验排除。 | [光疗回归](../../tests/eligibility/phototherapy.cjs) |
| `clear_project` | 旧草稿或来源污染新任务。清除项目标准、旧记录和反馈，保留有独立清除键的研究问题，拒绝清除前发出的旧请求回写。 | [Clear 与并发保护](../../tests/eligibility/clear-project.cjs) |
| `author_decision` | 确认项离开对应要素，作者明确回答后仍要等待再次推理。把确认定位到规则，并直接应用作者决定。 | [作者决定路由](../../tests/eligibility/author-answer-routing.cjs) · [确认目标](../../tests/eligibility/author-targets.cjs) |
| 人工确认门槛 | Jev 支持分数达到 0.85 时可采用，明确反对的判定门槛为 0.95。仅由 Jev 提出的歧义，需要置信度和该判定的概率均达到 0.98 才交作者。较弱的支持判定须经完整原文、字段和方向佐证。证据仍不足时重试该条一次，仍无充分判定则略过。原文明示的冲突、待定条件和影响筛选的组合关系照常交作者。 | [Jev 判定](../../tools/test_eligibility_hybrid_review.py) · [转人工阈值与原文佐证](../../tests/eligibility/source-corroboration.cjs) |
| `progress_display` | 工作期间进度停在 0% 或 15%，用户无法判断是否仍在运行。工作期间在 Criteria 下实时显示用时，成功后保存并显示本次耗时。 | [用时显示](../../tests/eligibility/wait-progress.cjs) |
| `service_availability` | 上游服务超时或缺少判定时，曾为每个未核对条目生成一个作者任务。Jev 缺少判定时，只重试该条一次。仍缺则略过该条，记录服务异常并继续写入已通过的规则。 | [生成、略过与计数](../../tests/eligibility/manual-generation.cjs) · [服务端记录本](../../tools/test_eligibility_notebook.py) |
| 提取请求超时 | 本地模型连续尝试提取、修复格式及重生成，答复出炉前页面已断开。每个请求共用 240 秒时限并最多自动修复一次。局部失败时保留通过核对的条目并标明未处理的原文，暂停筛选交接。 | [请求时限](../../tools/test_eligibility_model_budget.py) · [部分结果与失败保护](../../tests/eligibility/extraction-bridge.cjs) |
| `residual_validation` | 程序发现尚未归入具体技巧的校验错误。累计发生运行次数，待可复现后分配更具体的记录代码。 | [校验不变量](../../tests/eligibility/invariants.cjs) |
| 下游交接 | 草稿等待作者选择或输入改变时，下游可能提前读取旧规则。标题摘要页也可能用空记录覆盖全文筛选的原有交接。 | 下游读取同一份验证状态，受阻时保留已有记录。全文筛选阶段的签名必须对应当前标准。 | [发布边界回归](../../tests/eligibility/release-boundaries.cjs) |
| 旧版手填编辑 | 首次保存时才建立空白补充限制字段，导致保存前后的输入签名变化，重开时文字描述消失。 | 初始化时统一空值，让笔记、旧规则和签名同步保存。 | [保存与重载](../../tools/test_eligibility_preview_edit.cjs) |

## 一次运行如何反馈到下一次

1. 系统按当前批次原文或待核对引文选择匹配的技巧。在同一项目内，上次出现过且与本次内容有关的错误类别优先。既有纠错重试也可直接采用对应技巧。
2. 程序在生成成功或失败时记录能由验证器或实际修正识别的类别。同一类别在一次运行内只计一次；一次运行可以命中多个类别。作者决定及原文自身的歧义不作为模型犯错的证据。界面类历史问题保留在表内，其回归测试负责发现重现。
3. 项目反馈只保存版本、固定类别和计数。它随 Criteria Clear 一起删除。所有项目共用的版本库笔记只记通用方法；模型通过推理时读取技巧来利用反馈。
4. 出现新的错误模式时，在这里登记触发条件、错误表现、处理办法和一条可重现的回归检查；需要模型提示时，把经过核实的一句通用技巧和匹配条件增补到运行时代码。新增例子使用不含项目内容的最小合成材料，复现正例，并覆盖最容易误伤的反例。[提示与清除回归](../../tests/eligibility/learning-notebook.cjs)

## 服务端记录

本地模型后端将服务错误和 Jev 缺少判定的次数写入 `private/eligibility-criteria/notebook/YYYY-MM-DD.jsonl`。每天一个文件，按 UTC 归档。每条包含时间、阶段、固定代码和数量。日志以模型请求为单位，因此同一候选重试时可能有两条。项目计数以生成操作为单位，每类只计一次。研究原文、模型自由文本和作者答复留在各自的当前项目记录；服务日志供维护时排查，后续提示仍使用记录本中经过验证的固定技巧。

[服务端写入模块](../../tools/eligibility_notebook.py) · [返回结果与日志验证](../../tools/test_eligibility_notebook.py) · [工具保存位置](README.md)
