# 美股估值来源核查（2026 年 11 月 6 日）

需求是美股主要指数及行业板块的 PB、PS 历史分位，保留真实观测日期和实际计算窗口。当前未接入符合这一完整范围的数据源；不以个股样本、ETF 当前倍率或社区自编行业序列冒充已发布的指数历史。

| 候选 | 已核实能力 | 当前缺口 |
| --- | --- | --- |
| [易方达 NDX 官方详情](https://www.etf.com.cn/api/etf-api-service/index/detail?indexCode=NDX)及其指定的[估值文件](https://cdn.efunds.com.cn/etf-net/index_valuation_percentile_NDX.json) | 实测取得 2026 年 1 月 22 日至 11 月 5 日的 200 条 NDX 观测 | PB、PS 原值均为空；部分 PS 分位字段为 0，不能把这个 0 当真实分位 |
| [AKShare 指数文档](https://github.com/akfamily/akshare/blob/main/docs/data/index/index.md) | 美股指数日线、中证估值等公开适配器 | 查阅的当前文档未提供覆盖美国主要指数和行业板块的完整 PB／PS 历史接口；历史接口名不能替代实测数据 |
| [StockCheck 社区样本](https://github.com/getstockcheck/stockcheck-historical-valuation) | 美国及香港各 50 只大市值个股的 PE／PB／PS 与历史分位样本 | 个股样本不是指数或行业整体，不能把个股分位平均当作板块分位 |
| [Are Stocks Cheap 行业表](https://www.arestockscheap.com/sector-valuations) | 11 个 SPDR 行业 ETF 与 SPY 的当前 PB／PS；页面明确标 2026 年 11 月 2 日 | ETF 倍率，不是指数历史；页面说明无长期 PB／PS 历史，横向评分不是历史分位 |
| [DefeatBeta](https://github.com/defeat-beta/defeatbeta-api/blob/main/doc/api/Value_Examples.md)／[计算代码](https://github.com/defeat-beta/defeatbeta-api/blob/main/defeatbeta_api/data/ticker.py) | 公开 Yahoo 数据的个股与行业历史 PB／PS；`industry_pb_ratio`、`industry_ps_ratio` | 函数先按当前 profile 选择行业成员，再把季度财务数对齐日行情进行回算；不是带历史成分和财报实际公开时间的官方行业指数序列。财报缺失及非正净资产还会改变有效成员池 |
| [股叉叉 NDX](https://guchacha.com/index-valuation/NDX) | 公开页面可见 NDX PB／PS 原值和历史图 | 实测公开序列为约一年、53 个周频点，载荷标记 `limited`；页面摘要的上市以来分位与图卡的短期分位不同。没有足够公开数据验证用户所需窗口与全部行业，未绕过限制或导入 |
| [理杏仁美国指数 API](https://www.lixinger.com/api/open-api/html-doc/us/index/fundamental) | 文档明确提供 PB、PS-TTM、1／3／5／10／20 年统计及加权方式 | 必须使用用户 token；当前没有既有订阅，不新增凭证或采购。行业覆盖仍需另外核实 |

免费社区方案中，DefeatBeta 值得作为独立行业研究的候选，但需要先明确“当前成员回算”的口径，验证财报时点、历史成员和可用样本。现阶段没有将其输出标作发布者的历史指数估值，也未把缺失值改为 0。

已有 CN PB／PS 仍由易方达同一来源真实原值生成，排名排除当前观测，最多十年、至少 60 个有效观测。新增 `through` 是实际参与排名的最后一个有效日期，与 PB／PS 各自的 `from`、`samples` 一起供气泡使用；无该字段的旧快照按“截至观测日前，不含当日”显示，不猜测前一交易日。
