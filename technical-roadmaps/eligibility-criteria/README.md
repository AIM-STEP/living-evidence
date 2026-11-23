# Eligibility Criteria

## 1. 技术流程

机器生成一次性提交问题，人工生成按框架逐项填写。两种入口共用原文条款清单、要素标准化、TypeSafe Jev 逐条核对、作者确认、保存和下游交接。明示条款仍有缺项时保存为草稿。待作者确认、验证失败或输入已变更时也暂停下游交接。流程图标出了何时人工核对、何时提示补充短问题，以及哪些条件会进入筛选。

[打开高清流程图](2026-11-22/figures/eligibility-workflow.png) · [流程说明和制图源码](2026-11-22/README.md) · [原文提取技术细节](source-grounded-extraction.md)

## 2. 执行技能

执行技能按流程节点组织，每项列明输入、完成条件和实际调用的模块。两种入口都由同一后台编排器运行这些模块。

[执行技能 SKILL.md](skills/eligibility-criteria/SKILL.md) · [运行编排](../../app/eligibility/background.js)

## 3. 错误与反馈记录本

记录本保存可复现的问题、修正办法及检查。生成时按当前原文匹配已验证的技巧，每次最多两条。作者确认直接更新当前项目的标准。服务异常按固定代码归档，供排查和复现。

[错误与反馈记录本](extraction-notebook.md) · [运行时纠错与计数](../../app/eligibility/lessons.js)

## 发布验证

运行 `sh tools/check_eligibility_release.sh` 检查纳排、检索和筛选回归。用 `node tools/evaluate_eligibility_v3.cjs --case stroke-balance-training` 可在本地模型与 Jev 可用时复跑英文比较题。实模复测与程序测试分别记录。

## 后台保存位置

| 保存内容 | 位置 |
| --- | --- |
| 技术流程、执行技能、通用错误与反馈记录 | 仓库的 `technical-roadmaps/eligibility-criteria/`。流程及源文件保存在 `2026-11-22/`，执行技能在 `skills/`，通用记录本为 `extraction-notebook.md`。 |
| 项目的标准、原文引用及作者决定 | 按项目保存到当前浏览器的 `aimstep-eligibility-v3:<projectId>` 和 Criteria 工作记录。 |
| 本次生成中逐条核对通过的规则 | 浏览器的 `aimstep-eligibility-generation-draft:<projectId>`，供 Criteria 预览。完成后的标准通过原有项目记录交接。Criteria Clear 一并清除。 |
| 项目执行反馈 | 浏览器的 `aimstep-eligibility-lessons:<projectId>`，仅保存固定错误类别和计数。Criteria Clear 一并清除。 |
| 服务端运行记录 | 服务器私有的 `private/eligibility-criteria/notebook/`，站点目录之外。按 UTC 日期归档，字段为时间、阶段、错误代码和数量。模型服务请求次数和浏览器生成次数分别统计。 |
