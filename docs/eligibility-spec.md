# 根据研究问题生成纳入与排除标准：技术规格

本文件保存使用者提供的完整技术规格，作为当前项目的实现与验收依据。

## 一、功能目标与交付范围

实现一个支持多种证据综合方法和研究问题框架的纳入与排除标准生成模块。

系统接收一句或多句研究问题，以及使用者提供的补充要求，通过两个阶段形成最终标准。

阶段一
提取研究问题中已经明确的信息，进行归类、来源标记和标准化。识别存在歧义、缺失关键决定或相互冲突的内容，形成需要人工确认的问题。

阶段二
接收人工回答，将确认内容与已有明确内容合并，完成完整性、逻辑一致性和来源检查，生成最终纳入与排除标准。

交付范围截至纳排标准的生成、人工修订、版本保存和追溯。

系统应支持
1. 不同类型的系统评价、范围综述和伞状综述等证据综合任务。
2. PICO、PECO、PEO、PCC、PICo、CoCoPop、PIRD、SPIDER等框架。
3. 新增自定义框架及其字段。
4. 一个项目包含多个研究问题或子问题。
5. 不同子问题使用不同框架。
6. 已明确条件自动整理，必要事项交人工确认。
7. 对最终条款追溯原始输入和人工决定。

## 二、基本设计原则

1. 分别建模综述方法、问题类型、问题框架和证据单位。
2. 框架用于组织信息。具体资格限制必须有原始输入、人工确认或明确授权规则作为依据。
3. 先保留输入中所有与研究范围有关的信息，再进行框架映射。框架外的信息作为扩展要素保存。
4. 原始输入保持完整。所有标准化内容保留来源。
5. “未提及”“含义不明确”“明确不限”“不适用”分别表示。
6. 同一个维度可以包含多个要素。一个要素已经明确，其他关联要素仍可能需要确认。
7. 人工决定保存为可追溯记录。后续更新能够说明改变了什么、依据是什么。
8. 已确定的事项直接沿用，避免重复询问。
9. 提问应围绕会实质影响本次研究范围的决定。可选建议不能因尚未接受而无限阻止任务完成。
10. 最终文字与结构化条款保持一致。语言润色不得引入新的范围决定。
11. 模型输出的置信度不能直接作为“已确认”的依据。
12. 已经解决所有必要事项时，直接生成最终标准。

## 三、输入与输出

输入至少支持以下字段。

```json
{
  "research_question": "研究问题原文",
  "additional_requirements": [],
  "review_method": null,
  "question_type": null,
  "question_framework": null,
  "evidence_unit": null,
  "authorized_rules": [],
  "output_language": "zh-CN"
}
```

字段说明

research_question
本次研究问题的完整原文，可以是一句或多句。

additional_requirements
使用者另外指定的人群、研究设计、时间、语言、证据来源、例外等要求。

review_method
证据综合方法，例如系统评价、范围综述、伞状综述。

question_type
研究问题关注的关系或现象，例如干预效果、暴露与结局、诊断准确性、患病率、体验、预后、预测模型或经济学问题。

question_framework
使用者指定的框架。允许为空，由系统生成候选映射。

evidence_unit
拟纳入的证据单位，例如原始研究、系统评价、政策文件或其他证据来源。

authorized_rules
使用者或研究团队明确授权采用的规则。每条规则保存名称、内容、适用范围和版本。

输出包含
1. 当前任务状态。
2. 研究问题及框架映射。
3. 标准化要素。
4. 待确认事项。
5. 草案或最终纳排标准。
6. 来源和人工决定的追溯记录。
7. 当前版本及变更记录。

## 四、综述类型与框架选择

以下字段分别保存，采用多对多关联。

review_method
question_type
framework_id
evidence_unit

例如
1. 范围综述可以使用PCC，也可以根据具体问题采用其他框架。
2. 伞状综述可以涉及干预效果问题，也可以涉及体验等问题。
3. 同一项目可以包含使用PICO和PICo的不同子问题。
4. 相同框架可以服务于不同证据综合方法。

