/**
 * 定时点击器 · Cloudflare 激活服务 Worker
 * ============================================
 * 与 AutoJs Pro 打包的「定时点击器」App 配套, 完整实现原激活服务器协议:
 *   GET/POST /lx=26            激活对话框提示
 *   GET/POST /lx=28            激活码校验(签发到期时间)
 *   GET/POST /lx=100           设备注册(兼容旧路径)
 *   GET      /update/guanggaolianjie.js   配置 JSON
 *   GET      /update/djq.html             更新检测
 *   GET      /update/yxjs.js              远程脚本(默认关闭)
 *   GET      /hqsj.php                    网络校时(返回毫秒时间戳)
 *   GET/POST /fk.php                      用户反馈
 *   GET      /gx/main.snapshot, /gx/zhu.snapshot   热更新(默认 404)
 *   GET      /g/                          使用说明页
 *
 * 鉴权: 请求头 Authorization: Bearer <TOKEN> 或查询参数 ?token=<TOKEN>
 * TOKEN 通过 wrangler secret put TOKEN 设置
 *
 * 激活码策略(默认):
 *   - 绑定 KV 命名空间「激活码」后: 键=激活码, 值=到期时间戳(ms)或天数
 *   - 未绑定 KV 或码不存在: 任何数字码按 TRIAL_DAYS 天试用发放(与原版行为一致)
 */

const TRIAL_DAYS = 30;          // 默认试用天数
const 激活提示 = "请输入激活码，或输入1先体验功能。";
const 显示内容 = "最新版3.0.5";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- 鉴权 ----
    const auth = request.headers.get("Authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const token = bearer || url.searchParams.get("token") || "";
    const expect = env.TOKEN || "";
    if (expect && token !== expect) {
      return text("<sb>访问令牌无效</sb>", 401);
    }

    // ---- 参数(合并 query 与 body) ----
    const params = Object.fromEntries(url.searchParams);
    if (request.method === "POST") {
      const ct = request.headers.get("content-type") || "";
      try {
        if (ct.includes("json")) {
          Object.assign(params, await request.json());
        } else {
          const body = await request.text();
          for (const kv of body.split("&")) {
            const i = kv.indexOf("=");
            if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
          }
        }
      } catch (e) { /* 忽略 body 解析失败 */ }
    }

    try {
      // ---- 路由 ----
      if (path === "/lx=26" || path === "/lx=26&") return lx26(params);
      if (path === "/lx=28" || path === "/lx=28&") return lx28(params, env);
      if (path === "/lx=100" || path === "/lx=100&") return lx100(params, env);
      if (path === "/hqsj.php") return text(String(Date.now()));
      if (path === "/fk.php") return text("1");            // 反馈接收成功
      if (path === "/update/guanggaolianjie.js") return config(env, url);
      if (path === "/update/djq.html") return djqHtml();
      if (path === "/update/yxjs.js") return text("");      // 远程脚本默认关闭
      if (path === "/gx/main.snapshot" || path === "/gx/zhu.snapshot") return text("", 404);
      if (path === "/g/" || path === "/g") return html(usagePage());
      if (path === "/" || path === "/index.html") return html(usagePage());
      return text("not found", 404);
    } catch (e) {
      return text("<sb>服务器内部错误: " + String(e && e.message || e) + "</sb>", 500);
    }
  }
};

// ================= 激活协议 =================

/** lx=26: 激活对话框。原版对 sg 不做强校验, 直接返回提示 */
function lx26(params) {
  const imei = params.IMEI || "";
  if (!imei) return text("<sb>缺少设备标识</sb><ok>" + 激活提示 + "</ok>");
  return text("<ok>" + 激活提示 + "</ok>");
}

/**
 * lx=28: 激活码校验。
 * 响应格式(与 App 解析偏移严格对应):
 *   <ok> | 6位头 | 方式1位 | 2位 | ycms3位 | 到期13位 | 6位 | sg8位 | 时间13位 | xym </ok>
 *   offset(从 sqnr 起点): 4-9 头, 10 方式, 11-12, 13-15 ycms, 16-28 到期, 29-34, 35-42 sg, 43-55 时间, 56+ xym
 */
