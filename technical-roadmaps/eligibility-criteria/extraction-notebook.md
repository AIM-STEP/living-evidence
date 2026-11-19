# 原文要素提取记录本

本记录本用于 Eligibility criteria 的生成流程。它记录已复现的问题、下次遇到同类原文时的处理方法，以及可以重新运行的检查。通用技巧由版本库保存，模型每次最多读取两条。模型的判断依据始终是本次研究问题、原文附件和作者明确的决定。[模型实际读取的技巧](../../app/eligibility/lessons.js) · [方法来源与本地评估](source-grounded-extraction.md)

## 提取与核对

| 记录代码 | 已观察到的错误 | 处理方法与复现检查 |
| --- | --- | --- |
| `excluded_intervention` | 以氧饱和度目标为干预的研究被排除，曾误归入 Study design 或 Other。 | 先识别排除所依据的特征。目标导向治疗策略归入 Intervention，保留整项研究为排除对象；随机分配等研究方法归入 Study design。原文另外提到的按目标滴定给氧仍用作亚组分析因素。[排除要素归类](../../tests/eligibility/explicit-study-exclusions.cjs) |
| `exclusion_list` | 原文列举多项排除，结果漏项、反转方向，或页面显示无排除。 | 从排除动词或小标题读到列举结束。逐条保留被排除的对象及相关否定。同一条产房限制曾出现两次，合并时核对原文位置、对象和例外，再检查展示条数。区分研究资格与仅从某一分析中剔除。[排除列举](../../tests/eligibility/explicit-study-exclusions.cjs) |
| `source_coverage` | 原文明示的要素未提取，或同类多个选项只留下一个。 | 逐项对应原文段落、列举和要素记录。发现缺项时保留原文出处，恢复其范围后送既有核对流程。[来源覆盖](../../tools/test_eligibility_source_coverage.cjs) |
| `comparison_arms` | Comparison 曾包含整句研究目的、结局和人群，或被归入 Other。括号内的联合干预也曾干扰组别识别。 | 分别引用每组接受的处理。保留各自的剂量、主动对照、“任何”等限定词，以及括号内的干预变体。具名对照显示组名并保留否定和剂量；原文引文保留完整组别标签。对照组后列出的研究结局应单独识别。[组别方向与心脏康复实例](../../tests/eligibility/comparison-arms.cjs) · [对照选项](../../tests/eligibility/comparison-review.cjs) · [完整多句输入](../../tests/eligibility/cardiac-rehabilitation.cjs) |
| `outcome_role` | 宽泛目的与明细结局重复，随访时间和判定依据丢失，或结局被误写为必须报告。 | 仅当所选框架含结局维度且原文将测量或报告某结局作为资格门槛，才纳入该条件，保留时间点和定义。原文分别列出的主要、次要关注结局，在所选框架的 Outcomes 位置连续编号，用分号在同一段内分隔，保留同一结局内部的限定。Description 用完整句子说明这些结局在研究中的作用。[三部分布局及投稿用描述](../../tests/eligibility/cardiac-rehabilitation.cjs)[完整结局](../../tests/eligibility/neonatal-clinical-prose.cjs) |
| `analysis_role` | 亚组因素遗漏，分析方法或数据层级变成筛选条件。 | 区分分析计划与纳排要求。仅当作者明示筛选门槛且属于所选框架时，才记录相应条件。[分析计划与独立数据要求](../../tests/eligibility/nutrition.cjs) |
| `scope_status` | 原文没有设限，却被标作明确不限，随后核对失败。 | 区分未提及、明确不限、范围已限定和不适用。只有来源含有相应表述，才录入明确的豁免。[限制状态](../../tests/eligibility/scope-status.cjs) |
| `age_bound` | 年龄限定在改写时消失，严格不等号改变，或模型自行补上年龄界值。 | 保留年龄原词、运算符、单位和比较方向。逐字明确的定性年龄组可直接采用；只有原文确实要求另定界值、存在冲突或适用范围不清时才问作者。[年龄与必需确认](../../tests/eligibility/nutrition.cjs) · [阈值核验记录](../../docs/eligibility-evaluation/strict-age-recorded-real.json) |
| `logical_scope` | 分段后把并列备选条件合并为全部须满足，或把例外附到错误分支。 | 曾将“可纳入三种试验设计”错读为研究设计、人群、干预和对照任选其一。先确定连接词管辖的短语，再按原文重建各字段与共同条件。排除清单、结局关注和亚组分析中的并列选项各自保留在其原有范围。[明确纳入句](../../tests/eligibility/explicit-inclusion-logic.cjs) 若跨段关系确实未交代，保留针对这一关系的确认。[分段逻辑](../../tests/eligibility/fragment-logic.cjs) |
| `repeated_passage` | 同一短语在不同段落出现时容易选错方向。PDF 中的排版合字也可能使模型引文与原文逐字比较失败。 | 核对来源版本、Unicode 位置、小标题和否定。遇到排版差异，保留原文切片和全部可能的位置。上下文相同的引文可共享依据；相反语义的出现位置须分开。[重复引文与上下文](../../tests/eligibility/repeated-citations.cjs) |
| 数值与时间 | 起止年龄、小时缩写及时间参照在标准化后被误判为阈值改变。 | 逐条从同一处原文核对范围两端、严格程度、单位和参照事件。仅机器数值属性与完整原文措辞相冲突时，先按原文校正。 |
| `source_fidelity` | 候选措辞改变了受试人群、干预实施者或条件，出现引用与表述不符。 | 由 Jev 一次核对候选措辞与对应原文。存疑或核对未完成的候选进入相应位置供作者决定，作者答复立即生效。[独立核对与定向修正](../../tests/eligibility/semantic-repair.cjs) |
| `question_identity` | 模型遗漏或更改问题 ID。 | 复用该请求提供的标识；由结构约束绑定问题，检查返回的引用属于当前问题。[问题标识](../../tools/test_eligibility_question_id.cjs) |
| `topic_wording` | 标题只说“某人群的干预”，或主题、人群和干预描述重复整句研究目的。 | 主题概括主要干预或暴露、临床用途和关键人群；对照组在 Comparison 和 Description 中交代；首次使用含义明确的缩写时写出全称，Description 单独处理首次使用；依 BMJ 的写法把人群和限定词写在一起，使用具体临床用语，删去重复的目的或通用开场。[标题](../../tests/eligibility/concise-topic.cjs) · [各要素描述](../../tests/eligibility/neonatal-clinical-prose.cjs) |