框架处理顺序
1. 检查使用者是否明确指定框架。
2. 提取原始问题中的语义要素。
3. 将语义要素映射到指定框架或候选框架。
4. 保留无法被框架覆盖的附加条件。
5. 当框架歧义会改变要素含义或必要决定时，提出确认问题。
6. 仅影响展示方式、要素含义已经清楚时，可采用临时映射继续处理。
7. 保留框架选择依据和是否经过人工指定的记录。

框架名称需要处理大小写歧义。

PICO与PICo使用不同的内部ID。
pECO可以通过维护好的别名表映射到PECO。
对于无法明确含义的pico，结合上下文判断，必要时确认。
禁止通过统一大写后匹配的方式丢失框架区别。

## 五、框架注册表

建立FrameworkRegistry，使用配置文件保存框架定义。

建议内置以下字段映射。

PICO
population
intervention
comparator
outcome

PECO
population
exposure
comparator
outcome

PEO
population
exposure
outcome

PCC
population
concept
context

PICo
population
phenomenon_of_interest
context

CoCoPop
condition
context
population

PIRD
population
index_test
reference_test
target_condition

SPIDER
sample
phenomenon_of_interest
design
evaluation
research_type

注意
1. PCC中的Concept和Context分别保存。
2. PECO中的Exposure保存为暴露维度。
3. PICo中的Phenomenon of Interest保留其语义。
4. PIRD中的Reference Test与普通干预问题中的Comparator分别保存。
5. SPIDER中的Design和Research type分别保存。
6. 同一个字母在不同框架中可能具有不同含义，内部字段使用完整语义名称。

配置示例

```json
{
  "framework_id": "pcc",
  "display_name": "PCC",
  "version": "1.0",
  "aliases": ["PCC"],
  "slots": [
    {
      "slot_id": "population",
      "display_label": "Population",
      "definition": "研究涉及的人群或对象"
    },
    {
      "slot_id": "concept",
      "display_label": "Concept",
      "definition": "研究关注的核心概念"
    },
    {
      "slot_id": "context",
      "display_label": "Context",
      "definition": "研究涉及的情境或环境"
    }
  ],
  "source_references": []
}
```

注册表应支持
1. 框架名称和别名。
2. 字段定义。
3. 字段示例。
4. 字段之间的关系。
5. 配置版本。
6. 方法学来源。
7. 与方法配置联合执行的检查规则。

新增框架通过配置实现，核心流程复用。

自定义字段保留原始名称和定义。无法确定其含义时，提出框架定义确认问题。

## 六、方法配置与缺失信息检查

建立ReviewProfile，与FrameworkRegistry分开维护。

ReviewProfile至少包含

applicable_dimensions
本次方法与问题类型需要检查的维度。

required_decisions
形成可用纳排标准前需要明确的决定。

conditional_checks
仅在特定情形下触发的检查规则。

supported_evidence_units
可表达的证据单位。

methodological_rules
结局、证据类型、研究设计和其他方法学内容的处理规则。

authorized_defaults
使用者或团队明确授权的默认决定。

source_references
规则来源及版本。

分别检查以下两种完整性。

1. 框架信息完整性
相关研究问题要素是否得到识别和映射。

2. 资格标准完整性
本次纳排标准所需的范围决定是否已经明确。

框架中的字段不自动成为强制限制，也不自动全部成为必填项。

例如
1. PCC问题中缺少对照组，不触发补充对照组的强制问题。
2. 使用PICO，不自动添加“仅纳入随机对照试验”。
3. 研究设计或证据来源范围是否必须确认，根据当前方法、问题和输入判断。
4. 人群以外的研究对象，例如机构、文件或技术，也可以通过适用配置表达。

结局处理规则按方法配置限定适用范围。

关注某个结局、要求测量该结局、要求报告该结局数据，分别记录。
Cochrane干预性综述相关规则仅在适用配置中执行。
其他问题类型依据对应方法配置和人工决定处理。

所有规则区分以下类别。