async function lx28(params, env) {
  const code = params.ys || params.password || "";
  const sg = params.sg || "";
  const id = params.id || "";
  const now = Date.now();

  if (!/^\d+$/.test(String(code))) {
    return text("<sb>激活码格式不正确</sb>");
  }

  // 到期时间: 优先 KV 指定, 否则默认试用
  let expiry = now + TRIAL_DAYS * 86400000;
  if (env["激活码"]) {
    const v = await env["激活码"].get(String(code));
    if (v) {
      const n = Number(v);
      expiry = n > 1e12 ? n : now + n * 86400000;   // 值可以是时间戳或天数
    }
  }

  // xym 必须等于 App 端 yourId.substr(3,5)*3, 否则启动校验(xyz)不过
  const xym = String(parseInt(String(id).substr(3, 5), 10) * 3);

  const 头 = rnd6();
  const 中 = rnd6();
  const payload = 头
    + "1"                 // offset 10  激活方式
    + "00"                // offset 11-12 保留
    + "000"               // offset 13-15 异常码
    + String(expiry)      // offset 16-28 到期时间(13位)
    + 中                   // offset 29-34
    + String(sg).slice(0, 8).padEnd(8, "0")   // offset 35-42 回显客户端 sg
    + String(now)         // offset 43-55 服务器时间
    + xym;                // offset 56+  许可码
  return text("<ok>" + payload + "</ok>");
}

/** lx=100: 旧版设备注册路径(新激活2 遗留代码, 保留兼容) */
function lx100(params, env) {
  const id = params.yourId || params.id || "";
  const now = Date.now();
  const xym = String(parseInt(String(id).substr(3, 5), 10) * 3);
  // 旧格式: offset 5-17 到期, offset 30-42 时间, offset 43+ xym
  const expiry = now + TRIAL_DAYS * 86400000;
  return text("0" + String(expiry) + "0000000000000" + String(now) + xym);
}

// ================= 配置与页面 =================

function config(env, url) {
  const host = url.host;
  return json({
    key: "",
    csbpUrl: "",
    jgsj: "3656365656",
    fhyy: "0",
    进链接: "0",
    点击器显示内容: 显示内容,
    三蹦子显示内容: "最新版为3.6.9",
    其他链接: "",
    jdkey: "",
    jdtime: "164321336000000",
    jdurl: "",
    mzsbb: "322",
    kqtc: "1",
    xbsqy: "1",
    置: "0",
    置2: "内容0",
    yxjhdjq: "1",
    yxjs: "0",                 // 远程脚本执行: 默认关闭(原版为开启)
    激活服务器地址: host,
    pj521: "1",
    激活提示: 激活提示,
    pj522: String(Date.now()),
    nr: [],
    data: { t: String(Date.now()) }
  });
}

/** 更新检测页: 各标签留空/不给新版本号 => App 不触发热更新 */
function djqHtml() {
  return text(
    "<djs></djs>" +
    "<tishiyu></tishiyu>" +
    "<main>100</main>" +     // main.snapshot 版本号(<= 内置 100 不更新)
    "<gxts></gxts>" +
    "<djq>305</djq>" +       // 主程序版本号(<= 当前 3.0.5 不提示更新)
    "<zdbb>99</zdbb>",
    200, { "content-type": "text/html; charset=utf-8" }
  );
}

function usagePage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>定时点击器</title>
<style>body{font-family:sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.7}
code{background:#f4f4f4;padding:2px 6px;border-radius:4px}</style></head><body>
<h2>定时点击器 · 激活服务</h2>
<p>本页由你的 Cloudflare Worker 提供。App 启动后会向本服务校验激活状态。</p>
<h3>获取激活码</h3>
<p>输入任意数字码即可获得 ${TRIAL_DAYS} 天试用; 正式激活码请向分发者索取。</p>
<h3>管理激活码(可选)</h3>
<p>绑定 KV 命名空间 <code>激活码</code> 后, 以「激活码 → 到期时间戳(ms)或天数」写入键值,
即可为特定激活码指定到期时间。</p>
<h3>服务端点</h3>
<ul><li><code>/lx=26</code> 激活提示</li><li><code>/lx=28</code> 激活校验</li>
<li><code>/hqsj.php</code> 校时</li><li><code>/update/guanggaolianjie.js</code> 配置</li></ul>
</body></html>`;
}

// ================= 工具 =================

function rnd6() { return String(Math.floor(Math.random() * 900000) + 100000); }

function text(body, status = 200, headers = {}) {
  return new Response(body, {
    status, headers: { "content-type": "text/plain; charset=utf-8", ...headers }
  });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function html(body, status = 200) {
  return new Response(body, {
    status, headers: { "content-type": "text/html; charset=utf-8" }
  });
}
