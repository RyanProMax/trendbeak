# 情绪数据库与发布验收

2026 年 11 月 1 日在现有 Cloudflare 账户创建 `trendbeak-sentiment`，D1 ID `abfc94dc-21d9-494b-aa05-220c31879c4a`，绑定 `SENTIMENT_DB`。没有恢复已删除的 `stock-daily-db`，没有变更付费方案、凭据或权限。已按用户发布指令通过现有 main Git 集成发布；首次数据库版本提交为 `588de2a63a11c59f4f9cb453c1b6591103a23964`，Cloudflare 部署为 `ddc85047-1349-4c7e-805d-ee2d0b743454`。后续修复仍沿用同一项目和数据库，实际在线版本应核对远端 main 与生产部署 SHA。

## 最小表结构

只有一张业务表 `sentiment_daily`，自然主键 `(market, date, source)`，没有自增 ID 或额外索引。

| 字段 | 当前用途 |
| --- | --- |
| `market` | `CN` / `US`，市场隔离 |
| `date` | 来源真实观测所属日期；日线日期标签保持原日期，实时观测按相应市场时区归日 |
| `source` | 来源与取得渠道的固定键，参与去重及来源隔离 |
| `score` | 原始 0～100 分数，保留精度；不存衍生评级或重复计算结果 |
| `updated_at` | 首次入库或实际分数修订时间；相同值同步和重复种子不改变时间 |

`updated_at` 不是上游采样时间、日终确认时间或“今天的分数”。不增加审计、批次、版本、来源字典表，也不预留没有当前用途的字段。日期合法性、市场/来源组合及分数范围同时由解析器和数据库约束检查。设计原则已加入根目录 `AGENTS.md`，原有阅读质量和 UI 验收指引保留。

来源说明由 `src/lib/sentiment-sources.ts` 固定映射，不重复保存在每行：

| 键 | 分数发布者 | 实际取得渠道 |
| --- | --- | --- |
| `baifenwei` | 百分位 | 百分位公开 CSV |
| `cnn_whit3rabbit` | CNN | `whit3rabbit/fear-greed-data` 社区存档，非 CNN 直连 |
| `cnn_benzinga` | CNN | CNN／Benzinga同期报道补录，非 CNN 直连，独立查询 |
| `self_v0_2` | trendbeak | 自有算法 v0.2，当前未导入实验数据 |

没有把 Fear & Greed 当前转引读数混入社区存档曲线，没有导入其他历史拼接数据或自算实验分数。

## 实际导入与核验

| 来源 | 远端实际行数 | 首日 | 末日 |
| --- | ---: | --- | --- |
| 百分位 | 8,036 | 1993 年 8 月 27 日 | 2026 年 10 月 30 日 |
| CNN 社区存档 | 250 | 2025 年 10 月 31 日 | 2026 年 10 月 30 日 |
| CNN／Benzinga同期报道补录 | 1 | 2026 年 3 月 12 日 | 2026 年 3 月 12 日 |

百分位完整 CSV SHA-256：`c85b3c05efe9f5b07bf150aedb69b9d35403e5debc3d79e7b28c4e933978253f`。全部日期、重复、未来日期及分数验证通过；不是仅导入页面显示的一年。

美股固定版本 `30e3b4291bc09d60425f413da59d4acc64327d07`，原文件 SHA-256 `50fbe2ec9cd2ad42cfa993237ffff9eae920780b8e830e315282527b5d31d264`。窗口内原始 251 条含同日重复，解析后 250 个唯一日期；对照输入的 251 个交易日，仅缺 2026 年 3 月 12 日，该来源该日仍无记录。没有插值，也没有用无日期 `previous_close` 或比较值补日。

