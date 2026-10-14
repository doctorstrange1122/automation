# 定时点击器 v3.0.5 源码提取说明

从 `定时点击器_v3.0.5.apk`（AutoJs Pro 打包，包名 `com.example.djq.app`）中提取并反编译还原的 JavaScript 源码。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `main.js` | 反编译还原的应用主源码（7400 行，含原始行号注释 `// Lxxxx`） |
| `tools/decrypt2.py` | 从 APK 中解密 `assets/project/main.js`（AES-CBC 双层密钥） |
| `tools/parse_ser3.py` | 解析解密后的 Java 序列化数据，导出 `snapshot.json`（函数/字节码/常量表） |
| `tools/decompiler/icode_disasm.py` | Rhino ICode 字节码反汇编器 |
| `tools/decompiler/decompiler.py` | ICode → JavaScript 反编译器（约 1400 行，结构化还原） |

## 提取流程

```
APK (assets/project/main.js, 加密)
  │  decrypt2.py      AES-CBC 解密(密钥由 project.json 配置派生)
  ▼
decrypted2.bin (Java 序列化)
  │  parse_ser3.py    解析序列化格式, 提取每个函数的 icode/常量/异常表
  ▼
snapshot.json
  │  icode_disasm.py  字节码 → 指令流
  │  decompiler.py    指令流 → 结构化 JS 源码
  ▼
main.js
```

复现命令（在 `tools/` 目录下，APK 放同级目录）：

```bash
python3 decrypt2.py          # 生成 decrypted2.bin
python3 parse_ser3.py         # 生成 snapshot.json
python3 decompiler/decompiler.py ../snapshot.json > ../main.js
```

## 反编译器还原的控制结构

- `try/catch/finally`、`if/else`、`switch`
- `for`、`while`、`do-while`、`for-in`
- 三元表达式、`&&`/`||` 短路求值
- 命名函数声明、函数表达式、IIFE
- Auto.js Rhino 分支的变量提升模式：
  - `with ({a: undefined, b: undefined})` → `var a, b;`（函数/块级 var 提升）
  - `with ({i: 0})` + 循环 → `for (var i = 0; ...)` 或 `var i = 0;` + 循环（`let` 循环变量提升）

## 已知限制

1. **行号注释**：每行末尾的 `// Lxxxx` 是原始源码行号，便于对照；不影响执行。
2. **变量名**：局部变量名从字节码常量表还原，完整保留；个别编译器临时寄存器可能显示为占位注释。
3. **表达式形态**：少数复杂表达式（如多层嵌套三元、逗号表达式）的括号层级可能与原代码有出入，语义等价。
4. **字符串编码**：中文及特殊字符按 UTF-8 还原，与原脚本一致。
5. **`eval` 调用**：个别 `eval("...")` 动态代码已还原为字面字符串。

## 技术要点

- AutoJs Pro 使用 Rhino 1.7.14（定制分支）将 JS 预编译为 ICode 字节码，
  经 AES-CBC 加密后存放在 APK 的 `assets/project/main.js`。
- 解密密钥由 `project.json` 中的 `packageName`、`versionName`、`main`、
  `versionCode`、`build_id`、`name` 等字段 MD5 派生（见 `decrypt2.py`）。
- 反编译器依据 Rhino Interpreter/CodeGenerator 的语义实现：
  - `IFEQ` = 条件为真跳转（循环回边），`IFNE` = 条件为假跳转（`&&` 短路）
  - `for/while`：`GOTO cond; body; cond; IFEQ bodyStart`
  - `do-while`：`bodyStart: body; cond; IFEQ bodyStart`
  - 三元：`cond; IF* T; else; GOTO G; T: then; G:`

## 校验

- 还原结果通过 Rhino 1.7.14 Parser 全量语法校验（`SyntaxCheck.java`，OK，7401 行）。
- 快照中共 366 个函数，输出含 382 处 function 声明（含匿名函数），无遗漏。
- 编译器伪影（未处理指令、`with ({...})`、`void 0` 残留、枚举内部指令）均为 0。

---

# 换令牌重新打包（Cloudflare 激活体系）

## 背景

原 APK 的激活完全依赖原作者服务器，没有任何硬编码令牌：

| 环节 | 原地址 | 用途 |
| --- | --- | --- |
| 默认激活服务器 | `47.108.239.26:966` | `lx=26` 取激活提示 / `lx=28` 校验激活码 |
| 失联备用 | `520xzs.lanzouj.com` / `520xzs.cn` | 动态获取服务器地址 |
| 反馈 | `520xzs.cn/fk.php` | 用户反馈 |
| 热更新 | `/update/djq.html`、`/gx/*.snapshot` | 检测更新、远程脚本 `yxjs.js` |

