---
name: eligibility-criteria
description: 执行或维护 AIM-STEP 的 Eligibility Criteria 流程，包括从原文提取纳排要素、逐条独立核对、处理作者决定、交接筛选，以及将可复现的问题反馈到执行中。
---

# Eligibility Criteria 执行技能

从[技术流程](../../2026-11-22/README.md)定位当前步骤，从[错误与反馈记录本](../../extraction-notebook.md)查找已知错误类别及复现检查。机器和人工输入进入同一条执行流程。

| 执行技能 | 输入和完成条件 | 实际执行模块 |
| --- | --- | --- |
| 准备原始材料 | 读取一次提交的问题或作者逐项填写的条件，保留附件页码、来源版本和原文。 | [输入与来源处理](../../../../eligibility.html) · [文档读取](../../../../app/eligibility/document.js) |
| 提取、定位和标准化 | 本地模型按来源提取。建立框架字段、纳排方向、规范表述与原文引文的对应关系，保留阈值、单位、时点、逻辑关系和例外。 | [模型与提取](../../../../app/eligibility/model.js) · [框架定义](../../../../config/eligibility-frameworks.json) · [方法配置](../../../../config/eligibility-review-profiles.json) |
| 独立核对并处理分歧 | 候选就绪即送 TypeSafe Jev 单条核对。通过项进入标准。无判定时重试该条一次，仍无则略过。原文歧义和影响筛选范围的未决关系交作者。 | [逐条核对](../../../../app/eligibility/model.js) · [Jev 后端](../../../../tools/eligibility_hybrid_review.py) · [规则与作者决定](../../../../app/eligibility/engine.js) |
| 提示和交接 | 合格的已登记项目仅有单要素短问题时，可选提示最多两项缺失要素。作者确认后，按已生效的纳排规则交给检索和筛选。 | [短输入建议](../../../../app/eligibility/sparse-input.js) · [结果保存与交接](../../../../app/eligibility/background.js) |
| 记录和反馈 | 复现问题后，在记录本注明触发条件、修正和检查。可复用的技巧进入提示规则。项目计数只影响与当前原文匹配的提示排序。服务故障按固定代码另记。 | [提示与项目计数](../../../../app/eligibility/lessons.js) · [服务端记录](../../../../tools/eligibility_notebook.py) |

原文、作者决定和验证结果构成项目规则的依据。提示每次最多两条，来源为已核实的固定技巧。作者确认或舍弃建议应作为项目决定保存，只有被验证的执行错误或修正才更新错误反馈。
