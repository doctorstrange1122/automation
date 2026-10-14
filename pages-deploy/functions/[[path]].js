/**
 * 自动化 · Cloudflare Pages 激活服务 (Pages Functions)
 * 协议与 AutoJs Pro「自动化」App 对齐(lx=26 弹框 / lx=28 激活 / lx=29 启动校验)
 *
 * 加密: KV 值使用 AES-256-GCM 加密(密钥来自环境变量 KV_KEY, 32字节十六进制)
 *       明文 JSON = {v, days, revoked, imei, activatedAt, createdAt}
 * 绑定: 一码一设备(按 IMEI), 首次激活写入 imei; 换机由后台 unbind 解绑
 * 试用: 已关闭(输入 1 不再发放试用)
 * 作废: 后台 revoke 置 revoked=true, 下次 lx=29 校验即失效(即时)
 *
 * 环境变量: TOKEN(App↔服务端鉴权) / KV_KEY(AES密钥) / ADMIN_PWD(后台登录)
 * KV 绑定名: KV (ASCII, 平台要求)
 */

const 显示内容 = "自动化 v1.0";

// 免外层 TOKEN 鉴权的路径: 根/说明页(精确), 管理后台页与 API(精确/前缀, 内部用 ADMIN_PWD 校验)
const 公开精确 = new Set(["/", "/g", "/g/", "/key-admin"]);
const 公开前缀 = ["/api/key/admin"];

