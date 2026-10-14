/**
 * 自动化 · 激活码管理后台 (Pages Functions 直接返回单页应用)
 * 访问: /key-admin  (密码登录, 密码 = 环境变量 ADMIN_PWD)
 * 依赖: /api/key/admin/{login,list,generate,revoke,unbind,delete}
 */
export async function onRequest() {
  return new Response(ADMIN_HTML(), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function ADMIN_HTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>自动化 · 激活码管理后台</title>
<style>
  :root{--bg:#0f172a;--card:#ffffff;--primary:#2563eb;--primary-d:#1d4ed8;--ok:#16a34a;--warn:#d97706;--bad:#dc2626;--muted:#64748b;--line:#e2e8f0}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"Microsoft YaHei",sans-serif;background:#f1f5f9;color:#0f172a}
  .topbar{background:linear-gradient(120deg,#1e3a8a,#2563eb);color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 10px rgba(0,0,0,.15)}
  .topbar h1{font-size:18px;margin:0;font-weight:600;letter-spacing:.5px}
  .topbar .who{font-size:13px;opacity:.9}
  .wrap{max-width:1080px;margin:24px auto;padding:0 16px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
  .stat{background:var(--card);border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid var(--line)}
  .stat .n{font-size:30px;font-weight:700}
  .stat .l{color:var(--muted);font-size:13px;margin-top:4px}
  .stat.t{color:var(--primary)}.stat.u{color:var(--muted)}.stat.a{color:var(--ok)}.stat.r{color:var(--bad)}
  .panel{background:var(--card);border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid var(--line);margin-bottom:20px}
  .panel h2{font-size:15px;margin:0 0 14px;display:flex;align-items:center;gap:8px}
  .panel h2:before{content:"";width:4px;height:16px;background:var(--primary);border-radius:2px;display:inline-block}
  .row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
  label{font-size:12px;color:var(--muted);display:block;margin-bottom:6px}
  input{width:140px;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:14px;outline:none}
  input:focus{border-color:var(--primary)}
  button{cursor:pointer;border:none;border-radius:9px;padding:10px 16px;font-size:14px;font-weight:600;color:#fff;background:var(--primary);transition:.15s}
  button:hover{background:var(--primary-d)}
  button.ghost{background:#eef2ff;color:var(--primary)}
  button.danger{background:var(--bad)}button.danger:hover{background:#b91c1c}
  button.warn{background:var(--warn)}
  button.sm{padding:6px 10px;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600;font-size:12px}
  .badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:12px;font-weight:600}
  .b-unused{background:#f1f5f9;color:var(--muted)}
  .b-act{background:#dcfce7;color:var(--ok)}
  .b-rev{background:#fee2e2;color:var(--bad)}
  .code{font-family:ui-monospace,Menlo,monospace;font-weight:700;letter-spacing:1px}
  .actions{display:flex;gap:6px}
  .empty{text-align:center;color:var(--muted);padding:30px}
  /* login */
  .login{height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(120deg,#1e3a8a,#2563eb)}
  .login .box{background:#fff;border-radius:18px;padding:36px 32px;width:340px;box-shadow:0 20px 50px rgba(0,0,0,.3)}
  .login h2{margin:0 0 6px;font-size:20px}
  .login p{color:var(--muted);font-size:13px;margin:0 0 20px}
  .login input{width:100%;margin-bottom:16px}
  .login button{width:100%}
  /* modal */
  .mask{position:fixed;inset:0;background:rgba(15,23,42,.5);display:none;align-items:center;justify-content:center;z-index:50}
  .mask.show{display:flex}
  .modal{background:#fff;border-radius:14px;padding:22px;width:420px;max-width:92vw}
  .modal h3{margin:0 0 12px;font-size:16px}
  .modal textarea{width:100%;height:120px;border:1px solid var(--line);border-radius:9px;padding:10px;font-family:ui-monospace,monospace;font-size:13px;resize:none}
  .modal .bar{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  #toast{position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:11px 20px;border-radius:10px;font-size:14px;opacity:0;transition:.25s;z-index:99;pointer-events:none}
  #toast.show{opacity:1}
  .hint{font-size:12px;color:var(--muted);margin-top:8px}
</style>
</head>
<body>
<div id="app"></div>
<div class="mask" id="mask"><div class="modal" id="modal"></div></div>
<div id="toast"></div>

<script>
const API = "/api/key/admin";
let PWD = sessionStorage.getItem("admin_pwd") || "";

function toast(msg, bad){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");if(bad)t.style.background="#dc2626";else t.style.background="#0f172a";setTimeout(()=>t.classList.remove("show"),2200);}
async function api(action, body){
  const opt={method:"POST",headers:{"Content-Type":"application/json","X-Admin-Pwd":PWD}};
  if(body) opt.body=JSON.stringify(body);
  const r=await fetch(API+"/"+action, opt);
  return await r.json().catch(()=>({ok:false,msg:"网络错误"}));
}

function loginView(){
  document.getElementById("app").innerHTML = \`
  <div class="login"><div class="box">
    <h2>激活码管理后台</h2><p>自动化 · 分发者专用</p>
    <label>管理员密码</label>
    <input id="pwd" type="password" placeholder="请输入 ADMIN_PWD" onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">登 录</button>
    <div class="hint">密码由服务端环境变量 ADMIN_PWD 配置。</div>
  </div></div>\`;
  if(PWD) doLogin();
}
async function doLogin(){
  const pwd=document.getElementById("pwd")?document.getElementById("pwd").value:PWD;
  const r=await api("login",{pwd});
  if(r.ok){PWD=pwd;sessionStorage.setItem("admin_pwd",pwd);dashboard();}
  else toast(r.msg||"登录失败",true);
}

async function dashboard(){
  document.getElementById("app").innerHTML = \`
  <div class="topbar"><h1>自动化 · 激活码管理后台</h1><span class="who">已登录 · <a href="#" style="color:#fff" onclick="logout()">退出</a></span></div>
  <div class="wrap">
    <div class="stats" id="stats"></div>
    <div class="panel"><h2>生成激活码</h2>
      <div class="row">
        <div><label>数量</label><input id="g_count" type="number" min="1" max="200" value="5"></div>
        <div><label>有效期(天)</label><input id="g_days" type="number" min="1" max="3650" value="30"></div>
        <button onclick="gen()">生成并写入</button>
      </div>
      <div class="hint">生成后即时生效; 一码一设备(按手机 IMEI 绑定)。</div>
    </div>
    <div class="panel"><h2>激活码列表</h2>
      <div style="margin-bottom:12px"><button class="ghost sm" onclick="load()">刷新</button></div>
      <div id="list"></div>
    </div>
  </div>\`;
  load();
}
async function load(){
  const r=await api("list");
  if(!r.ok){toast(r.msg||"加载失败",true);if(r.msg&&r.msg.includes("授权"))logout();return;}
  const s=r.stats||{};
  document.getElementById("stats").innerHTML =
    stat(s.total||0,"总数","t")+stat(s.unused||0,"未使用","u")+stat(s.activated||0,"已激活","a")+stat(s.revoked||0,"已作废","r");
  if(!r.list.length){document.getElementById("list").innerHTML='<div class="empty">暂无激活码, 请先生成。</div>';return;}
  let rows=r.list.map(it=>{
    const st = it.revoked?'<span class="badge b-rev">已作废</span>':(it.imei?'<span class="badge b-act">已激活</span>':'<span class="badge b-unused">未使用</span>');
    return \`<tr>
      <td class="code">\${it.code}</td>
      <td>\${it.days} 天</td>
      <td>\${st}</td>
      <td>\${it.imei||"—"}</td>
      <td>\${it.activatedAt?new Date(it.activatedAt).toLocaleString():"—"}</td>
      <td>\${it.expiry?new Date(it.expiry).toLocaleString():"—"}</td>
      <td><div class="actions">
        <button class="sm warn" onclick="act('revoke','\${it.code}')">作废</button>
        <button class="sm ghost" onclick="act('unbind','\${it.code}')">解绑</button>
        <button class="sm danger" onclick="act('delete','\${it.code}')">删除</button>
      </div></td></tr>\`;
  }).join("");
  document.getElementById("list").innerHTML =
    '<table><thead><tr><th>激活码</th><th>有效期</th><th>状态</th><th>绑定设备</th><th>激活时间</th><th>到期时间</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function stat(n,l,c){return '<div class="stat '+c+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>';}

async function gen(){
  const count=+document.getElementById("g_count").value||1;
  const days=+document.getElementById("g_days").value||30;
  const r=await api("generate",{count,days});
  if(r.ok){
    const codes=(r.codes||[]).join("\\n");
    showModal("生成的激活码 ("+ (r.codes||[]).length +" 个, 已写入 KV)",
      '<textarea readonly id="codes">'+codes+'</textarea><div class="bar"><button class="ghost" onclick="copyCodes()">复制全部</button><button onclick="closeModal()">关闭</button></div>');
    load();
  } else toast(r.msg||"生成失败",true);
}
async function act(action,code){
  if(action==='delete' && !confirm("确定删除激活码 "+code+" ? 此操作不可恢复。")) return;
  if(action==='revoke' && !confirm("作废 "+code+" 后, 已激活的设备将在下次打开时立即停用。确定?")) return;
  const r=await api(action,{code});
  toast(r.ok?(action==='revoke'?"已作废":action==='unbind'?"已解绑":"已删除"):(r.msg||"操作失败"), !r.ok);
  if(r.ok) load();
}
function copyCodes(){const t=document.getElementById("codes");t.select();document.execCommand("copy");toast("已复制");}
function showModal(title,body){document.getElementById("modal").innerHTML='<h3>'+title+'</h3>'+body;document.getElementById("mask").classList.add("show");}
function closeModal(){document.getElementById("mask").classList.remove("show");}
function logout(){PWD="";sessionStorage.removeItem("admin_pwd");loginView();}
loginView();
</script>
</body>
</html>`;
}
