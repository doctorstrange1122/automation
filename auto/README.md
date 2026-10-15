# 自动点击 v1

AutoJs Pro 打包的 Android 自动化工具，内置联网激活与网络校时。

## 下载

**推荐（国内加速通道）**：

- **扫码下载**：仓库根目录 `download_qrcode.png`（二维码指向 gh-proxy 加速地址）
- **直链**：`https://gh-proxy.com/https://github.com/doctorstrange1122/automation/releases/download/v1/auto.apk`

**备用（GitHub 原始地址，海外直连较快）**：

- `https://github.com/doctorstrange1122/automation/releases/download/v1/auto.apk`

**备用加速前缀**（任一可用，换前缀即可，后面的路径保持不变）：

| 加速通道 | 前缀 |
|---|---|
| gh-proxy | `https://gh-proxy.com/` |
| ghfast.top | `https://ghfast.top/` |
| ghproxy.net | `https://ghproxy.net/` |

> 安装前请在手机「设置 → 安全」中允许「未知来源」安装。

## 当前版本

**v1.3.0** · SHA256 `495b08609ecab1ee528fed5dc5d4e443fb92f45e2c38d45874eded3085a033a1`

## 功能特性

- 顶部版本号 **v1**，左侧菜单精简为：布局分析 / 使用说明 / 恢复默认值 / 日志 / 退出
- **布局分析**：全屏绿框标记所有控件（绿=可点击 / 灰=不可点击 / 红=当前选中），点选后弹出属性面板显示类名、文本、ID、范围、可点击等，可拖动滑块逐个浏览
- **网络校时**：时间1 = 拼多多、时间2 = 京东、时间3 = 淘宝；任一平台失败自动回退到自建服务器，**永不显示本机时间**
- 首次启动需激活，激活码 **一码一设备**（按设备 ID 绑定，换机需后台解绑）
- 后台可 **作废 / 解绑** 激活码：作废 = 永久停用；解绑 = 踢当前设备下线、允许换机

## 目录结构

```
auto/
├── auto.apk             # 发布包（软件名「自动化 v1」）
├── download_qrcode.png  # 下载二维码（加速通道）
├── README.md
├── .gitignore
├── server/              # Cloudflare Pages 激活服务
│   ├── functions/       # 激活协议 + AES-GCM KV + 管理 API
│   ├── public/
│   ├── wrangler.toml
│   └── test_e2e.sh
└── src/# 应用 JS 源码与打包脚本
    ├── main_cloudflare.js   # 【当前发布版源码】
    ├── main.js              # 原始未改源码
    ├── repack/              # 重打包 + AES 加密 + 签名脚本
    └── tools/  cloudflare-worker/
```

## 构建

```bash
cd src/repack
python3 build_v10.py
```

脚本会自校验：解密产物与源码逐字节比对通过后才输出签名 APK。

> 签名密钥 `src/repack/demo.jks` 已入库（历史原因），**仅供本项目自用**。
> 若要迁移到新仓库，请先更换密钥并重新签名。

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

---

# 技术要点与踩坑记录

## 一、悬浮窗绘制（核心）

### 本机实测结论：`<canvas>` 在悬浮窗中像素不落屏

排查过程（11 轮）的决定性证据链：

| 实验 | 观察到的结果 | 结论 |
|---|---|---|
| `frame` 背景改成半透明红 | **整屏泛红** | 窗口可见 → 排除权限/遮挡问题 |
| `on("draw")` 里弹 toast | 有提示 | 回调**确实被调用** → 排除「没触发」 |
| 输出画布尺寸 | 816×2300 / 2999×6120 / 754×2238 | 尺寸正常 → 排除裁剪 |
| **`canvas.drawColor()` 铺满不透明纯绿** | **屏幕毫无变化** | **canvas 像素不落屏 → 必须换路径** |

最后一条才是真正的突破口。同一窗口里View 渲染正常、Canvas 绘制被吞掉，
所以调尺寸 / 调坐标 / 调层级 / 加重绘**全都无效**。

### 解决方案：Android 原生渲染

```
rawWindow → <img> → Bitmap.createBitmap() → Canvas.drawRect() → setImageBitmap()
```

绕开 Auto.js 的 canvas 封装，由系统直接把位图像素贴到屏幕。

**代价**：每次重绘一张全屏 ARGB 位图（Mate30Pro 约 11 MB），比canvas 的 `invalidate()` 复用内存开销大。
节点多时拖动滑块会有轻微卡顿。

**后续可优化**：节点集合不变时复用位图，只用第二张小图叠加高亮红框。

## 二、不要做「额外的改动」（最重要）

这次排障最大的教训：**原版能用的代码，不要碰。**

为解决绿框不显示，前后尝试了 11 轮「修复」，包括：字符串拼接 XML、`setZOrderOnTop`、
`LayoutParams`、`measure/layout` 手动测量、延迟 `invalidate`、`floaty.window` 替代 `rawWindow`、
坐标比例换算……**这些全部是原版字节码里根本不存在的东西**，而且大部分直接破坏了原本正常的绘制。

### 原版字节码的真实调用序列

从字符串表提取的完整证据：

