# trendbeak

A 股与美股市场看板，查看每日涨跌、市场情绪和指数估值。

**[在线 Demo → trendbeak.com](https://trendbeak.com)**

- 沪深 300、纳斯达克综合指数及个股行情。
- 涨跌日历、历史趋势、市场指标和 PB／PS 分位。
- 支持手机、键盘操作和明暗主题切换。

基于 React、TypeScript、Hono 和 Vite，部署在 Cloudflare Pages，数据存储使用 D1。

## 本地运行

需要 Node.js 22.13+ 和 pnpm。本地使用 SQLite，不需要 Cloudflare 账户。

```sh
git clone https://github.com/RyanProMax/trendbeak.git
cd trendbeak
pnpm install --frozen-lockfile

# 建表并获取默认指数行情
pnpm exec wrangler d1 migrations apply SENTIMENT_DB --local
pnpm run market:init --market CN --symbol 000300.SS
pnpm run market:init --market US --symbol '^IXIC'

pnpm run dev
```

打开 <http://127.0.0.1:8788>。数据保存在 `.wrangler/state`。当前开发命令先构建再启动预览，修改代码后需重启。

## 生产部署

使用自己的 Cloudflare 账户创建 Pages 项目和 D1 数据库。将以下占位符替换为自己的名称和账户 ID。

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create YOUR_DATABASE_NAME
pnpm exec wrangler pages project create YOUR_PROJECT_NAME --production-branch main
```

修改 `wrangler.jsonc`：`name` 填 Pages 项目名，`database_name`、`database_id` 填新数据库的名称和 ID，绑定名保留 `SENTIMENT_DB`。

```sh
export CLOUDFLARE_ACCOUNT_ID="YOUR_ACCOUNT_ID"

pnpm exec wrangler d1 migrations apply SENTIMENT_DB --remote
pnpm run market:init --market CN --symbol 000300.SS --remote
pnpm run market:init --market US --symbol '^IXIC' --remote

pnpm run build
pnpm exec wrangler pages deploy dist --project-name YOUR_PROJECT_NAME --branch main
```

部署后访问 `/api/health` 检查行情状态。自定义域名在 Pages 项目设置中绑定。

## 数据更新

页面从数据库读取数据，部署不会自动开始采集。上述步骤只准备指数行情；情绪、市场指标和估值需要另行准备历史数据，Demo 数据库不随仓库分发。

手动更新行情：

```sh
pnpm run market:sync --market CN --symbol 000300.SS
pnpm run market:sync --market US --symbol '^IXIC'
```

这些命令默认操作本地数据库；更新生产数据时加 `--remote`，并设置 `CLOUDFLARE_ACCOUNT_ID`。

行情来自腾讯证券和 Yahoo Finance；A 股情绪来自[百分位](https://baifenwei.com/indicator/fear-greed/)，CNN 情绪通过[社区存档](https://github.com/whit3rabbit/fear-greed-data)取得。A 股市场统计使用开盘红、东方财富，指数估值使用易方达数据。

## 开发检查

```sh
pnpm run check          # TypeScript
pnpm test               # 构建和自动化测试
pnpm run test:budget    # 服务端读取性能
pnpm run security:check # 仓库敏感信息检查
```

## License

[MIT](LICENSE)