1. 表达与数据规则
例如来源保留、数值边界、逻辑关系和版本记录。

2. 方法学建议
用于提出建议或发现需要确认的问题。

3. 已授权范围决定
在明确授权范围内直接采用。

方法学建议不能自动转换成已授权范围决定。

## 七、核心数据模型

至少定义以下对象。

ReviewProject
保存项目ID、综述方法、问题列表、配置版本和当前修订版本。

ResearchQuestion
保存单个主问题或子问题、原始表述、框架映射和适用范围。

Source
保存原始输入、人工回答或授权规则。

Element
保存单个提取要素。

ClarificationIssue
保存待确认事项及其状态。

Decision
保存人工决定、原始回答、对应事项和更新范围。

Criterion
保存草案或最终资格条款。

CriteriaSnapshot
保存某一版本的完整输出。

所有对象使用稳定唯一ID。
项目内的Q1、E1等可作为显示编号，内部保存稳定标识。

### 7.1 Source

建议字段

source_id
source_type
original_text
revision
created_at

source_type至少支持

user_input
human_answer
authorized_rule

来源引用保存

source_id
source_revision
quote
必要时保存原文起止位置

原文位置的计数方式在项目中统一。
跨语言实现时，明确使用Unicode字符位置还是其他索引方式。
引用定位必须针对对应版本的原文验证。

### 7.2 Element

建议字段

element_id
question_id
dimension_id
framework_bindings
raw_text
normalized_text
structured_value
source_refs
semantic_role
information_status
decision_status
scope_status
related_issue_ids
revision

semantic_role至少支持

eligibility_condition
review_focus
background_information
undecided

information_status至少支持

explicit
ambiguous
missing
conflicting

decision_status至少支持

accepted_from_input
confirmed_by_user
accepted_by_authorized_rule
pending
proposed

scope_status至少支持

restricted
unrestricted
unspecified
not_applicable

这些状态分别保存。

例如“老年患者”表示存在人群年龄要求，但年龄阈值尚未确定。

```json
{
  "element_id": "E2",
  "question_id": "RQ1",
  "dimension_id": "population.age",
  "framework_bindings": [
    {
      "framework_id": "pico",
      "slot_id": "population"
    }
  ],
  "raw_text": "老年患者",
  "normalized_text": "老年人群",
  "structured_value": null,
  "source_refs": [
    {
      "source_id": "S1",
      "source_revision": 1,
      "quote": "老年患者"
    }
  ],
  "semantic_role": "eligibility_condition",
  "information_status": "ambiguous",
  "decision_status": "pending",
  "scope_status": "restricted",
  "related_issue_ids": ["Q1"],
  "revision": 1
}
```

null表示尚未获得具体值。
明确不限使用unrestricted。
未设定使用unspecified。
未适用的维度使用not_applicable，并保存判断依据。

## 八、阶段一处理流程

按以下顺序执行。
1. 保存原始输入和版本。
2. 识别主问题、子问题及补充要求。
3. 提取全部明确要求、范围信息、限制、例外和关注内容。
4. 解析或确定框架映射。
5. 标准化要素。
6. 验证来源和可程序检查的内容。
7. 根据方法配置检查缺失、歧义和冲突。
8. 合并重复待决事项。
9. 生成需要人工回答的问题。
10. 计算当前任务状态。

不同操作的执行分工如下。

程序负责
输入保存、ID管理、版本管理、结构校验、引用定位、已知数值规则校验、状态计算、更新应用和输出保存。

LLM负责
语义提取、框架映射建议、标准化候选、歧义识别、冲突解释、澄清问题生成及必要的语言整理。

LLM输出先作为结构化候选，通过相应检查后进入项目状态。

### 8.1 标准化要求

允许的操作
1. 展开上下文中含义明确的缩写。
2. 统一范围一致的同义表达。
3. 整理语法和句式。
4. 合并重复信息并保留全部来源。
5. 将多句互补信息组合成完整条件。
6. 对精确等价的单位进行转换。
7. 保留条件、例外和逻辑关系。

必须保留

