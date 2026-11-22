# Eligibility Criteria 技术流程图

![完整问题和逐项填写两种输入汇入同一套提取、核对、作者确认与交接流程](figures/eligibility-workflow.png)

[打开高清 PNG](figures/eligibility-workflow.png) · [制图源码](sources/workflow.py)

本图对应 `20261122-criteria-release-38`。机器生成接收一次性提交的完整研究问题。人工生成保留作者选定的框架及逐项填写的纳入、排除和例外。输入准备完成后，两种方式共用候选提取、原文校验、TypeSafe Jev 核对与标准构建流程。

作者对待确认项的选择直接应用到标准和预览，无需再次调用模型。点击 **Clear** 会保留问题框内容，清除该项目的标准、草稿和附件，并使清除前的任务无法回写。

[详细技术说明](../source-grounded-extraction.md) · [提取记录本](../extraction-notebook.md)
