# 技术路线图档案

本目录专门保存 AIM-STEP 各模块的技术流程图和路线图，包括可直接阅读的图片、可编辑流程源码、生成提示词及对应实现版本。

## 当前目录

| 模块 | 日期 | 内容 | 在线查看 |
|---|---|---|---|
| [Eligibility criteria](eligibility-criteria/README.md) | 2026-11-22 | 技术流程、执行技能、错误与反馈记录本 | [打开流程图](https://aimsetp.com/technical-roadmaps/eligibility-criteria/2026-11-22/figures/eligibility-workflow.png) |
| [Search strategy](search-strategy/2026-11-16/README.md) | 2026-11-16 | 标准和种子、词汇扩展、Boolean编译、检索与保存；四张图 | [打开四张图](https://aimsetp.com/search-strategy-flowcharts.html) |
| [Screening source](screening-source/2026-11-16/README.md) | 2026-11-16 | 完整数据流、报告级去重、同研究多报告关联、同步导出及 Pilot 交接 | [打开四张图](https://aimsetp.com/screening-source-flowcharts.html) |
| [Pilot screening](pilot-screening/2026-11-16/README.md) | 2026-11-16 | 配置与 Prompt、抽样与执行、反馈学习与批准；三张详细图 | [打开图 1–3](https://aimsetp.com/pilot-main-screening-flowcharts.html#01-pilot-configuration) |
| [Main screening](main-screening/2026-11-16/README.md) | 2026-11-16 | 双次判断、人工复核、结果汇总、导出与全文交接；三张详细图 | [打开图 4–6](https://aimsetp.com/pilot-main-screening-flowcharts.html#04-main-two-readings) |

## 归档约定

按“模块 / 日期”保存，每次新增或修订路线图时建立相应日期的目录，保留已发布版本以便追溯。

```text
technical-roadmaps/
  README.md
  <module>/
    README.md
    YYYY-MM-DD/
      README.md
      figures/              高清图像
      sources/              可编辑流程源码（如 Mermaid）
      drawing-prompts.txt   使用图像生成时保存的提示词
```

每个版本的说明应记录对应代码版本、图像用途、关键规则和适用范围。实际实现流程与未来规划应明确区分；仅有示意图时，不应据此声称功能已实现或准确率已验证。

本目录用于归档说明资料；现有网页及已提供的图片查看、下载地址继续保留。