另以 `cnn_benzinga` 独立保存 2026 年 3 月 12 日的 21.2。[Benzinga 3 月 13 日凌晨报道](https://www.benzinga.com/markets/market-summary/26/03/51233977/dow-tumbles-more-than-700-points-investor-sentiment-declines-fear-greed-index-in-extreme-f)明确回顾周四 CNN 读数为 21.2、此前 25.1；[MoneyDJ 3 月 16 日报道](https://www.moneydj.com/funddj/ya/yp050000.djhtm?a=%7B9A86335F-7848-4642-8DAC-20A2FFBF99BD%7D)独立记载 3 月 13 日为 20、低于 3 月 12 日的 21，只佐证整数附近，精确小数仅 Benzinga 支持。无法确认精确收盘采样时刻或当前回溯版本，因此标签为“CNN／Benzinga同期报道补录”，不宣称官方最终全精度。Yahoo 转载不算独立证据；3 月 12 日上午的 23.0 是盘中读数，不混用。未采用其他回算值。

这条报道不写入 `cnn_whit3rabbit`，不改变默认曲线。按日期检查读数时，只有默认来源明确没有该日观测，才在读数处展示这条已核验报道，并附上“CNN／Benzinga同期报道补录”链接；不把它接入默认曲线，不覆盖默认来源已有观测。市场响应把报道放在独立的 `reportedObservations`，默认 `/api/sentiment/US` 仍严格只返回社区存档。可选报道读取失败不影响主曲线。全部原行和值、时间戳已在来源约束迁移前后逐行比较一致；总计 8,287 行，原社区存档仍 250 行、3 月 12 日仍缺。来源证据集中保存在本说明，不逐行增加冗余字段。

### 日期交互与剩余缺口

图下读数改为固定列宽分配、右对齐的等宽数字；手机固定为两行，缺失、休市、有值和报道来源都使用预留高度。行情侧栏也为长价格换行预留固定高度，避免点击选日把图表整体向下推。按对应市场的交易日历或明确的 `closed` 状态，已确认休市时情绪与大盘统一显示“休市”；开市缺数显示“暂无数据”及对应来源，不以无值推断休市。

对照 2025 年 10 月 31 日至 2026 年 10 月 30 日的实际价格日，本地美股默认情绪仅缺 3 月 12 日，已有上述独立报道读数；A 股缺 2026 年 7 月 27 日。百分位原始完整 CSV、该站图表实际使用的[完整日频 JSON](https://baifenwei.com/data/fear-greed/series-full-1.json)及[同源图表 JSON](https://baifenwei.com/data/fear-greed/series-1.json)均从 7 月 24 日直接跳到 7 月 28 日，公开检索也未找到该日实际分数。不是日期转换、数据库漏导入或缓存丢失；该日有价格且非已知休市，因此仍保留真实缺失，不使用其他算法、插值或前值补数。

2026 年 11 月 1 日只读核对线上 `/api/markets/US`：仍是 Fear & Greed 转引源、1 个观测，未含新库历史。当时线上没有全年美股情绪曲线的原因是尚未发布；该记录描述发布前的旧版状态。发布后两个域名已验证为 250 个默认观测及 1 条独立报道；不能把本地验收当作线上证明。

导入命令重算原文件、交易日历、解析器、artifact 文件 hash，并用当前相同解析器重建规范化内容；bundle checksum 为 `17a155a0db8761f1a59aea98e42792f441ebb95b9ad828120a66ac0fd52fbfa0`。原文件与 bundle 保留在本机私有目录，不进入 Git、静态目录或构建包；SQL 只在系统临时目录生成并清理。

远端 SELECT 复查行数、范围、五列结构、缺日和自算数据为零。原始内容的公开再使用边界仍待核验；社区仓库的 MIT 声明本身没有证明 CNN 数据再分发权利，也不能据此断言数据确定禁止使用。[社区来源说明](https://github.com/whit3rabbit/fear-greed-data)、[百分位使用条款](https://baifenwei.com/terms/)供发布前核对；本次只做私有入库和本地验收，不公开原文件。

## 读取与缓存

- `GET /api/sentiment/CN` 默认 `baifenwei`；`GET /api/sentiment/US` 默认 `cnn_whit3rabbit`。
- 可指定 `source`、`from`、`to`，例如 `/api/sentiment/US?source=cnn_whit3rabbit&from=2025-10-31&to=2026-10-30`。默认最近365自然日，单次最多366自然日、366行；全部历史按年度日期窗口分段读取，例如 `from=1993-08-27&to=1994-08-26`，禁止交互请求全表导出。无效市场、日期、倒置范围或不匹配来源返回 400。
- 返回 `data.market/source/from/to/sourceInfo/storedAt/rows`；每个 row 明确返回 `market/date/source/score/updated_at`。`sourceInfo` 区分发布者与取得渠道。查询始终只选一个来源；缺失返回空数组，不返回伪造零。
- `/api/markets`、`/api/markets/:market` 的情绪从同一数据库读取，返回372日以内（365日窗口加7日行情兜底余量），不因价格截止日滞后截掉较新的情绪。首屏 SSR 不查询数据库；技术指标在浏览器按真实日线增量计算。旧行情快照中的情绪不会覆盖或混入新结果。
- 情绪快照独立于行情快照，内存最多 32 项/绑定，按市场、来源、日期范围隔离；同实例合并在途查询；Cache API 作为同源、同机房的可驱逐快照。两层 TTL 都为 5 分钟；缓存冷启动、损坏、过期或驱逐回 D1，不抓取上游。同步成功后可见延迟最多一个缓存周期；不新增 KV 或快照表。
- D1 缺失或失败时情绪接口返回 `503/no-store`，页面可保留可用行情并显示情绪不可用；数据库故障不会触发上游抓取。数据库历史无缓存保留期限，正常上游失败不会删除任何历史。价格接口外层继续 `no-cache`。

## 可重复操作

使用现有登录和已核验的 trendbeak 账户。若 Wrangler 缓存选中其他账户，先把环境变量 `CLOUDFLARE_ACCOUNT_ID` 指向已有正确账户，不提交账户信息或凭据。下面路径均为调用者提供的本地文件。

新环境建表一次；本次远端已经执行，不必重复建库：

```sh
pnpm exec wrangler d1 execute trendbeak-sentiment --local --file migrations/0001_sentiment_daily.sql --yes
pnpm exec wrangler d1 execute trendbeak-sentiment --local --file migrations/0002_sentiment_benzinga.sql --yes
# 新的远端空库才需要把 --local 改成 --remote；当前远端已建表并导入。
```

`0002` 仅扩充现有 `source` CHECK 中允许的真实来源；SQLite 需用复制、替换表的迁移保留全部五列值，最终仍只有原五列单表。远端通过 D1 文件导入事务执行，未增加业务表或字段。

首次种子只补缺：

```sh
pnpm sentiment:seed --source baifenwei --file /path/to/fear-greed-full.csv --dry-run
pnpm sentiment:seed --source baifenwei --file /path/to/fear-greed-full.csv --remote
pnpm sentiment:seed --source cnn_whit3rabbit --manifest /path/to/candidate-bundle/manifest.json --dry-run
pnpm sentiment:seed --source cnn_whit3rabbit --manifest /path/to/candidate-bundle/manifest.json --remote
pnpm sentiment:seed --source cnn_benzinga --file /path/to/reviewed-report.json --remote
```

报道文件只含一个已核验观测，例如 `[{"date":"2026-03-12","score":21.2}]`。同样使用补缺幂等流程；不自动抓取新闻，不加入每日同步，也不允许该来源走 `sync` 覆盖旧报道。定向读取 `/api/sentiment/US?source=cnn_benzinga&from=2026-03-12&to=2026-03-12`；默认接口仍查询社区存档。

不带 `--remote` 写本地 D1；`--dry-run` 只验证，不调用写库。重复 seed 使用 `ON CONFLICT DO NOTHING`，因此后续修订不会被旧种子覆盖。

指定来源的日常更新或纠错使用简单 upsert；只有分数实际变化才更新 `updated_at`：

```sh
pnpm sentiment:sync --source baifenwei --remote
pnpm sentiment:sync --source cnn_whit3rabbit --remote
# 使用已取得的同口径文件修订该来源：
pnpm sentiment:sync --source baifenwei --file /path/to/revised.csv --remote
pnpm sentiment:sync --source cnn_whit3rabbit --file /path/to/cnn-output.json --remote
```

百分位更新读取完整 CSV；美股只读社区的 `json/cnn_output.json`，经 CNN 专用解析器保留最近约一年真实观测，不使用拼接的跨来源综合 CSV。上游非 200、超时、文件过大或验证失败均在写库前退出，不删除已有行，不执行来源切换或绕过拒绝。

最小每日方案：有现成授权凭据的私有执行环境，在工作日 UTC 23:30（社区说明其更新在 UTC 23:00）依次执行两条 `sentiment:sync`，记录命令退出码并告警失败；第二个来源即使第一个失败也可以独立运行。无需写接口、额外数据库表或公开原文件。**本次未配置调度，不能称为自动同步。** 若现有执行环境不能使用既有登录，应先确定部署方式，不为本方案新建凭据或扩大权限。

## 验证与发布下一步

本地构建、125 项回归与公开仓库安全检查通过。新增 SQLite 实测覆盖五列结构、非法日期/分数、种子幂等、种子不覆盖修订、同值同步不改时间、多源隔离、缺日保留、API source 返回、缓存命中/冷启动/过期/驱逐/重建、上游不可用时数据库仍可读。

本地 Pages 实际绑定 D1，默认完整 API 返回 8,036/250 行，报道定向接口另返回 1 行。完整 `test:visual` 通过；1440/390px 及额外 320px 全页、当前/历史选日和所有展开核心说明已完成自动布局及截图审阅。新增 `readout-stability-check.mjs` 还覆盖 1024px、长短数字、正负行情、缺失/有值、跨市场休市、鼠标/触摸拖动与手机跨图焦点，读数容器和各列几何位置固定；休市雷达的四个展开状态也验收通过。四项指标算法沿用既有实现，截图仅保留在本机临时目录，未上传 Space。

首次发布已验证两个生产域名及 D1 绑定；后续发布仍需审阅来源使用说明并按现有 Pages 流程核对实际部署。`wrangler.jsonc` 已声明正确 D1 binding，发布时随配置生效；生产和预览绑定均应在发布后复查。之后从线上情绪接口核对行数、来源和真实缺日；再按已确定的私有执行环境配置每日任务。生产绑定和线上 API 已实测，真正调度仍未配置。

## 旧浏览器备份升级

线上验收曾复现：服务器已返回 250 条新库观测，但时间较新的浏览器旧行情备份会把它覆盖成旧转引来源的 1 条。恢复行情备份现保留本次服务器的数据库情绪；旧来源的情绪不随行情备份恢复，行情本身仍可兜底。新增 `legacy-sentiment-check.mjs` 在 1440/390/320px 强制恢复较新的旧来源备份，确认可见曲线仍取新库观测。

## 有界日常更新

`sentiment:sync` 默认仅 upsert 最近15个自然日（今天及此前14日），相同分数不写入。上游若只提供完整文件，可在显式运行的离线命令内下载、验证，但不逐次将全历史提交数据库。修正更早历史时明确指定 `--from YYYY-MM-DD --to YYYY-MM-DD`，每次最多366日；大规模种子仍只能通过已核验文件显式运行，重复种子不覆盖修订。

```sh
npm run sentiment:sync -- --source baifenwei --dry-run
npm run sentiment:sync -- --source baifenwei --from 2026-07-01 --to 2026-07-31 --dry-run
```

以上不创建调度；远端写入仍需显式 `--remote`，本轮性能修复没有执行远端数据更新。