>与≥的区别。
<与≤的区别。
上下限和闭区间边界。
否定关系。
且或关系。
联合关系。
条件适用的对象。
人群、研究、报告等不同层级。
实施者角色。
例外条款。

例如
“超过18岁”保持>18岁。
“18岁及以上”保持≥18岁。
“6个月”不能无依据固定转换为180天。
“护士主导”保持主导含义。
“运动或教育”保留可替代关系。
“运动联合教育”保留共同要求。

当标准化需要加入新的定义、阈值或范围决定时，建立待确认事项。

### 8.2 语义角色判断

对每项信息分别判断其作用。
1. 明确的人群、干预、暴露、概念、情境或研究设计限制，可以形成相应资格条件。
2. 关注的结局、体验或评价内容先保留其研究用途，再按方法配置和输入确定是否形成资格条件。
3. “是否有效”“能否改善”等措辞表示研究目的，不能直接转换成仅纳入阳性或显著结果。
4. 特定报告格式、测量工具、样本量、质量评分、语言、年份或全文获取要求，均需要独立依据。
5. 框架核心要素以外的明确限制仍须保存。

### 8.3 来源验证

程序验证每个quote确实存在于对应版本的原文中。

对于缺失信息生成的检查项，允许source_refs为空，并记录触发规则。

引用存在不能证明标准化内容忠实。
语义一致性需要结合规则、LLM检查和人工基准验收。
错误的来源关联应作为明确错误返回。

## 九、逻辑结构

条款同时保存自然语言表达和结构化逻辑。

支持以下节点。

predicate
单个条件。

all_of
所有子条件共同成立。

any_of
至少一个子条件成立。

not
对子表达式取反。

示例

原文为“纳入运动或教育干预的随机对照试验”。

C1为运动干预。
C2为教育干预。
C3为随机对照试验。

```json
{
  "op": "all_of",
  "children": [
    {
      "op": "any_of",
      "children": [
        {"op": "predicate", "criterion_id": "C1"},
        {"op": "predicate", "criterion_id": "C2"}
      ]
    },
    {"op": "predicate", "criterion_id": "C3"}
  ]
}
```

实现要求
1. 条件性例外保留适用关系。
2. 联合干预保留共同要求。
3. 多个子问题分别建立逻辑分支。
4. 子问题之间采用共同满足还是任一满足，依据原文或人工决定。
5. 排除条件保存实际排除情形，避免重复取反。
6. 同一条件的正反表达需要检查一致性。
7. 逻辑不清楚时提出确认问题。
8. 逻辑树与展示文本相互对应。

本逻辑结构用于保存和生成纳排标准中的条件关系。

## 十、人工确认机制

### 10.1 ClarificationIssue

建议字段

issue_id
question_id
element_ids
reason_code
question_text
options
scope_impact
blocking
trigger_rule_id
status
created_at_revision
resolved_by_decision_id

reason_code至少支持

AMBIGUOUS_MEANING
表述具有多个影响研究范围的解释。

AMBIGUOUS_BOUNDARY
已有明确限制，但边界、阈值或定义不清楚。

MISSING_REQUIRED_DECISION
缺少当前任务所需的核心决定。

CONFLICTING_REQUIREMENTS
同一范围内出现相互冲突的要求。

UNCLEAR_LOGIC
条件之间的关系不明确。

UNRESOLVED_ROLE
信息是否承担资格条件作用尚未确定。

PROPOSED_RESTRICTION
存在需要人工决定的额外限制建议。

FRAMEWORK_AMBIGUITY
框架歧义影响要素含义或必要决定。

示例

```json
{
  "issue_id": "Q1",
  "question_id": "RQ1",
  "element_ids": ["E2"],
  "reason_code": "AMBIGUOUS_BOUNDARY",
  "question_text": "本研究将老年人定义为多少岁及以上？",
  "options": [],
  "scope_impact": "决定允许纳入的人群年龄范围",
  "blocking": true,
  "trigger_rule_id": "population_age_boundary",
  "status": "open",
  "created_at_revision": 1,
  "resolved_by_decision_id": null
}
```

