# Eligibility Criteria 技术流程图

![机器生成和人工生成两条路径，以及 Criteria 预览、作者核查、导出和筛选交接](figures/eligibility-workflow.png)

[打开高清 PNG](figures/eligibility-workflow.png) · [制图源码](sources/workflow.py)

图示主流程适用于线上 `20261120-criteria-release-36`，也适用于工作区 `20261120-criteria-release-37`。[线上实现对应提交](https://github.com/AIM-STEP/living-evidence/commit/c6a6d88843d958b48ba4b4209a12a894404e61e3)

机器生成时，作者对待确认项的选择直接应用到标准和预览，无需再次调用模型。点击 **Clear** 会保留问题框内容，清除该项目的标准、草稿和附件，并使清除前的任务无法回写。

[详细技术说明](../source-grounded-extraction.md) · [提取记录本](../extraction-notebook.md)
