# trendbeak 迁移与回退边界

本轮移除旧报告产品的路由、API、生成发布链路、契约、迁移脚本、测试和文档。源码可从 Git 历史恢复；没有因此删除任何线上数据。

## Cloudflare

目标为新的 Git-integrated Pages 项目 `trendbeak`，继续使用已授权的同一个 GitHub 仓库 ID。使用既有 GitHub App 权限，不新增凭据或扩大授权。

旧项目 `stock-daily` 的原网址为 `stock-daily-8k4.pages.dev`。Cloudflare 的项目名称与 `pages.dev` 子域名不是同一件事，子域名不能原地重命名。旧项目仅在新站、域名 HTTPS 和核心功能验证通过，并得到执行前确认后才能永久删除。

`trendbeak.com` 已位于现有账户的 active zone，nameserver 已指向 Cloudflare。当前 Wrangler 授权访问 DNS API 返回 403；未扩大权限或盲目覆盖 DNS。MX、TXT 及其他无关记录必须保留。

## 旧数据库

物理库仍为 `stock-daily-db`，UUID `4c748c0b-58c3-4525-ba47-5a436ba01e75`，只读核验大小 131072 字节，5 张表：9 条迁移记录、25 条导入审计、9 条周报，日报与发布回执表为空。没有行情日线、盘中快照或分钟数据。

D1 官方只支持更改 binding 名，不支持原地更改物理库名。若确需新物理名称，应先导出备份，建立新库并导入，核对表结构与行数后再决定是否保留归档；新 UUID 不能伪装成原库。不得因更名删除旧库。本轮清理后的新应用没有活跃 D1 消费者，因此不为展示新名称额外创建空行情库。

## 浏览器数据

同源升级会读取旧搜索历史键并写入新的 `trendbeak:search-history:v1`；用户主动清空时清除新旧键。新域名是独立浏览器 origin，不自动跨域读取旧站搜索记录。旧离线缓存前缀只为迁移清理保留，活跃缓存与页面数据标识均使用 trendbeak。
