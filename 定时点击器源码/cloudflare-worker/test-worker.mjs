// 本地测试: 用 Node 模拟 Cloudflare Worker 环境, 验证激活协议响应格式
import worker from "./worker.js";

const TOKEN = "test-token-123";
const env = { TOKEN };

function mkreq(path, method = "GET", body = null, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body) init.body = body;
  return new Request("https://djq-activation.example.workers.dev" + path, init);
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  [OK] " + name); }
  else { fail++; console.log("  [FAIL] " + name + " " + extra); }
}

// ---- 鉴权 ----
console.log("== 鉴权 ==");
let r = await worker.fetch(mkreq("/lx=26"), env);
check("无令牌 401", r.status === 401);
r = await worker.fetch(mkreq("/lx=26?token=" + TOKEN), env);
check("URL 参数令牌通过", r.status === 200);
r = await worker.fetch(mkreq("/lx=26", "GET", null, { Authorization: "Bearer " + TOKEN }), env);
check("Bearer 头通过", r.status === 200);

// ---- lx=26 ----
console.log("== lx=26 激活提示 ==");
r = await worker.fetch(mkreq("/lx=26?token=" + TOKEN + "&IMEI=a1b2c3d4e5f60718"), env);
let t = await r.text();
console.log("  响应:", JSON.stringify(t));
check("含 <ok>", t.includes("<ok>"));
check("标题可取", t.substring(t.indexOf("<ok>") + 4, t.indexOf("<", t.indexOf("<ok>") + 4)) === "请输入激活码，或输入1先体验功能。");

// ---- lx=28 ----
console.log("== lx=28 激活校验 ==");
const sg = "198f4833", id = "12345678901", now = Date.now();
r = await worker.fetch(mkreq("/lx=28?token=" + TOKEN + `&IMEI=a1b2c3d4e5f60718&sg=${sg}&ys=1&password=${now}&bbh=305&id=${id}`), env);
t = await r.text();
console.log("  响应:", JSON.stringify(t));
check("含 <ok>", t.lastIndexOf("<ok>") > -1);
check("offset35-42 回显 sg", t.substr(35, 8) === sg, "实际=" + t.substr(35, 8));
const 到期 = t.substr(16, 13);
check("offset16-28 是13位数字", /^\d{13}$/.test(到期), "实际=" + 到期);
check("到期时间在未来", parseInt(到期) > Date.now());
const xym = t.substr(56).split("<")[0];
check("offset56+ xym 正确", xym === String(parseInt(id.substr(3, 5)) * 3), "实际=" + xym);
check("ycms offset13-15 存在", /^\d{3}$/.test(t.substr(13, 3)));

// POST 形式(激活隐藏功能 用 post)
r = await worker.fetch(mkreq("/lx=28?token=" + TOKEN, "POST",
  `IMEI=a1b2c3d4e5f60718&sg=${sg}&ys=1&password=${now}&bbh=305&id=${id}`,
  { "content-type": "application/x-www-form-urlencoded" }), env);
t = await r.text();
check("POST 表单同样有效", t.lastIndexOf("<ok>") > -1 && t.substr(35, 8) === sg);

// ---- lx=100 ----
console.log("== lx=100 设备注册 ==");
r = await worker.fetch(mkreq("/lx=100?token=" + TOKEN + `&IMEI=a1b2c3d4e5f60718&yourId=${id}&bbh=305&password=ka`), env);
t = await r.text();
check("返回非空", t.length > 20, JSON.stringify(t));

// ---- 其他端点 ----
console.log("== 其他端点 ==");
r = await worker.fetch(mkreq("/hqsj.php?token=" + TOKEN), env);
t = await r.text();
check("hqsj 返回时间戳", /^\d{13}$/.test(t));
r = await worker.fetch(mkreq("/update/guanggaolianjie.js?token=" + TOKEN), env);
t = await r.text();
const cfg = JSON.parse(t);
check("配置是合法 JSON", typeof cfg === "object");
check("含激活服务器地址", cfg["激活服务器地址"] === "djq-activation.example.workers.dev");
check("yxjs 默认关闭", cfg.yxjs === "0");
r = await worker.fetch(mkreq("/update/djq.html?token=" + TOKEN), env);
t = await r.text();
check("djq.html 各标签齐全", ["<djs>", "<tishiyu>", "<main>", "<gxts>", "<djq>", "<zdbb>"].every(x => t.includes(x)));
r = await worker.fetch(mkreq("/gx/main.snapshot?token=" + TOKEN), env);
check("快照 404(不热更新)", r.status === 404);
r = await worker.fetch(mkreq("/fk.php?token=" + TOKEN + "&rjm=测试&nr=hello"), env);
check("反馈返回1", (await r.text()) === "1");
r = await worker.fetch(mkreq("/g/?token=" + TOKEN), env);
check("使用说明页 HTML", (await r.text()).includes("定时点击器"));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
