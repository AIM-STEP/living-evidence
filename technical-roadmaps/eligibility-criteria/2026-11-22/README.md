# Eligibility Criteria 技术流程图

![两种输入共用提取、核对与交接流程，机器端单要素短问题可触发补充建议](figures/eligibility-workflow.png)

[打开高清 PNG](figures/eligibility-workflow.png) · [制图源码](sources/workflow.py)

本图对应 `20261122-criteria-release-39`。机器生成接收一次性提交的完整研究问题。人工生成保留作者选定的框架及逐项填写的纳入、排除和例外。输入准备完成后，两种方式共用候选提取、原文校验、TypeSafe Jev 核对与标准构建流程。

对符合条件的已登记项目，机器生成收到只覆盖一个框架要素的短问题时，可在 **Criteria** 预览中显示最多两项带方法学出处的补充建议。作者可以采纳、补写或跳过。经作者确认的内容才会成为筛选规则。当前短问题识别针对机器端的单要素短文本，人工表单提交时附加的分段标题会使它无法匹配这一识别条件。

作者对待确认项的选择直接应用到标准和预览，无需再次调用模型。点击 **Clear** 会保留问题框内容，清除该项目的标准、草稿和附件，并使清除前的任务无法回写。

[详细技术说明](../source-grounded-extraction.md) · [提取记录本](../extraction-notebook.md)
