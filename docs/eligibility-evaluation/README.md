> Nutrition/IPD-NMA update: the user's original objective now has a dedicated [program and frontend regression](nutrition-methods-tests.json) and [reference output](nutrition-methods-regression.json). Semantic responses in these tests are simulated and deliberately reproduce the reported defects. The new live-model attempt is incomplete; it is not counted as a pass. Existing real-model records below remain historical records.

> Production frontend update: the established English interface has been restored. The technical workspace and its DOM test have been removed. The new methodology runs through the headless adapter behind the existing Generate and confirmation flow. Current regression and integration results are in [classic-frontend-tests.json](classic-frontend-tests.json); the workspace DOM result below is a historical development record, not the current production interface. No new live-model accuracy claim is made for this frontend change.

# 本次纳排模块验收记录（2026-11-18）

本目录仅包含开发者合成的输入，不包含用户项目资料或密钥。程序规则验证、模拟模型交互和真实模型观察分别记录；这里没有独立专家标注的临床准确率。

## 程序和交互

[program-tests.json](program-tests.json) 保存实际运行命令对应的输出及退出码：

- 规格要求的32项程序验收全部通过。
- 19项补充检查全部通过，覆盖Unicode位置、精确来源版本、跨问题引用、数值/显示一致、授权规则修订、旧版人工决定与文档迁移、自定义框架规则、无法对应的回答、证据单位修订等。
- LinkeDOM交互测试通过：必要年龄确认后立即更新最终标准、旧工具同步、失败保留、恢复、跨页面版本冲突、旧编辑器冲突时原子回滚，以及“或”关系同步时不变成“且”。**模型输出为模拟；没有验证浏览器渲染或真实模型能力。**
- 16组已有功能回归通过，包括原文依据、人工确认、标准描述、进度、预览编辑、已确认规则、澄清选项、方法锁定、嵌入手动编辑、清空、项目任务状态、检索条件编辑、模型策略、筛选提示及工作流、Toolset面板。
- 变更HTML的16个内联脚本及新版JS模块语法检查通过，`git diff --check`通过。

实际尝试使用agent-browser时，工具不能写入其 `/Users/achieve/.agent-browser` 运行目录，未能启动。没有截图或真实浏览器视觉验收；这与DOM测试分别报告。

## 真实模型观察

模型实际返回的标识为 `gemma4:31b-it-q8_0`，通过项目原有 `/api/eligibility/model` 调用。下表中的通过只表示对应开发案例的流水线观察，不表示框架或研究领域的总体准确率。原始请求、实际输出和检查结果保存在各JSON中。后端没有在响应中提供完整采样参数，不能仅凭请求声称可精确重现模型生成。

| 案例 | 观察 | 记录 |
| --- | --- | --- |
| 明确年龄 `>18 years`，PICO | 早期真实输出及原样回放保留 `gt 18 year`，未加入RCT限制 | [strict-age-recorded-real.json](strict-age-recorded-real.json) |
| `Include elderly people` → 回答 `65 years or older` | 先提出必要边界问题，回答后生成 `gte 65 year`，保存人工来源与决定，自动完成；模型初始范围状态错误由程序纠正，不能算原始模型全对 | [elderly-answer-real.json](elderly-answer-real.json) |
| 空气污染暴露，`pECO` | 映射到PECO的exposure并实际生成纳入条款；单独语义评审后仍有 `scope_status` 错误，由程序按源条件纠正并记录 | [peco-exposure-real.json](peco-exposure-real.json) |
| 数字健康素养与社区情境，PCC | 已提交真实请求；验证客户端多次30秒内未取得响应，未获得可评价输出，**未完成真实模型评价** | [pcc-transport-incomplete.json](pcc-transport-incomplete.json) |

这些案例曾被用于修正本次实现，不是独立留出集。年龄/人工回答记录来自开发中较早的提示词；之后语义评审增加了角色与范围字段，不能把旧响应冒充最终提示词的重新运行。PECO文件是更新逻辑schema与语义评审后的真实调用记录。程序规则回归针对当前实现全部运行通过。

## 失败结果和修正

- [rejected-elderly-answer-real.json](rejected-elderly-answer-real.json)：模型把“65岁及以上”的回答动作标为unrestricted，导致边界未落实。后来将动作限定为confirm/modify/defer，明确区分范围状态，并验证实际数字与回答；修正后另有真实回答通过记录。
- [rejected-peco-role-real.json](rejected-peco-role-real.json)：模型把明确纳入的暴露错当关注内容，最终没有条款。原评价器只检查维度、曾误报通过；人工复核后本文件明确重新判为失败，保留 `original_automated_passed` 和未修改的原始请求/响应。评价器现要求实际生成对应纳入条款，产品校验也拒绝空标准作为最终版本。
- [rejected-peco-logic-real.json](rejected-peco-logic-real.json)：模型产生没有子节点的逻辑操作符，被程序拒绝，未进入有效项目状态。随后为模型schema增加非空子节点及not节点个数约束，保留有限重试；更新后的PECO案例通过。

这些修正不构成自然语言含义的形式化证明。程序检查、来源存在和第二次模型评审仍可能漏掉细微范围错误。独立验证仍需研究团队提供真实问题及专家裁定的预期要素、必要澄清、决定和条款；各框架复杂例外、多子问题及领域特有规则目前主要由程序夹具覆盖。

重跑方式和配置见 [../eligibility-implementation.md](../eligibility-implementation.md)。JSON报告中的内部ID绑定当时项目和来源版本；重放必须沿用同一输入状态且校验原始请求散列，不能把新提示词与旧响应混合标为真实调用。
