# Stock Daily

A 股与美股的每日信号看板。默认左侧沪深 300、右侧标普 500；手机按相同顺序纵向排列。

## 页面

- 最近 365 天的涨跌热力图使用 `react-activity-calendar`，红涨绿跌，颜色随幅度加深。桌面分两行、手机分三行，窄屏进一步换行。年度范围在双市场上方共用一处，彩虹主题用于品牌及界面装饰。
- 五个指标：贪恐指数、14 日 RSI、20 日均线偏离、20 日量能比、52 周位置。说明、前值和来源放在气泡里，支持悬停、键盘聚焦和手机点击。
- 顶部居中搜索股票名称或代码，选中后替换对应市场，另一市场保持显示；可随时返回大盘。
- 搜索记录仅保存在浏览器 localStorage，按最近使用排序、去重、最多 10 条，可清空。
- 行情每分钟刷新一次，仅在页面可见时请求。日期使用交易所时区，明确标注盘中或收盘。

## 数据口径

A 股日线来自腾讯证券，美股日线来自 Yahoo Finance，名称和代码搜索来自东方财富。行情可能存在来源延迟，不承诺交易级实时性。A 股采用前复权日线，美股采用来源的拆股调整日线，热力图是价格涨跌而非含分红总收益。

服务端先校验代码、交易所、日期、重复记录和 OHLC 数值，再由日线计算指标。交易日缺数显示空格，不用零涨跌或模拟行情补齐；接口不可用时显示错误并支持重试。已有行情刷新失败时保留上一份读数，明确提示更新失败。

量能比使用前 20 个完整交易日均量作为分母，盘中不提供该读数。RSI 历史不足 15 个交易日、趋势不足 20 个交易日、区间不足 52 周或成交量缺失时显示空值。贪恐数据缺失时显示空值，不用其他指标代替。

贪恐数据：A 股使用[百分位自编指数](https://baifenwei.com/indicator/fear-greed/)公开 CSV，保留来源署名，每小时刷新；美股使用 [Fear & Greed](https://fearandgreednow.com/about) 转引的 CNN 股票市场读数，每 5 分钟刷新。两者方法不同，都是市场情绪，不是个股评分。当前美股转引源只有有日期的当前读数，历史日期留空；不会将未带确切日期的周/月比较值冒充逐日历史。

点击热力图交易日期后，价格、涨跌和指标一起回溯；仅使用截至该日的日线计算。数据基于目前可获得的复权日线重算，可能受来源复权修订影响，并非原日发布存档。日期、交易状态和当日涨跌合并在卡片右上角的固定宽度彩虹色区域，当前与历史日期样式一致；悬停日历可预览每日读数，移开后恢复所选日期，区域不会伸缩。左侧图标可返回最新，悬停提示“返回最新日期”。休市格子禁用点击，键盘导航跳过，悬停提示“休市”；缺失交易日不前向填充。切换股票时保留旧标的及其读数，加载完成后一起替换，不清空卡片，也不强制滚动已在视野内的市场。

休市判断包含周末与已核实的交易所节假日：[上交所 2026 年安排](https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml)、[NYSE 日历](https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx)。当前日历覆盖 A 股 2026 年、美股 2025 年 10 月至 2027 年末，后续年份需按交易所公告更新。未知工作日的报价缺口保持“无交易数据”，不会据此推断休市；提前收盘日仍是交易日。

指标设计参考：[TradingView 技术评级](https://www.tradingview.com/support/solutions/43000614331-technical-ratings/)区分均线和震荡指标；[Finviz 筛选说明](https://finviz.com/help/screener)分别展示 RSI、均线距离、相对量及高低点距离。本站量能比用前 20 个完整交易日，Finviz 用近三个月并做盘中调整，二者数值不能直接等同。[Schwab 报价说明](https://international.schwab.com/story/learn-how-to-read-stock-quotes)与[Morningstar 数据定义](https://admainnew.morningstar.com/WebHelp/glossary_definitions/quicktakes/STKStockPerformance.htm)将 52 周区间视为价格背景。因此本站将“52 周位置”放在末项，气泡提供低点、高点及其定义；它不是上涨概率、估值分位或独立买卖结论。

## 本地开发

需要 Node.js 22.13+，推荐使用 pnpm。完整测试另需 Python 3.10+；可用 `PYTHON` 指定解释器路径。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`dev` 先构建再运行 Cloudflare Pages 本地预览。修改代码后需要重新构建。新看板直接读取公开行情来源，无须本地 D1。字体自托管，首屏使用 Hono + React 服务端渲染。

## 接口

| 路由 | 内容 |
| --- | --- |
| `GET /api/markets` | A 股与美股默认行情，分别返回可用或失败状态 |
| `GET /api/markets/CN?symbol=600519.SS` | 指定沪深股票或沪深 300 |
| `GET /api/markets/US?symbol=NVDA` | 指定美股或标普 500（`^GSPC`） |
| `GET /api/search?q=英伟达` | 根据来源记录解析出的沪深、美股搜索结果 |
| `GET /api/health` | 两个市场的可用状态与行情日期 |

行情进程内缓存 60 秒，搜索缓存 5 分钟；并发相同请求合并，缓存条目有上限。每次来源请求超时 8 秒，美股支持备用域名重试。错误响应不缓存。

## 验证

```sh
pnpm build
pnpm test
pnpm security:check
```

启动本地预览后，运行浏览器验收（Windows 使用本机 Chrome；其他系统先安装 Playwright Chromium）：

```sh
pnpm test:visual
```

默认检查 `http://127.0.0.1:8788`，可用 `SIGNAL_PREVIEW_URL` 覆盖。`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 可指定浏览器。截图输出到忽略提交的 `artifacts/screenshots/signals/`，涵盖 1440 和 390 宽度、整页、所有指标气泡、股票搜索、十条历史记录、超长名称、刷新失败、重试、离线页、历史日期联动和延迟切换，并检查溢出、居中及逐日悬停位移。截图仍需人工视觉复核。

## 原有报告存储

日报、周报的读者页面已移除，`/weekly` 重定向到看板。现有 D1 数据、受鉴权的报告读写接口及外部写入契约保留兼容，不参与新看板的数据生成。旧采集和发布脚本也暂留，不要求重新运行旧报告工作流来更新看板。

报告接口与部署迁移见 [docs/report-contracts/](docs/report-contracts/README.md)。本地 `REMOTE_DATA_ORIGIN` 仅用于旧报告接口只读透传；新行情接口在它之前注册，不经过旧站点。

## 部署

```sh
pnpm deploy
```

Pages 项目为 `stock-daily`。生产 D1 绑定只服务兼容的报告接口；本次看板改造无数据库迁移。部署后应回读 `/api/health`，并复核实际生产的双市场页面。

## 公开仓库安全

环境文件、Wrangler 状态、日志及密钥默认忽略提交。运行 `pnpm security:check` 检查公开仓库规则；GitHub Actions 继续执行构建测试与密钥扫描。不要将行情供应商账号凭据或 Cloudflare 管理凭据写入代码。