### 10.2 是否阻止完成

blocking必须有触发依据。

通常需要解决后才能完成的事项包括
1. 当前研究对象或核心范围无法确定。
2. 明确要求相互冲突。
3. 原文提出限制但操作边界不清楚。
4. 当前方法配置要求明确的关键决定缺失。
5. 条件逻辑歧义会改变资格范围。

以下情况应分别处理
1. 非必要附加条件未提及，保持unspecified。
2. 模型自行提出的可选建议，可以保持proposed。
3. 已有授权规则覆盖的事项，按授权处理并保留来源。
4. 已由其他回答解决的事项，更新为已解决。
5. 已失去适用性的事项，标记为已失效并记录原因。

未提及的非必要限制和未接受的可选建议，不应持续阻止最终生成。

### 10.3 问题生成

每个问题应说明

对应哪个要素。
当前哪里不明确。
需要作出什么决定。
不同答案会影响什么范围。

必要时提供中性的可选答案，并保留自由输入。
适用时允许回答不限、不适用或暂不决定。

将相关问题合并。
优先解决会影响后续条款的决定。
避免重复询问已明确事项。
根据实际问题动态提问，避免机械遍历所有潜在限制。

## 十一、人工回答与状态更新

支持结构化回答和自然语言回答。

结构化回答直接关联issue_id。
自然语言回答由LLM解析为候选更新，再进行校验。

更新示例

```json
{
  "base_revision": 3,
  "request_id": "answer-request-001",
  "answers": [
    {
      "issue_id": "Q1",
      "answer_text": "定义为65岁及以上",
      "updates": [
        {
          "element_id": "E2",
          "structured_value": {"operator": "gte", "value": 65, "unit": "year"},
          "decision_status": "confirmed_by_user"
        }
      ]
    }
  ]
}
```

更新处理顺序
1. 保存回答原文。
2. 建立Decision记录。
3. 关联问题和要素。
4. 校验更新是否符合回答含义。
5. 检查是否与已有决定冲突。
6. 应用已明确的更新。
7. 重新计算受影响的条款及问题状态。
8. 更新项目版本。

需要支持
1. 部分回答。
2. 一个回答解决多个问题。
3. 暂不决定。
4. 明确不限。
5. 明确修改旧决定。
6. 新回答意图不清。
7. 回答无法对应到问题。
8. 重复提交。
9. 异步LLM结果晚于人工修改返回。

处理规则

部分回答只更新已解决事项。
暂不决定保留待确认状态。
明确不限保存为unrestricted。
明确修订旧决定时，保存旧值、新值和来源。
新旧要求冲突且修改意图不清时，提出具体确认问题。
无法对应的问题先确认对应关系。
同一request_id避免重复应用。
每次LLM请求关联项目版本。旧版本结果不能覆盖新版本人工决定。
版本冲突返回明确状态，并针对受影响内容重新检查。

## 十二、最终标准生成

最终生成优先依据已通过检查的结构化数据。

处理顺序
1. 收集原文已明确、人工已确认和依据授权规则确定的要素。
2. 构建纳入条款和排除条款。
3. 保留条件关系与适用例外。
4. 合并重复条款。
5. 按研究问题、框架和语义维度组织输出。
6. 单独呈现研究关注内容及其他范围决定。
7. 完成检查。
8. 保存CriteriaSnapshot。

Criterion至少包含

criterion_id
question_ids
disposition
dimension_id
text
expression
source_element_ids
source_decision_ids
source_rule_ids
revision

disposition支持include和exclude。

建议由程序根据结构化数据生成基础文本。
需要LLM整理语言时，整理后的文本必须再次与结构化内容核对。
润色不能引入新的条件、阈值或例外。

最终完成条件
1. 所有明确范围要求均已对应到条款或有依据的用途说明。
2. 所有blocking问题已经解决。
3. 每条强制标准均有充分来源。
4. 条款间没有未解决的实质冲突。
5. 数值、单位、概念范围和逻辑关系正确。
6. 人工决定已经准确落实。
7. 多个子问题的适用范围明确。
8. 展示文本与结构化条款一致。

