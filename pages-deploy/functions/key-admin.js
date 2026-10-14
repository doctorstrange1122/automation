/**
 * 自动化 · 激活码管理后台 (Pages Functions 直接返回单页应用)
 * 移动端优先的卡片式界面
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
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>自动化 · 激活码管理</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:#eef2f7;color:#1e293b;min-height:100vh}
/* ---------- 顶栏 ---------- */
.topbar{position:sticky;top:0;z-index:20;background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 10px rgba(30,58,138,.35)}
.topbar .t{font-size:17px;font-weight:700;letter-spacing:.5px}
.topbar .t small{display:block;font-size:11px;font-weight:400;opacity:.75;letter-spacing:1px}
.topbar button{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:20px;padding:6px 16px;font-size:13px}
.wrap{max-width:560px;margin:0 auto;padding:14px 14px 90px}
/* ---------- 统计 ---------- */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.stat{background:#fff;border-radius:14px;padding:12px 6px;text-align:center;box-shadow:0 1px 4px rgba(15,23,42,.06)}
.stat .n{font-size:22px;font-weight:800;line-height:1.2}
.stat .l{font-size:11px;color:#64748b;margin-top:2px}
.stat.c-blue .n{color:#2563eb}.stat.c-slate .n{color:#475569}.stat.c-green .n{color:#059669}.stat.c-red .n{color:#dc2626}
/* ---------- 卡片 ---------- */
.card{background:#fff;border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 1px 5px rgba(15,23,42,.07)}
.card h3{font-size:15px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:6px}
.card h3::before{content:"";width:4px;height:15px;background:#2563eb;border-radius:2px;display:inline-block}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
label{font-size:12px;color:#64748b;display:block;margin-bottom:5px}
input{width:100%;border:1.5px solid #e2e8f0;border-radius:10px;padding:11px 12px;font-size:15px;outline:none;background:#f8fafc}
input:focus{border-color:#2563eb;background:#fff}
.btn{width:100%;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;margin-top:12px}
.btn.primary{background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;box-shadow:0 3px 10px rgba(37,99,235,.35)}
.btn.primary:active{opacity:.85}
/* ---------- 筛选 ---------- */
.chips{display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;padding-bottom:2px}
.chip{flex-shrink:0;border:1.5px solid #e2e8f0;background:#fff;color:#475569;border-radius:18px;padding:7px 15px;font-size:13px;cursor:pointer}
.chip.on{background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600}
/* ---------- 码卡片 ---------- */
.kcard{background:#fff;border-radius:16px;padding:14px;margin-bottom:11px;box-shadow:0 1px 5px rgba(15,23,42,.07)}
.ktop{display:flex;align-items:center;justify-content:space-between;gap:8px}
.code{font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:800;letter-spacing:1.5px;color:#0f172a;word-break:break-all}
.copy{flex-shrink:0;border:1.5px solid #e2e8f0;background:#f8fafc;color:#2563eb;border-radius:9px;padding:6px 11px;font-size:12px;font-weight:600}
.badges{display:flex;gap:6px;margin:9px 0;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;border-radius:6px;padding:3px 9px}
.b-ok{background:#d1fae5;color:#047857}.b-unused{background:#e2e8f0;color:#475569}
.b-revoked{background:#fee2e2;color:#b91c1c}.b-app{background:#ede9fe;color:#6d28d9}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;font-size:12.5px;color:#475569;background:#f8fafc;border-radius:10px;padding:9px 11px;margin-bottom:10px}
.meta b{color:#1e293b;font-weight:600}
.acts{display:flex;gap:8px}
.acts button{flex:1;border:none;border-radius:9px;padding:9px 0;font-size:13px;font-weight:600;cursor:pointer}
.a-revoke{background:#fef3c7;color:#b45309}
.a-unbind{background:#e0e7ff;color:#4338ca}
.a-del{background:#fee2e2;color:#b91c1c}
.empty{text-align:center;color:#94a3b8;padding:40px 0;font-size:14px}
/* ---------- 登录 ---------- */
.login-mask{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#1e3a8a,#3b82f6);padding:20px}
.login-box{background:#fff;border-radius:20px;padding:30px 24px;width:100%;max-width:360px;box-shadow:0 12px 40px rgba(0,0,0,.3)}
.login-box .logo{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
.login-box h2{text-align:center;font-size:18px;margin-bottom:4px}
.login-box p{text-align:center;font-size:12px;color:#94a3b8;margin-bottom:20px}
/* ---------- toast / modal ---------- */
#toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(20px);background:#0f172a;color:#fff;padding:11px 22px;border-radius:24px;font-size:14px;opacity:0;transition:.25s;pointer-events:none;z-index:99;max-width:86vw;text-align:center}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#mask{position:fixed;inset:0;background:rgba(15,23,42,.5);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
#mask.show{display:flex}
#modal{background:#fff;border-radius:16px;padding:22px;max-width:340px;width:100%;max-height:70vh;overflow:auto}
#modal h3{font-size:16px;margin-bottom:12px}
#modal .code-big{font-family:ui-monospace,monospace;font-size:20px;font-weight:800;letter-spacing:2px;background:#f1f5f9;border-radius:10px;padding:14px;text-align:center;margin-bottom:8px;word-break:break-all}
.hint{font-size:12px;color:#94a3b8;margin-top:8px}
.refresh{display:inline-flex;align-items:center;gap:5px;background:#f1f5f9;border:none;color:#475569;border-radius:18px;padding:7px 15px;font-size:13px;margin-bottom:12px}
</style>
</head>
<body>
<div id="app"></div>
<div id="toast"></div>
<div id="mask"><div id="modal"></div></div>
<script>
var PWD = sessionStorage.getItem("admin_pwd") || "";
function toast(msg, bad){var t=document.getElementById("toast");t.textContent=msg;t.style.background=bad?"#dc2626":"#0f172a";t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2200);}
async function api(action, body){
  var opt={method:"POST",headers:{"Content-Type":"application/json","X-Admin-Pwd":PWD}};
  if(body) opt.body=JSON.stringify(body);
  var r=await fetch("/api/key/admin/"+action,opt);
  if(r.status===401){PWD="";sessionStorage.removeItem("admin_pwd");loginView();throw new Error("未授权");}
  return r.json();
}
function fmtTime(ts){if(!ts)return "—";var d=new Date(ts);function p(n){return n<10?"0"+n:n}return (d.getFullYear())+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes());}
/* ================= 登录 ================= */
function loginView(){
  document.getElementById("app").innerHTML =
    '<div class="login-mask"><div class="login-box">'
    +'<div class="logo">🔐</div><h2>激活码管理</h2><p>自动化 · 分发者专用后台</p>'
    +'<label>管理密码</label><input id="pwd" type="password" placeholder="请输入管理密码">'
    +'<button class="btn primary" onclick="doLogin()">登 录</button>'
    +'</div></div>';
  document.getElementById("pwd").addEventListener("keydown",function(e){if(e.key==="Enter")doLogin();});
}
async function doLogin(){
  var p=document.getElementById("pwd").value;
  if(!p){toast("请输入密码",true);return;}
  try{
    var r=await fetch("/api/key/admin/login",{method:"POST",headers:{"Content-Type":"application/json","X-Admin-Pwd":p},body:"{}"});
    var j=await r.json();
    if(j.ok){PWD=p;sessionStorage.setItem("admin_pwd",p);dashView();}
    else toast(j.msg||"密码错误",true);
  }catch(e){toast("网络错误",true);}
}
/* ================= 仪表盘 ================= */
var FILTER="all", LIST=[];
function dashView(){
  document.getElementById("app").innerHTML =
    '<div class="topbar"><div class="t">激活码管理<small>自动化 · AUTO</small></div><button onclick="logout()">退出</button></div>'
    +'<div class="wrap">'
    +'<div class="stats" id="stats"></div>'
    +'<div class="card"><h3>生成激活码</h3>'
    +'<div class="row2"><div><label>数量</label><input id="g_count" type="number" min="1" max="200" value="5"></div>'
    +'<div><label>有效期(天)</label><input id="g_days" type="number" min="1" max="3650" value="30"></div></div>'
    +'<button class="btn primary" onclick="gen()">生成并写入</button>'
    +'<div class="hint">生成后即时生效 · 一码一设备(IMEI 绑定) · 仅限「自动化」App 使用</div></div>'
    +'<div><button class="refresh" onclick="load()">⟳ 刷新</button></div>'
    +'<div class="chips" id="chips"></div>'
    +'<div id="list"></div>'
    +'</div>';
  renderChips(); load();
}
function logout(){PWD="";sessionStorage.removeItem("admin_pwd");loginView();}
function renderChips(){
  var arr=[["all","全部"],["unused","未使用"],["activated","已激活"],["revoked","已作废"]];
  document.getElementById("chips").innerHTML = arr.map(function(a){
    return '<button class="chip'+(FILTER===a[0]?" on":"")+'" onclick="setFilter(\\''+a[0]+'\\')">'+a[1]+'</button>';
  }).join("");
}
function setFilter(f){FILTER=f;renderChips();renderList();}
async function load(){
  try{
    var j=await api("list");
    if(!j.ok){toast(j.msg||"加载失败",true);return;}
    LIST=j.list;
    var s=j.stats;
    document.getElementById("stats").innerHTML =
      '<div class="stat c-blue"><div class="n">'+s.total+'</div><div class="l">总数</div></div>'
      +'<div class="stat c-slate"><div class="n">'+s.unused+'</div><div class="l">未使用</div></div>'
      +'<div class="stat c-green"><div class="n">'+s.activated+'</div><div class="l">已激活</div></div>'
      +'<div class="stat c-red"><div class="n">'+s.revoked+'</div><div class="l">已作废</div></div>';
    renderList();
  }catch(e){if(e.message!=="未授权")toast("加载失败: "+e.message,true);}
}
function statusOf(it){return it.revoked?"revoked":(it.imei?"activated":"unused");}
function renderList(){
  var arr=LIST.filter(function(it){return FILTER==="all"||statusOf(it)===FILTER;});
  if(!arr.length){document.getElementById("list").innerHTML='<div class="card empty">暂无激活码</div>';return;}
  document.getElementById("list").innerHTML = arr.map(function(it){
    var st=statusOf(it);
    var badge= st==="revoked"?'<span class="badge b-revoked">已作废</span>'
             : st==="activated"?'<span class="badge b-ok">已激活</span>'
             : '<span class="badge b-unused">未使用</span>';
    return '<div class="kcard">'
      +'<div class="ktop"><div class="code">'+it.code+'</div><button class="copy" onclick="copyOne(\\''+it.code+'\\')">复制</button></div>'
      +'<div class="badges">'+badge+'<span class="badge b-app">AUTO 专用</span><span class="badge b-unused">'+it.days+' 天</span></div>'
      +'<div class="meta">'
      +'<div>绑定设备<br><b>'+(it.imei||"—")+'</b></div>'
      +'<div>激活时间<br><b>'+fmtTime(it.activatedAt)+'</b></div>'
      +'<div>到期时间<br><b>'+(it.activatedAt?fmtTime(it.expiry):"—")+'</b></div>'
      +'<div>创建时间<br><b>'+fmtTime(it.createdAt)+'</b></div>'
      +'</div>'
      +'<div class="acts">'
      +'<button class="a-revoke" onclick="act(\\'revoke\\',\\''+it.code+'\\')">作废</button>'
      +'<button class="a-unbind" onclick="act(\\'unbind\\',\\''+it.code+'\\')">解绑</button>'
      +'<button class="a-del" onclick="act(\\'delete\\',\\''+it.code+'\\')">删除</button>'
      +'</div></div>';
  }).join("");
}
function copyOne(c){
  if(navigator.clipboard){navigator.clipboard.writeText(c).then(function(){toast("已复制 "+c)}).catch(function(){fallbackCopy(c)});}
  else fallbackCopy(c);
}
function fallbackCopy(c){var t=document.createElement("textarea");t.value=c;document.body.appendChild(t);t.select();document.execCommand("copy");document.body.removeChild(t);toast("已复制 "+c);}
async function gen(){
  var count=+document.getElementById("g_count").value||1;
  var days=+document.getElementById("g_days").value||30;
  if(count<1||count>200){toast("数量 1-200",true);return;}
  try{
    var j=await api("generate",{count:count,days:days});
    if(!j.ok){toast(j.msg||"生成失败",true);return;}
    document.getElementById("modal").innerHTML='<h3>✅ 生成成功('+j.codes.length+'个)</h3>'
      +j.codes.map(function(c){return '<div class="code-big">'+c+'</div>'}).join("")
      +'<div class="hint">请立即保存, 关闭后仍可在列表中查看</div>'
      +'<button class="btn primary" onclick="copyAll()">一键复制全部</button>'
      +'<button class="btn" style="background:#f1f5f9;color:#475569;margin-top:8px" onclick="closeModal()">关闭</button>';
    document.getElementById("mask").classList.add("show");
    window._lastCodes=j.codes;
    load();
  }catch(e){toast("生成失败: "+e.message,true);}
}
function copyAll(){fallbackCopy((window._lastCodes||[]).join("\\n"));toast("已复制全部");}
function closeModal(){document.getElementById("mask").classList.remove("show");}
async function act(action,code){
  if(action==="delete"&&!confirm("确定删除激活码 "+code+" ?此操作不可恢复。"))return;
  if(action==="revoke"&&!confirm("确定作废 "+code+" ?作废后该码立即停用。"))return;
  if(action==="unbind"&&!confirm("确定解绑 "+code+" ?解绑后可在新设备重新激活。"))return;
  try{
    var j=await api(action,{code:code});
    if(j.ok){toast({revoke:"已作废",unbind:"已解绑",delete:"已删除"}[action]+" "+code);load();}
    else toast(j.msg||"操作失败",true);
  }catch(e){toast("操作失败",true);}
}
if(PWD){dashView();}else{loginView();}
</script>
</body>
</html>`;
}
