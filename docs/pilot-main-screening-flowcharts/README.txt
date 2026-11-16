Pilot screening 与 Main screening 技术流程图
实现版本：80a1ab3c68621d64292567e881f1d0c47de89f39；2026-11-16。

在线阅读：https://aimsetp.com/pilot-main-screening-flowcharts.html
本地阅读：解压后用浏览器打开 index.html，可直接看图和展开技术细节。
PNG也可单独打开；.mmd为Mermaid可编辑流程源码。

1. pilot-screening / 配置与 Prompt
当前标准、独立编辑、AI 四部分起草、保存与版本保护。
2. pilot-screening / 抽样与模型执行
不重复抽样、本轮冻结、TypeSafe 两阶段调用、三分类证据门控与续跑。
3. pilot-screening / 反馈学习与批准
人工纠错、完整 Prompt 补充、相关示例、三分类统计、批准和正式筛选入口。
4. main-screening / 双次判断与证据汇总
有效 Pilot 评价继承、同一模型两次阅读、逐条件归一化与冲突判定。
5. main-screening / 人工复核与结果汇总
冲突处理、Maybe 保留、有效人工决定优先级、分类浏览与完成条件。
6. main-screening / 导出、全文交接与版本保护
继续评估集合、排除集合、导出证据、IndexedDB 内部交接及归档保护。

重要：Maybe不转成Include；同一模型两种阅读顺序不等于独立评审；反馈属于上下文补充；未解决冲突不导出到继续集合。当前浏览器存储不等于云同步。
