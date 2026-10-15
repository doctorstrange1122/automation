# 自动点击 v1

AutoJs Pro 打包的 Android 自动化工具，内置联网激活与网络校时。

## 下载

- **扫码下载**：仓库根目录 `download_qrcode.png`（二维码上方标注「自动点击」）
- **直接下载**：[auto.apk](https://github.com/doctorstrange1122/automation/releases/download/v1/auto.apk)

> 安装前请在手机「设置 → 安全」中允许「未知来源」安装。

## 功能特性

- 顶部版本号 **v1**，左侧菜单精简为：布局分析 / 使用说明 / 恢复默认值 / 日志 / 退出
- **网络校时**：时间1 = 拼多多、时间2 = 京东、时间3 = 淘宝；任一平台失败自动回退到自建服务器，**永不显示本机时间**
- 首次启动需激活，激活码 **一码一设备**（按设备 ID 绑定，换机需后台解绑）
- 后台可 **作废 / 解绑** 激活码：作废 = 永久停用；解绑 = 踢当前设备下线、允许换机

## 目录结构

```
auto/
├── auto.apk             # 发布包（软件名「自动化 v1」）
├── download_qrcode.png  # 下载二维码（上方文字：自动点击）
├── README.md
├── src/                 # 应用 JS 源码（main_cloudflare.js 等）
│   ├── main_cloudflare.js   # 当前发布版源码
│   ├── main.js              # 原始未改源码
│   ├── repack/              # 重打包脚本
│   └── tools/  cloudflare-worker/
└── server/              # Cloudflare Pages 激活服务
    ├── functions/       # 激活协议 + AES-GCM KV + 管理 API
    ├── public/
    ├── wrangler.toml
    └── test_e2e.sh
```

## 激活码后台

访问 `https://automation-activation.pages.dev/key-admin`，用管理密码登录，可：生成激活码 / 列表统计 / 作废 / 解绑 / 删除。

## 服务端部署（如需自建）

```bash
cd auto/server
export CLOUDFLARE_API_TOKEN=<具有 Pages+KV 权限的令牌>
wrangler pages deploy public --project-name automation-activation
# 写入三个密钥：
echo -n "$TOKEN"     | wrangler pages secret put TOKEN     --project-name automation-activation
echo -n "$KV_KEY"    | wrangler pages secret put KV_KEY    --project-name automation-activation
echo -n "$ADMIN_PWD" | wrangler pages secret put ADMIN_PWD --project-name automation-activation
```

KV 绑定名：`KV`（命名空间 `activation-codes`）。

## 端到端验证

```bash
bash auto/server/test_e2e.sh
```