```
rawWindow  →  <frame w="*" h="*" bg="#00000000"><canvas id="cv" w="*" h="*" /></frame>
setSize    →  mask.cv
new Paint / setColor / setStrokeWidth / setStyle(STROKE)
             #FF00FF00 绿 / #FF9E9E9E 灰 / #FFFF0000 红
mask.cv.on("draw", canvas => canvas.drawRect(x.l, x.t+OFFSET_Y, x.r, x.btm+OFFSET_Y, paint))
mask.cv.invalidate()
→ <frame id="touchFrame" w="*" h="*" bg="#00000000" /> → setTouchable → setOnTouchListener
```

节点结构体字段：`l / t / r / btm / depth`；遍历方式 `childCount → child → bounds → left/top/right/bottom`。

### API 出现次数统计（佐证）

| API | 次数 | 含义 |
|---|---|---|
| `setSize` | 1 | 原版只设一次尺寸 |
| `setTouchable` | 1 | 只给 touchWin |
| `invalidate` | 1 | 只在最后调一次 |
| `setZOrderOnTop` | **0** | 原版**没有**置顶操作 |
| `setAlpha` / `setDimAmount` / `setFlag` | **0** | 都没有 |

> **准则：改动前先确认原版有没有做同样的事。没有，就不要加。**

## 三、诊断要用「排除法」，不要「加内容试」

前几轮往 draw 里塞对角线、色块、toast 想观察效果，反而污染了绘制链路。

有效的做法是**用最小可判定实验一次性切开搜索空间**（见第一节表格）。
最后一条「不透明纯绿铺满」一次就锁定了根因——
而前面 10 轮都在调参数，方向从一开始就错了。

## 四、JS `var` 作用域遮蔽是隐形杀手

在嵌套函数/回调里重复 `var X = ...` 会创建**局部变量**，遮蔽同名全局变量，
导致跨函数读写抛 `ReferenceError`。本次连续出现 4 次：

| 变量 | 局部声明处 | 读取处 |
|---|---|---|
| `tishishijian` | `main()` | `a转为代码()` |
| `sjpyz` / `点击时长` | `runSrt.click` | `a转为代码()` |
| `sjyssj1` / `sjyssj2` | `runSrt.click` | `sjys()` |
| `currentActivity2` | 触摸回调 | `showInfoByIndex()` |

**准则**：从字节码提取的全局变量清单（本版 141 个）要逐一核对，
任何「被读取但只在局部声明」的标识符都是 bug。

## 五、三元表达式写反（隐蔽且影响面大）

同一类错误出现两次：

```javascript
// safeGet：取到有效值时返回默认值
return v == null ? v : def;                // ✗ 应为 v == null ? def : v

// bounds 格式化：取到 bounds 时反而显示 n/a
var bstr = bnd ? "n/a" : bnd.left + ...;   // ✗ 取不到时才回退
```

影响面极大：`safeGet` 被用来读**所有**节点属性，写反后
「可点击」永远 false、「类名/文本/ID」永远为空——
看起来像无障碍数据异常，实际只是一行三元写反。

**准则：兜底逻辑要逐个 review，特别注意 `?:` 两边是否符合语义预期。**

## 六、命中判定必须同时命中 X 和 Y

原实现只判断 Y 轴：

```javascript
if (ry - OFFSET_Y >= x.t && ry - OFFSET_Y <= x.btm) { hitIndex = i; break; }
```

而 `walk` 是**后序遍历**（子节点先入数组），第一条 Y 重叠的往往是最外层容器——
它的 `clickable` 天然是 `false`。应改为：同时命中 X 和 Y，
并在所有命中节点中**取面积最小**的那个（视觉上最上层、最贴近手指）。

## 七、悬浮窗层级与触摸归属

Android 上每个 `Window` 独立接收触摸，**后创建的窗口层级更高**：

- 两个全屏悬浮窗会互相遮挡 → 拆成「画框层 + 触摸层」时要控制数量与创建顺序
- `setOnTouchListener` 返回 `false` **只在同一 view 层级内传递，不会跨 window**
- `floaty.window()` 返回的 `JsWindow` **没有** `setTouchable`，调用抛 `InternalError`
- `floaty.rawWindow()` 返回原生 `Window`，支持 `setPosition/setSize/setTouchable/setFlags`

面板按钮点不动的根因：全屏触摸层独占点击，事件到不了面板控件。
解决方式：记录按钮屏幕矩形，由触摸层 `ACTION_UP` 时**自行命中并直接执行动作**，
不依赖 Android 窗口层级。

## 八、JS 侧 `device.density` 可能为 `undefined`

该定制壳中 `device.density` 返回 `undefined`（Mate30 Pro 实测），
因此**任何依赖 dp 换算的逻辑都会算出 `NaN`**。

- `floaty.window` 的 `setSize` 单位是 dp，传入像素值必然错位
- 需要 dp 时改用 `context.resources.displayMetrics.density`，或直接用像素

## 九、Rhino 字节码无法反编译

原版 `main.js` 是 `InterpreterData`，函数体已编译为字节码，**不能提取明文源码**。
可提取的只有：

- 字符串表（全局变量名141 个、API 名、XML 字面量、颜色值、日志文案）
- 少量未编译的内联函数（如 `显示用户悬浮按钮` 恰好保留了明文）

**准则：还原原版行为要靠「字符串表 + API 出现次数统计」推断调用序列，
而不是指望拿到原始代码。**

## 十、激活超时：内层超时要小于外层轮询

早期版本内层 `http timeout=8s`、外层轮询 `20×250ms=5s`，
外层比内层先放弃，必然误报超时。

正确配置：内层 15s，外层 `20×1s=20s`，网络失败自动重试 3 次。
