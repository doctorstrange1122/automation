# 自动化 · 激活系统

AutoJs Pro 打包的 Android 应用「自动化」+ Cloudflare Pages 激活后端。

## 能力

- **首次启动必须激活**，无试用权限
- **每次打开软件联网校验**激活码（`lx=29` 启动校验）
- **后台一键作废**激活码 → 应用下次启动立即停用
- 激活码为 **10 位短字符串**（字母+数字，如 `2QzqCrbQW5`），非长串
- 激活记录用 **AES-256-GCM** 加密存储于 Cloudflare KV（防篡改、防泄露）
- **一码一设备绑定**（按 IMEI），换机需后台解绑

## 目录结构

```
自动化.apk                 # 已重签名的发布包（软件名已改为「自动化」）
定时点击器源码/             # 还原出的 JS 源码（main_cloudflare.js 等）
pages-deploy/              # Cloudflare Pages Functions 激活服务
  functions/[[path]].js    # 激活协议 + AES-GCM KV + 管理 API
  functions/key-admin.js   # 管理后台单页应用
  wrangler.toml           # 部署配置（KV 绑定）
  test_e2e.sh             # 端到端验证脚本
```

## 服务端环境变量（Pages / Secrets，勿提交）

| 变量 | 说明 |
|------|------|
| `TOKEN` | App↔服务端鉴权令牌（已内置 APK，非机密） |
| `KV_KEY` | AES-256-GCM 密钥（32 字节 hex），**机密** |
| `ADMIN_PWD` | 管理后台登录密码，**机密** |

KV 绑定名：`KV`（命名空间 `activation-codes`）。

## 管理后台

访问 `https://<你的pages域名>/key-admin`，用 `ADMIN_PWD` 登录，可：生成激活码 / 列表与统计 / 作废 / 解绑 / 删除。

## 部署

```bash
cd pages-deploy
export CLOUDFLARE_API_TOKEN=<具有 Pages+KV 权限的令牌>
wrangler pages deploy public --project-name <项目名>
# 随后写入三个密钥：
echo -n "$TOKEN"    | wrangler pages secret put TOKEN    --project-name <项目名>
echo -n "$KV_KEY"   | wrangler pages secret put KV_KEY   --project-name <项目名>
echo -n "$ADMIN_PWD"| wrangler pages secret put ADMIN_PWD--project-name <项目名>
```

## 端到端验证

```bash
bash pages-deploy/test_e2e.sh
```