具备完成条件时直接生成最终版本。

使用者要求查看中间结果时，可以生成部分确认草案，标明剩余必要事项。

最终输出包括
1. 研究目标。
2. 综述方法和框架。
3. 纳入标准。
4. 排除标准。
5. 关注内容及其用途。
6. 明确不限事项。
7. 尚未设定的非必要附加限制。
8. 条款来源。
9. 当前版本和变更记录。
10. 检查结果。

没有独立排除条款时，说明资格范围由现有纳入条件确定。
保持这个状态与尚未解决的排除范围决定之间的区别。

## 十三、内部模块与接口

建议模块

FrameworkRegistry
管理框架及字段配置。

ReviewProfileRegistry
管理方法配置和适用规则。

SourceStore
保存原文及人工回答。

ElementExtractor
提取语义要素。

FrameworkMapper
完成框架映射。

ElementNormalizer
生成标准化要素。

ProvenanceValidator
验证来源与原文定位。

ClarificationDetector
识别待确认事项。

QuestionGenerator
生成澄清问题。

DecisionApplier
受控应用人工决定。

CriteriaBuilder
构建条款和逻辑结构。

CriteriaValidator
检查完整性与一致性。

OutputRenderer
生成用户可读结果。

建议函数接口

resolve_review_context
输入原始信息、指定类型和配置。
输出类型、框架候选、依据和歧义。

extract_elements
输入原始信息和问题结构。
输出要素与来源。

map_framework_slots
输入要素和框架配置。
输出映射及扩展要素。

normalize_elements
输入要素和授权规则。
输出标准化候选。

validate_provenance
输入候选和原文。
输出引用校验结果。

detect_clarification_issues
输入要素和方法配置。
输出待确认事项。

generate_questions
输入待确认事项。
输出可回答的问题。

apply_decisions
输入当前状态和人工回答。
输出更新状态及变更记录。

build_criteria
输入已确定要素和逻辑关系。
输出纳排条款。

validate_criteria
输入条款、原文和人工决定。
输出检查结果。

render_output
输入通过检查的条款。
输出用户可读结果。

这些模块可以复用现有项目的服务或函数组织方式。
避免为每个框架分别复制整套处理流程。

## 十四、LLM调用与异常处理

每次调用应明确指定
1. 当前任务步骤。
2. 适用的框架和方法配置。
3. 当前输入及版本。
4. 已确认内容。
5. 期望返回的数据结构。
6. 当前步骤允许提出的候选更新。

所有LLM输出通过结构校验。

至少处理以下异常

返回内容无法解析。
必需字段缺失。
枚举值不合法。
引用不存在。
原文位置与引用不符。
更新目标不存在。
逻辑节点不完整。
引用了其他问题的条目。
结果对应旧版本。
模型调用超时或失败。

异常发生时保留已有有效状态。
返回明确的错误步骤与原因。
重试次数作为配置参数。
重试耗尽后提示具体失败内容。

模型提供的结构化输出仍需验证其语义。
程序校验通过与方法学准确性分别评价。

## 十五、最小用户界面

界面至少包含以下内容。

1. 输入区
研究问题。
附加要求。
可选综述方法。
可选问题框架。
可选授权规则。

2. 要素区
原文。
标准化内容。
框架字段。
确定状态。
条款角色。
来源。

3. 确认区
问题内容。
范围影响。
可选答案。
自由输入。
对应要素。
已回答和待回答状态。

4. 标准区
当前草案或最终标准。
适用研究问题。
纳入与排除条款。
来源。
版本。
变更记录。

支持以下操作

修改提取内容。
修改综述方法或框架。
回答部分问题并保存。
恢复已有任务。
查看条款来源。
修改既有决定。
查看受影响条款。
查看多个子问题的独立标准。
导出结构化结果和可读文本。

实际调用模型和演示数据在界面上清楚区分。
用于开发的模拟结果应明确标注。