## 交付内容

| 文件 | 说明 |
| --- | --- |
| `main_cloudflare.js` | 改造后的源码：29 处 URL 全部切到 Cloudflare，**激活协议（lx=26/lx=28/响应字节格式）与原版完全一致** |
| `cloudflare-worker/worker.js` | 可部署的 Cloudflare Worker，完整实现原激活协议 + 令牌鉴权 |
| `cloudflare-worker/wrangler.toml` | Worker 部署配置 |
| `cloudflare-worker/test-worker.mjs` | Worker 本地测试（21 项断言，Node 直接运行） |
| `repack/build.sh` | 一键重打包 |
| `repack/repack.py` | APK 重打包器（加密 → 替换 → 重签名） |
| `repack/patch_cloudflare.py` | 源码改造脚本（29 处补丁，可复现） |
| `定时点击器_cloudflare_验证包.apk` | 全链路验证包（配置为占位符，证明打包链可用） |

## 使用步骤

### 1. 部署 Worker

```bash
cd cloudflare-worker
npm i -g wrangler && wrangler login
wrangler secret put TOKEN        # 输入你的访问令牌
wrangler deploy                  # 得到 https://xxx.workers.dev
node test-worker.mjs             # 本地自检(可选, 改 TOKEN 后)
```

激活码策略：默认任何数字码发 30 天试用（与原版行为一致）；
绑定 KV 命名空间「激活码」后，可给特定激活码指定到期时间（值=毫秒时间戳或天数）。

### 2. 填写令牌（只改两行）

编辑 `main_cloudflare.js` 顶部：

```js
var CF服务器 = "https://你的worker域名.workers.dev";
var CF令牌 = "你的访问令牌";
```

### 3. 重新打包

```bash
cd repack
./build.sh ../main_cloudflare.js 新包.apk 你的keystore.jks djq  storepass
# 不签名: ./build.sh ../main_cloudflare.js 新包.apk
```

> 签名说明：用原 keystore（`autojspro.jks`，别名 `djq`）签名可直接覆盖安装旧版；
> 用新 keystore 需先卸载旧版。App 自身不校验签名，仅 Android 系统校验。

### 4. 安装验证

安装后首次打开会弹激活框，输入任意数字码 → 提示「激活成功，到期时间：…」即全链路通。

## 技术细节

**加密格式**（与 AutoJs Pro `ScriptEncryption` 完全一致）：

```
main.js = 8字节头(77 01 17 7f 12 | level | 00 01) + AES-CBC(mKey, iv).encrypt(Scription.e(明文))
  key1 = md5(packageName + versionName + main + versionCode)
  iv   = md5(build_id + name)[:16]
  mKey = AES-CBC(key1, iv).encrypt(PKCS7("9a1132118990c3db"))   // 32 字节
  level 18 = 源码加密(本次采用), 19 = 序列化快照(原版)
```

原版是 level 19（Rhino 序列化快照），重打包改为 level 18（加密源码）——
运行时由同一加载器（`b2.c.doExecution`）按文件头字节分流，行为完全一致，
只是把预编译改为运行时编译，无需重建序列化对象图。

**lx=28 响应字节布局**（Worker 严格复刻，实测与原服务器一致）：

```
<ok> | 4-9 六位头 | 10 激活方式 | 11-12 保留 | 13-15 异常码 | 16-28 到期时间(13位ms)
    | 29-34 六位 | 35-42 回显客户端sg | 43-55 服务器时间 | 56+ xym </ok>
```

其中 `sg` 为 App 端 `a取时间检验码()`（日+时+分+秒 → *36+36522 → md5 前8位），
服务端原样回显即可通过校验；`xym = id.substr(3,5)*3` 由设备号派生，启动时复核。

## 与原版的差异

1. 激活/配置/反馈/校时全部指向你的 Cloudflare Worker，请求带 `token=` 参数与 `Authorization: Bearer` 头
2. 失联备用链（lanzou/520xzs.cn）移除，连不上服务器时明确报错
3. 远程脚本执行开关 `yxjs` 默认关闭（原版默认开启，属高危功能）
4. 热更新快照默认 404，不触发自动更新（需要时在 Worker 里提供文件即可）
5. `服务器地址` 不再读写 storage 缓存，避免旧安装残留地址覆盖新配置
