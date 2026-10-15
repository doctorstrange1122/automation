#!/usr/bin/env python3
"""全面验证 Pages 激活服务: 偏移量按 App 端逻辑(含 <ok> 4字节前缀)解析"""
import hashlib, time, urllib.request, urllib.parse, json

CF = "https://automation-activation.pages.dev"
TOKEN = "362521f0335bce2cf2e0a12318705366f97e9e9717769d06"

def sg_now():
    d = time.localtime()
    sec = 30 if d.tm_sec > 30 else 10
    cs = int(f"{d.tm_mday}{d.tm_hour}{d.tm_min}{sec}") * 36 + 36522
    return hashlib.md5(str(cs).encode()).hexdigest()[:8]

def get(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        return f"<ERR {e}>"

IMEI = "abcdef1234567890"
ID = "2601010001234567890"   # 11位, 同 App: random(10000000000, 90000000000)
XIM = str(int(ID[3:8]) * 3)  # App: yourId.substr(3,5)*3
ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    if cond: ok += 1; print(f"  ✓ {name}")
    else: fail += 1; print(f"  ✗ {name}  {detail}")

codes = json.load(open("/tmp/activation_config.json"))["codes"]

print("== 1. lx=26 激活对话框 ==")
sg = sg_now()
r = get(f"{CF}/lx=26?IMEI={IMEI}&sg={sg}&password=1&bbh=305&id={ID}&token={TOKEN}")
print(" ", r)
check("返回 <ok>提示</ok>", r == "<ok>请输入激活码，或输入1先体验功能。</ok>", r)
check("无 <sb> 干扰", "<sb>" not in r)

print("== 2. lx=28 有效激活码 ==")
for code in [codes[0], codes[15], codes[29]]:
    sg = sg_now()
    p = {"IMEI": IMEI, "sg": sg, "ys": code, "bbh": "305", "id": ID, "password": "1", "token": TOKEN}
    r = get(f"{CF}/lx=28?{urllib.parse.urlencode(p)}")
    print(f"  {code} -> {r}")
    if "<ok>" not in r:
        check(f"码 {code} 激活", False, r); continue
    sq = r  # App 端直接对整串(含<ok>)取偏移
    body = r[4:-5]
    check(f"码 {code}: sg回显(sqnr[35:43])", sq[35:43] == sg, f"{sq[35:43]} != {sg}")
    check(f"码 {code}: 激活方式(sqnr[10])", sq[10] == "1", sq[10])
    check(f"码 {code}: ycms(sqnr[13:16])", len(sq[13:16]) == 3)
    exp = sq[16:29]
    check(f"码 {code}: 到期13位且在未来", len(exp) == 13 and int(exp) > time.time() * 1000, exp)
    check(f"码 {code}: xym(sqnr[56:])", sq[56:] == XIM, f"{sq[56:]} != {XIM}")

print("== 3. lx=28 体验模式(输入1) ==")
sg = sg_now()
p = {"IMEI": IMEI, "sg": sg, "ys": "1", "bbh": "305", "id": ID, "password": "1", "token": TOKEN}
r = get(f"{CF}/lx=28?{urllib.parse.urlencode(p)}")
print(" ", r)
check("体验模式签发", "<ok>" in r and int(r[16 + 4:29 + 4]) > time.time() * 1000)

print("== 4. lx=28 无效码 ==")
for bad_code in ["0000000000", "abcdefghij", "2QzqCrbQW6", "1"]:
    pass
r = get(f"{CF}/lx=28?{urllib.parse.urlencode({'IMEI': IMEI, 'sg': sg_now(), 'ys': '0000000000', 'id': ID, 'token': TOKEN})}")
print(" ", r)
check("无效码报错 <sb>", "<sb>" in r and "<ok>" not in r)
r = get(f"{CF}/lx=28?{urllib.parse.urlencode({'IMEI': IMEI, 'sg': sg_now(), 'ys': '中文码', 'id': ID, 'token': TOKEN})}")
check("非字母数字码报错", "<sb>" in r)

print("== 5. lx=100 兜底激活布局 ==")
r = get(f"{CF}/lx=100?IMEI={IMEI}&yourId={ID}&bbh=305&password=ka&token={TOKEN}")
print(" ", r)
check("lx=100 到期(sqnr[5:18])在未来", int(r[5:18]) > time.time() * 1000, r[5:18])
check("lx=100 服务器时间(sqnr[30:43])", abs(int(r[30:43]) - time.time() * 1000) < 60000)
check("lx=100 xym(sqnr[43:])", r[43:] == XIM, f"{r[43:]} != {XIM}")
check('lx=100 lastIndexOf("8")>3', r.rindex("8") > 3)

print("== 6. 鉴权 ==")
check("无 token 拒访", "401" in str(get(f"{CF}/lx=26?IMEI=x")) or get(f"{CF}/lx=26?IMEI=x") == "<sb>访问令牌无效</sb>")
check("错 token 拒访", get(f"{CF}/lx=26?IMEI=x&token=wrong") == "<sb>访问令牌无效</sb>")

print("== 7. 公开页面与配置 ==")
r = get(f"{CF}/")
check("使用说明页公开可访问", "自动化" in r and "激活" in r, r[:80])
r = get(f"{CF}/g/")
check("/g/ 公开", "激活服务" in r, r[:80])
r = get(f"{CF}/update/guanggaolianjie.js?token={TOKEN}")
obj = json.loads(r)
check("配置 JSON 可解析", isinstance(obj, dict))
check("显示内容=自动化 v1.0", obj.get("点击器显示内容") == "自动化 v1.0")
check("yxjs=0(不执行远程脚本)", obj.get("yxjs") == "0")
r = get(f"{CF}/update/djq.html?token={TOKEN}")
check("更新检查: 不提示更新(305==bbh)", "<djq>305</djq>" in r and "<main>100</main>" in r)
r = get(f"{CF}/hqsj.php?token={TOKEN}")
check("校时接口", abs(int(r) - time.time() * 1000) < 60000, r)
r = get(f"{CF}/fk.php?rjm=test&nr=hi&token={TOKEN}")
check("反馈接口返回1", r == "1", r)
r = get(f"{CF}/update/yxjs.js?token={TOKEN}")
check("远程脚本接口返回空", r == "", repr(r))

print(f"\n结果: {ok} 通过, {fail} 失败")
exit(1 if fail else 0)
