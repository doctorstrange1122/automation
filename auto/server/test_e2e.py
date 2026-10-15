#!/usr/bin/env python3
"""端到端验证: 激活(lx=28) -> 启动校验(lx=29) -> 后台作废 -> 立即失效"""
import json, time, urllib.request, urllib.parse

CF = "https://automation-activation.pages.dev"
TOKEN = "362521f0335bce2cf2e0a12318705366f97e9e9717769d06"
ADMIN_PWD = open("/tmp/secrets.txt").read().strip().split("\n")
ADMIN_PWD = [l.split("=",1)[1] for l in ADMIN_PWD if l.startswith("ADMI")][0]

import time as _time
def _req(req, timeout=20):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8","replace")
        except urllib.error.HTTPError as e:
            if e.code == 403 and attempt < 3:
                _time.sleep(2 + attempt*2); continue
            return f"<HTTP {e.code}>"
        except Exception as e:
            return f"<ERR {e}>"
    return "<HTTP 403-retry>"

def get(url, headers=None, timeout=20):
    return _req(urllib.request.Request(url, headers=headers or {"User-Agent":"Mozilla/5.0"}), timeout)

def post(url, data, headers=None, timeout=20):
    return _req(urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(),
                 headers=headers or {"User-Agent":"Mozilla/5.0"}, method="POST"), timeout)

IMEI = "abcdef1234567890"
IMEI2 = "deadbeef00000000"
ID = "2601010001234567890"
XIM = str(int(ID[3:8]) * 3)
SG = "12345678"
ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    if cond: ok += 1; print(f"  [✓] {name}")
    else: fail += 1; print(f"  [✗] {name}  {detail}")

print("== 1. lx=26 激活提示(关闭试用) ==")
r = get(f"{CF}/lx=26?IMEI={IMEI}&sg={SG}&bbh=305&id={ID}&token={TOKEN}")
print("   ", r)
check("含<ok>提示", "<ok>" in r)
check("不再发放试用(无'先体验')", "体验" not in r and "试用" not in r)

print("== 2. 管理后台登录鉴权 ==")
r = post(f"{CF}/api/key/admin/login", {}, headers={"X-Admin-Pwd": ADMIN_PWD})
check("正确密码登录成功", '"ok":true' in r, r)
r = post(f"{CF}/api/key/admin/login", {}, headers={"X-Admin-Pwd": "wrong"})
check("错误密码被拒", '"ok":false' in r, r)

print("== 3. 生成激活码 (count=2, days=30) ==")
r = post(f"{CF}/api/key/admin/generate", {"count":"2","days":"30"}, headers={"X-Admin-Pwd": ADMIN_PWD})
print("   ", r)
gen = json.loads(r)
codes = gen.get("codes", [])
check("生成返回2个码", len(codes)==2, r)
code = codes[0] if codes else ""

print("== 4. lx=28 首次激活(绑定本机) ==")
r = get(f"{CF}/lx=28?IMEI={IMEI}&sg={SG}&ys={code}&bbh=305&id={ID}&token={TOKEN}")
print("   ", r[:80], "...")
check("返回<ok>", "<ok>" in r)
if "<ok>" in r:
    exp = r[16:29]
    sgback = r[35:43]
    xym = r[56:].split("<")[0]
    check("到期13位且未来", len(exp)==13 and int(exp) > time.time()*1000, f"exp={exp}")
    check("sg原样回显", sgback == SG, f"{sgback}!={SG}")
    check("xym正确", xym == XIM, f"{xym}!={XIM}")

print("== 5. lx=29 启动校验(同机) ==")
r = get(f"{CF}/lx=29?IMEI={IMEI}&sg={SG}&code={code}&bbh=305&id={ID}&token={TOKEN}")
check("同机校验通过<ok>", "<ok>" in r, r)

print("== 6. lx=29 换机(不同IMEI) ==")
r = get(f"{CF}/lx=29?IMEI={IMEI2}&sg={SG}&code={code}&bbh=305&id={ID}&token={TOKEN}")
check("换机被锁<sb>", "<sb>" in r, r)

print("== 7. 后台作废 ==")
r = post(f"{CF}/api/key/admin/revoke", {"code":code}, headers={"X-Admin-Pwd": ADMIN_PWD})
check("作废成功", '"ok":true' in r, r)

print("== 8. 作废后 lx=29 立即失效 ==")
r = get(f"{CF}/lx=29?IMEI={IMEI}&sg={SG}&code={code}&bbh=305&id={ID}&token={TOKEN}")
check("作废后拒绝<sb>", "<sb>" in r, r)
check("提示含'作废'", "作废" in r, r)

print("== 9. 后台列表统计 ==")
r = post(f"{CF}/api/key/admin/list", {}, headers={"X-Admin-Pwd": ADMIN_PWD})
d = json.loads(r)
print("   stats:", d.get("stats"))
check("列表含已作废统计", d.get("stats",{}).get("revoked",0) >= 1, r)

print(f"\n结果: 通过 {ok} / 失败 {fail}")