## 生成流程中已发生的其他问题

| 记录代码 | 现象与处理 | 复现检查 |
| --- | --- | --- |
| `framework_display` | 框架外信息落入 Context 或 Other 显示行，或在隐藏这些行时从预览、导出消失。标准与 Description 只展示所选框架内、有原文依据的纳排条件。PICOS 下单独的场所限制不归入人群或干预。框架本身含 Context 且原文明示地点条件时，才呈现场所。 | [框架投影](../../tests/eligibility/framework-projection.cjs) |
| `clear_project` | 旧草稿或来源污染新任务。清除项目标准、旧记录和反馈，保留有独立清除键的研究问题，拒绝清除前发出的旧请求回写。 | [Clear 与并发保护](../../tests/eligibility/clear-project.cjs) |
| `author_decision` | 确认项离开对应要素，作者明确回答后仍要等待再次推理。把确认定位到规则，并直接应用作者决定。 | [作者决定路由](../../tests/eligibility/author-answer-routing.cjs) · [确认目标](../../tests/eligibility/author-targets.cjs) |
| `progress_display` | 工作期间进度停在 0% 或 15%，用户无法判断是否仍在运行。显示阶段进度、等待状态及实际完成的批次。 | [进度反馈](../../tests/eligibility/wait-progress.cjs) |
| `service_availability` | 上游服务超时或缺少判定时，曾为每个未核对条目生成一个作者任务。仅对缺少服务判定的条目自动重试一次。若仍无法完成，页面显示一条服务提示。[部分恢复及服务故障](../../tests/eligibility/semantic-repair.cjs) | [传输层](../../tools/test_eligibility_transport.py) · [用户可见错误](../../tests/eligibility/semantic-error-display.cjs) |
| `residual_validation` | 程序发现尚未归入具体技巧的校验错误。累计发生运行次数，待可复现后分配更具体的记录代码。 | [校验不变量](../../tests/eligibility/invariants.cjs) |

## 一次运行如何反馈到下一次

1. 系统按当前批次原文或待核对引文选择匹配的技巧。在同一项目内，上次出现过且与本次内容有关的错误类别优先。既有纠错重试也可直接采用对应技巧。
2. 程序在生成成功或失败时记录能由验证器或实际修正识别的类别。同一类别在一次运行内只计一次；一次运行可以命中多个类别。作者决定及原文自身的歧义不作为模型犯错的证据。界面类历史问题保留在表内，其回归测试负责发现重现。
3. 项目反馈只保存版本、固定类别和计数。它随 Criteria Clear 一起删除。所有项目共用的版本库笔记只记通用方法；模型通过推理时读取技巧来利用反馈。
4. 出现新的错误模式时，在这里登记触发条件、错误表现、处理办法和一条可重现的回归检查；需要模型提示时，把经过核实的一句通用技巧和匹配条件增补到运行时代码。新增例子使用不含项目内容的最小合成材料，复现正例，并覆盖最容易误伤的反例。[提示与清除回归](../../tests/eligibility/learning-notebook.cjs)
