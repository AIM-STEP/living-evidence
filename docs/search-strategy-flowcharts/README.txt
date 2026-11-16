Search strategy 技术流程图
依据实现：26bd92ad9afa53942456e8ea9db2908a5013f8c6；2026-11-16。

在线查看：https://aimsetp.com/search-strategy-flowcharts.html
本地查看：解压后用浏览器打开 index.html。图片与技术细节可离线阅读，Mermaid可单独编辑。

1. 标准接入与检索元素
导入当前条件、显式选择检索元素、AI 核心词种子与手工关键词保护。
2. 词汇扩展与外部核对
LLM 同义候选、NLM MeSH 真正词条匹配、受限语义复核与命中信号。
3. Boolean 规划与数据库编译
以精确词表 ID 生成可验证 AND/OR 树，再编译各库字段和限制。
4. 检索执行、保存与交接
两个直接 API、外部平台、批次进度、标识符归并、导出与 Screening source。

只有 PubMed 与 Europe PMC 支持本页直接检索；其他数据库为策略草稿及外部执行。MeSH 词条成员身份、词条命中数和给定参考集覆盖均不等于独立检索性能证明。
图像由本会话内置imagegen绘制；精确逻辑以配套文字与固定版本源码为准。