## 十六、验收用例

建立以下回归用例，并根据实现增加必要边界测试。

1. PICO问题未指定研究设计
预期保留设计未定状态，不自动加入仅限RCT。

2. PECO问题涉及环境暴露
预期保存为exposure并保留暴露定义。

3. PCC问题包含Concept和Context
预期分别映射两个字段。

4. PCC问题无对照组
预期不产生补充对照组的强制问题。

5. PICO和PICo分别输入
预期正确区分框架。

6. pECO输入
预期通过明确别名映射至PECO。

7. 含义不明确的pico输入
预期结合上下文处理，必要时确认。

8. CoCoPop问题
预期分别保存Condition、Context和Population。

9. PIRD问题
预期分别保存Index Test、Reference Test和目标疾病。

10. SPIDER问题
预期分别保存Design和Research type。

11. 新增自定义框架
预期通过配置支持提取、确认和生成。

12. 原文包含框架外限制
预期保留并追溯该限制。

13. 同一项目包含不同框架的子问题
预期各条款作用范围正确。

14. 原文为>18岁
预期输出保持>18岁。

15. 原文为运动或教育
预期保留任一满足关系。

16. 原文为运动联合教育
预期保留共同要求。

17. 原文为老年人
预期保留人群限定并确认年龄边界。

18. 原文已明确≥65岁
预期直接使用该边界，避免重复询问。

19. 未提及语言限制
预期保持未设定状态。

20. 人工回答语言不限
预期更新为明确不限。

21. 只回答部分问题
预期保留已确认内容，继续处理其他必要事项。

22. 人工明确修改旧条件
预期更新并保留历史。

23. 新旧条件冲突且意图不清
预期提出冲突确认。

24. 引用存在但标准化改变范围
预期在语义评价中识别错误。

25. 旧版LLM结果晚于新版人工回答返回
预期新版人工决定保持有效。

26. 重复提交同一回答
预期更新只应用一次。

27. 可选建议没有被接受
预期不会因此无限阻止完成。

28. 全部必要决定完成
预期直接生成可追溯最终标准。

29. 模型返回非法JSON或错误枚举
预期报告明确错误，保留已有有效状态。

30. 模型拟加入仅限阳性或显著结果
预期要求明确依据，并将研究目的与结果限制分别处理。

31. 关注结局与资格条件用途不同
预期按适用方法和人工决定正确记录。

32. 研究者允许特定例外
预期最终条款完整保留该例外及适用条件。

## 十七、测试与完成要求

测试分为两类。

1. 程序规则测试
验证数据结构、数值边界、状态更新、逻辑表达、引用定位、版本冲突和重复提交处理。

2. 真实LLM输出评价
验证要素提取、框架映射、标准化忠实度、澄清问题必要性和人工决定落实情况。

模拟模型可以用于程序规则测试。
真实LLM评价使用明确标注的案例和人工预期结果。
不能将模拟输出测试结果表述为真实模型的能力验证。

完成开发时提供
1. 已实现功能。
2. 本地启动和使用方法。
3. 框架与方法配置的新增方式。
4. 模型连接和必要配置方式。
5. 实际运行过的测试及结果。
6. 仍未验证的部分和具体原因。

敏感配置通过项目适用的环境变量或配置机制读取。
实际模型测试涉及必要配置时，先完成其余可独立完成的工作，再说明缺少的具体配置。

## 十八、方法学参考

框架定义和方法规则应记录来源及版本。

JBI Manual for Evidence Synthesis
https://jbi-global.atlassian.net/wiki/spaces/MANUAL

Cochrane Handbook 第3章
https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-03

Identifying the PECO
https://pmc.ncbi.nlm.nih.gov/articles/PMC6908441/

Beyond PICO The SPIDER tool for qualitative evidence synthesis
https://pubmed.ncbi.nlm.nih.gov/22829486/

资料用于维护框架定义、方法学建议和适用规则。
研究范围的具体决定仍须追溯至本次输入、人工确认或已明确授权的规则。