// ================= 工具: Base64 / Hex / AES-256-GCM =================
function bytesToB64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
function b64ToBytes(b64) { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
function hexToBytes(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; }

async function aesGcmEncrypt(plaintext, keyHex) {
  const key = await crypto.subtle.importKey("raw", hexToBytes(keyHex), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return bytesToB64(iv) + bytesToB64(new Uint8Array(ct)); // IV(12) + 密文+标签(16)
}
async function aesGcmDecrypt(b64, keyHex) {
  const data = b64ToBytes(b64);
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const key = await crypto.subtle.importKey("raw", hexToBytes(keyHex), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// 10位激活码: 首位为数字(非0/1), 其余去易混淆字符(O/0/I/1/l)
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const first = "23456789";
  let c = first[Math.floor(Math.random() * first.length)];
  for (let i = 0; i < 9; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
const 码格式 = /^[A-Za-z0-9]+$/;
// 应用标识: 与旧版(原包)隔离。新包请求带 app=AUTO_APP_ID, 只有带相同 app 字段的激活码可用;
// 旧版发出的码(无 app 字段或 app 为其他值)一律拒绝, 实现"原包激活码对新包无效"。
const AUTO_APP_ID = "auto";
function 校验应用标识(rec, app) {
  if (app !== AUTO_APP_ID) return "";                       // 旧版请求(不带/带其他标识): 不做隔离, 保持兼容
  if (rec.app && rec.app !== AUTO_APP_ID) return "该激活码不适用于本软件, 请向分发者获取本软件专用激活码";
  if (!rec.app) return "该激活码为旧版软件专用, 不适用于本软件, 请联系分发者获取专用激活码";
  return "";
}

function rnd6() { return String(Math.floor(Math.random() * 900000) + 100000); }
function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function html(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

// ================= KV 记录读写 =================
async function kvGet(kv, code, keyHex) {
  const v = await kv.get(code);
  if (v == null) return null;
  try { return JSON.parse(await aesGcmDecrypt(v, keyHex)); }
  catch (e) { return { _corrupt: true }; }
}
async function kvPut(kv, code, rec, keyHex) {
  await kv.put(code, await aesGcmEncrypt(JSON.stringify(rec), keyHex));
}

// 计算到期毫秒(激活起点 + 天数)
function 算到期(rec, now) {
  const base = rec.activatedAt && rec.activatedAt > 1e12 ? rec.activatedAt : now;
  return base + Number(rec.days) * 86400000;
}

// ================= 主路由 =================
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const token = bearer || url.searchParams.get("token") || "";
  const expect = env.TOKEN || "";
  const isPublic = 公开精确.has(path) || 公开前缀.some(p => path.startsWith(p));
  if (expect && !isPublic && token !== expect) {
    return text("<sb>访问令牌无效</sb>", 401);
  }

  const params = Object.fromEntries(url.searchParams);
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    try {
      if (ct.includes("json")) Object.assign(params, await request.json());
      else {
        const body = await request.text();
        for (const kv of body.split("&")) {
          const i = kv.indexOf("=");
          if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
        }
      }
    } catch (e) {}
  }

  try {
    if (path.startsWith("/lx=26")) return lx26();
    if (path.startsWith("/lx=28")) return await lx28(params, env);
    if (path.startsWith("/lx=29")) return await lx29(params, env);
    if (path.startsWith("/lx=100")) return await lx100(params, env);
    if (path === "/hqsj.php") return text(String(Date.now()));
    if (path === "/fk.php") return text("1");
    if (path === "/update/guanggaolianjie.js") return config(url);
    if (path === "/update/djq.html") return djqHtml();
    if (path === "/update/yxjs.js") return text("");
    if (path.startsWith("/gx/")) return text("", 404);
    if (path.startsWith("/api/key/admin/")) return await admin(path, params, request, env);
    if (公开精确.has(path)) return html(usagePage());
    return text("not found", 404);
  } catch (e) {
    return text("<sb>服务器内部错误: " + String((e && e.message) || e) + "</sb>", 500);
  }
}

// ================= 激活协议 =================
// lx=26: 弹激活框(标题取 <ok> 与下一个 < 之间)
function lx26() {
  return text("<ok>请输入激活码以激活本软件。如未购买, 请联系分发者获取。</ok>");
}

// lx=28: 激活(写入设备绑定), 返回 <ok>载荷</ok>
// 载荷布局(自 <ok> 后起算): [0-5]随机6 [6]方式 [7-8]保留 [9-11]ycms
//   [12-24]到期ms(13) [25-30]随机6 [31-38]回显sg(8) [39-51]服务器时间ms(13) [52+]xym
async function lx28(params, env) {
  const kv = env.KV;
  const keyHex = env.KV_KEY || "";
  const code = String(params.ys || params.password || "");
  const sg = params.sg || "";
  const id = params.id || "";
  const imei = params.IMEI || "";
  const now = Date.now();

  if (!码格式.test(code)) return text("<sb>激活码格式不正确</sb>");
  if (!kv) return text("<sb>服务端未配置激活存储(KV)</sb>", 500);

  const rec = await kvGet(kv, code, keyHex);
  if (!rec || rec._corrupt) return text("<sb>激活码无效或已过期, 请向分发者索取</sb>");
  if (rec.revoked) return text("<sb>该激活码已被作废, 请联系分发者</sb>");
  const 应用不符 = 校验应用标识(rec, String(params.app || ""));
  if (应用不符) return text("<sb>" + 应用不符 + "</sb>");

  // 设备绑定
  if (!rec.imei) {
    rec.imei = imei; rec.activatedAt = now;          // 首次激活绑定本机
  } else if (rec.imei !== imei) {
    return text("<sb>该激活码已绑定其他设备, 如需换机请联系分发者解绑</sb>");
  }
  await kvPut(kv, code, rec, keyHex);

  const expiry = 算到期(rec, now);
  const xym = String(parseInt(String(id).substr(3, 5), 10) * 3);
  const payload = rnd6() + "1" + "00" + "000"
    + String(expiry) + rnd6()
    + String(sg).slice(0, 8).padEnd(8, "0")
    + String(now) + xym;
  return text("<ok>" + payload + "</ok>");
}

// lx=29: 启动校验(每次打开软件调用). 无效/作废/过期/换机 → <sb> 锁死
async function lx29(params, env) {
  const kv = env.KV;
  const keyHex = env.KV_KEY || "";
  const code = String(params.code || params.ys || "");
  const sg = params.sg || "";
  const id = params.id || "";
  const imei = params.IMEI || "";
  const now = Date.now();

  if (!码格式.test(code)) return text("<sb>本地激活信息损坏, 请重新激活</sb>");
  if (!kv) return text("<sb>服务端未配置激活存储(KV)</sb>", 500);

  const rec = await kvGet(kv, code, keyHex);
  if (!rec || rec._corrupt) return text("<sb>激活码无效, 请重新激活</sb>");
  if (rec.revoked) return text("<sb>激活码已被管理员作废, 软件已停用, 请联系分发者</sb>");
  const 应用不符29 = 校验应用标识(rec, String(params.app || ""));
  if (应用不符29) return text("<sb>" + 应用不符29 + "</sb>");
  if (!rec.imei) return text("<sb>该激活码需要重新激活</sb>");
  if (rec.imei !== imei) return text("<sb>激活码已绑定其他设备</sb>");

  const expiry = 算到期(rec, now);
  if (now > expiry) return text("<sb>激活码已过期, 请续费或联系分发者</sb>");

  const xym = String(parseInt(String(id).substr(3, 5), 10) * 3);
  const payload = rnd6() + "1" + "00" + "000"
    + String(expiry) + rnd6()
    + String(sg).slice(0, 8).padEnd(8, "0")
    + String(now) + xym;
  return text("<ok>" + payload + "</ok>");
}

// lx=100: 兼容旧兜底(不再发放试用, 需合法码)
async function lx100(params, env) {
  const kv = env.KV;
  const keyHex = env.KV_KEY || "";
  const code = String(params.ys || params.password || "");
  const id = params.yourId || params.id || "";
  const imei = params.IMEI || "";
  const now = Date.now();
  if (!kv || !码格式.test(code)) return text("<sb>无效</sb>");
  const rec = await kvGet(kv, code, keyHex);
  if (!rec || rec._corrupt || rec.revoked || (!rec.imei ? false : rec.imei !== imei)) return text("<sb>无效</sb>");
  const expiry = 算到期(rec, now);
  const xym = String(parseInt(String(id).substr(3, 5), 10) * 3);
  return text(rnd6() + String(expiry) + "8" + rnd6() + String(now) + xym);
}

// ================= 配置与页面 =================
function config(url) {
  return json({
    key: "", csbpUrl: "", jgsj: "3656365656", fhyy: "0", 进链接: "0",
    点击器显示内容: 显示内容, 三蹦子显示内容: "最新版为3.6.9", 其他链接: "",
    jdkey: "", jdtime: "164321336000000", jdurl: "", mzsbb: "322",
    kqtc: "1", xbsqy: "1", 置: "0", 置2: "内容0", yxjhdjq: "1",
    yxjs: "0", 激活服务器地址: url.host, pj521: "1",
    激活提示: "请输入激活码以激活本软件。", pj522: String(Date.now()), nr: [], data: { t: String(Date.now()) }
  });
}
function djqHtml() {
  return text("<djs></djs><tishiyu></tishiyu><main>100</main><gxts></gxts><djq>305</djq><zdbb>99</zdbb>",
    200, { "content-type": "text/html; charset=utf-8" });
}
function usagePage() {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>自动化 · 激活服务</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 18px;line-height:1.8;color:#1f2937}
h2{color:#2563eb;border-left:4px solid #2563eb;padding-left:10px}
code{background:#eef2ff;padding:2px 6px;border-radius:4px;color:#4338ca}
.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:14px 0}</style></head><body>
<h2>自动化 · 激活服务</h2>
<div class="card"><p>本服务由 Cloudflare Pages 提供, 为「自动化」App 签发与校验激活状态。</p>
<p>激活方式: 打开软件 → 输入 <b>10 位激活码</b>(字母数字) → 联网激活, 有效期由分发者设定。</p>
<p>每次打开软件都会联网校验, <b>后台一旦作废激活码, 软件立即停用</b>。</p></div>
<h3>管理后台</h3><p>分发者请访问 <code>/key-admin</code> 用管理员密码登录, 进行: 生成激活码 / 作废 / 解绑 / 删除。</p>
</body></html>`;
}

// ================= 管理后台 API =================
async function admin(path, params, request, env) {
  const base = "/api/key/admin/";
  const action = path.slice(base.length);
  const kv = env.KV;
  const keyHex = env.KV_KEY || "";
  const pwd = request.headers.get("X-Admin-Pwd") || params.pwd || "";

  if (action === "login") {
    if (pwd && pwd === (env.ADMIN_PWD || "")) return json({ ok: true });
    return json({ ok: false, msg: "密码错误" }, 401);
  }
  // 其余操作需密码
  if (pwd !== (env.ADMIN_PWD || "")) return json({ ok: false, msg: "未授权" }, 401);
  if (!kv) return json({ ok: false, msg: "服务端未绑定 KV" }, 500);

  if (action === "list") {
    const out = [];
    let stats = { total: 0, unused: 0, activated: 0, revoked: 0 };
    const { keys } = await kv.list();
    for (const k of keys) {
      const rec = await kvGet(kv, k.name, keyHex);
      if (!rec) continue;
      stats.total++;
      if (rec.revoked) stats.revoked++;
      else if (!rec.imei) stats.unused++;
      else stats.activated++;
      out.push({
        code: k.name, days: rec.days, revoked: !!rec.revoked,
        imei: rec.imei ? rec.imei.slice(0, 6) + "…" + rec.imei.slice(-4) : "",
        activatedAt: rec.activatedAt || 0,
        expiry: rec.activatedAt ? 算到期(rec, Date.now()) : 0,
        createdAt: rec.createdAt || 0
      });
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json({ ok: true, list: out, stats });
  }

  if (action === "generate") {
    const count = Math.min(parseInt(params.count) || 1, 200);
    const days = Math.max(1, parseInt(params.days) || 30);
    const now = Date.now();
    const codes = [];
    for (let i = 0; i < count; i++) {
      let c = genCode();
      // 避免碰撞
      let guard = 0;
      while ((await kv.get(c)) != null && guard++ < 5) c = genCode();
      await kvPut(kv, c, { v: 1, app: AUTO_APP_ID, days, revoked: false, imei: "", activatedAt: 0, createdAt: now }, keyHex);
      codes.push(c);
    }
    return json({ ok: true, codes });
  }

  if (action === "revoke" || action === "unbind" || action === "delete") {
    const code = String(params.code || "");
    if (!码格式.test(code)) return json({ ok: false, msg: "码格式错误" });
    if (action === "delete") { await kv.delete(code); return json({ ok: true }); }
    const rec = await kvGet(kv, code, keyHex);
    if (!rec || rec._corrupt) return json({ ok: false, msg: "码不存在" });
    if (action === "revoke") rec.revoked = true;
    if (action === "unbind") { rec.imei = ""; rec.activatedAt = 0; }
    await kvPut(kv, code, rec, keyHex);
    return json({ ok: true });
  }

  return json({ ok: false, msg: "未知操作" }, 404);
}
