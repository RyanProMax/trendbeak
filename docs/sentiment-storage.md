# 情绪数据库（已导入，应用改动待发布）

2026 年 11 月 1 日在现有 Cloudflare 账户创建 `trendbeak-sentiment`，D1 ID `abfc94dc-21d9-494b-aa05-220c31879c4a`，绑定 `SENTIMENT_DB`。没有恢复已删除的 `stock-daily-db`，没有变更付费方案、凭据或权限。当前实现位于 `feat/sentiment-database`，未部署、未推送；线上仍是 `91199f886555be6b4bdd65f6140d87172caba7c6`。

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
| `self_v0_2` | trendbeak | 自有算法 v0.2，当前未导入实验数据 |

没有把 Fear & Greed 当前转引读数混入社区存档曲线，没有导入其他历史拼接数据或自算实验分数。

## 实际导入与核验

| 来源 | 远端实际行数 | 首日 | 末日 |
| --- | ---: | --- | --- |
| 百分位 | 8,036 | 1993 年 8 月 27 日 | 2026 年 10 月 30 日 |
| CNN 社区存档 | 250 | 2025 年 10 月 31 日 | 2026 年 10 月 30 日 |

百分位完整 CSV SHA-256：`c85b3c05efe9f5b07bf150aedb69b9d35403e5debc3d79e7b28c4e933978253f`。全部日期、重复、未来日期及分数验证通过；不是仅导入页面显示的一年。

美股固定版本 `30e3b4291bc09d60425f413da59d4acc64327d07`，原文件 SHA-256 `50fbe2ec9cd2ad42cfa993237ffff9eae920780b8e830e315282527b5d31d264`。窗口内原始 251 条含同日重复，解析后 250 个唯一日期；对照输入的 251 个交易日，仅缺 2026 年 3 月 12 日，该日仍无记录。没有插值，也没有用无日期 `previous_close` 或比较值补日。

导入命令重算原文件、交易日历、解析器、artifact 文件 hash，并用当前相同解析器重建规范化内容；bundle checksum 为 `17a155a0db8761f1a59aea98e42792f441ebb95b9ad828120a66ac0fd52fbfa0`。原文件与 bundle 保留在本机私有目录，不进入 Git、静态目录或构建包；SQL 只在系统临时目录生成并清理。

远端 SELECT 复查行数、范围、五列结构、缺日和自算数据为零。原始内容的公开再使用边界仍待核验；社区仓库的 MIT 声明本身没有证明 CNN 数据再分发权利，也不能据此断言数据确定禁止使用。[社区来源说明](https://github.com/whit3rabbit/fear-greed-data)、[百分位使用条款](https://baifenwei.com/terms/)供发布前核对；本次只做私有入库和本地验收，不公开原文件。

## 读取与缓存

- `GET /api/sentiment/CN` 默认 `baifenwei`；`GET /api/sentiment/US` 默认 `cnn_whit3rabbit`。
- 可指定 `source`、`from`、`to`，例如 `/api/sentiment/US?source=cnn_whit3rabbit&from=2025-10-31&to=2026-10-30`。默认最近 740 自然日；查询全量可显式指定 `from=1993-01-01`。无效市场、日期、倒置范围或不匹配来源返回 400。
- 返回 `data.market/source/from/to/sourceInfo/storedAt/rows`；每个 row 明确返回 `market/date/source/score/updated_at`。`sourceInfo` 区分发布者与取得渠道。查询始终只选一个来源；缺失返回空数组，不返回伪造零。
- `/api/markets`、`/api/markets/:market` 和首屏 SSR 的情绪也从同一数据库读取。行情与技术指标仍沿用既有价格链路；旧行情快照中的情绪不会覆盖或混入新结果。
- 情绪快照独立于行情快照，内存最多 32 项/绑定，按市场、来源、日期范围隔离；同实例合并在途查询；Cache API 作为同源、同机房的可驱逐快照。两层 TTL 都为 5 分钟；缓存冷启动、损坏、过期或驱逐回 D1，不抓取上游。同步成功后可见延迟最多一个缓存周期；不新增 KV 或快照表。
- D1 缺失或失败时情绪接口返回 `503/no-store`，页面可保留可用行情并显示情绪不可用；数据库故障不会触发上游抓取。数据库历史无缓存保留期限，正常上游失败不会删除任何历史。价格接口外层继续 `no-cache`。

## 可重复操作

使用现有登录和已核验的 trendbeak 账户。若 Wrangler 缓存选中其他账户，先把环境变量 `CLOUDFLARE_ACCOUNT_ID` 指向已有正确账户，不提交账户信息或凭据。下面路径均为调用者提供的本地文件。

新环境建表一次；本次远端已经执行，不必重复建库：

```sh
pnpm exec wrangler d1 execute trendbeak-sentiment --local --file migrations/0001_sentiment_daily.sql --yes
# 新的远端空库才需要把 --local 改成 --remote；当前远端已建表并导入。
```

首次种子只补缺：

```sh
pnpm sentiment:seed --source baifenwei --file /path/to/fear-greed-full.csv --dry-run
pnpm sentiment:seed --source baifenwei --file /path/to/fear-greed-full.csv --remote
pnpm sentiment:seed --source cnn_whit3rabbit --manifest /path/to/candidate-bundle/manifest.json --dry-run
pnpm sentiment:seed --source cnn_whit3rabbit --manifest /path/to/candidate-bundle/manifest.json --remote
```

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

构建、120 项回归与公开仓库安全检查通过。新增 SQLite 实测覆盖五列结构、非法日期/分数、种子幂等、种子不覆盖修订、同值同步不改时间、多源隔离、缺日保留、API source 返回、缓存命中/冷启动/过期/驱逐/重建、上游不可用时数据库仍可读。

本地 Pages 实际绑定 D1，完整 API 返回 8,036/250 行。1440/390px 及额外 320px 全页、当前/历史选日和所有展开核心说明的自动布局检查通过；图表日期联动、图例、范围及读数关闭均验收，UI 组件未改。截图保留在系统临时目录。

发布前仍需核对公开使用边界，再审阅并提交分支、按既有 Pages 发布流程发布（本次未执行）。`wrangler.jsonc` 已声明正确 D1 binding，发布时随配置生效；生产和预览绑定均应在发布后复查。之后从线上情绪接口核对行数、来源和真实缺日；再按已确定的私有执行环境配置每日任务。尚未验证生产绑定、线上 API 和真正调度执行。
