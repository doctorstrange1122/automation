# -*- coding: utf-8 -*-
"""
把还原出的 main.js 改造为 Cloudflare 版:
  - 顶部插入配置块(CF服务器 / CF令牌), 换令牌只改这两行
  - 19 处 URL 站点全部切到 Cloudflare Worker, 激活协议(lx=26/lx=28/响应格式)完全不变
  - 删除原 520xzs.cn / lanzou 失联备用链, 改为明确报错
"""
import sys, io

SRC = "/workspace/定时点击器源码/main.js"
OUT = "/workspace/定时点击器源码/main_cloudflare.js"

# (说明, 原文, 新文)  —— 原文必须精确匹配且只出现一次
PATCHES = [
("配置块插入点(首行后)", '"ui";  // L2',
 '"ui";  // L2\n'
 '// ================= Cloudflare 激活服务配置(更换令牌只需改这两行) =================\n'
 'var CF服务器 = "https://your-worker.your-subdomain.workers.dev";  // Worker 地址, 不含末尾斜杠\n'
 'var CF令牌 = "在这里填入你的访问令牌";  // 必须与 Worker 端的 TOKEN 一致\n'
 'function CF请求头() { return {"Authorization": "Bearer " + CF令牌, "User-Agent": "Mozilla/5.0"}; }\n'
 '// =========================================================================='),

("菜单-爱上半价", '    return app.openUrl("http://" + 服务器地址);  // L2317',
 '    return app.openUrl(CF服务器);  // L2317'),

("校时-hqsj", '                v2 = parseInt(http.get("http://" + 服务器地址 + ":966/hqsj.php").body.string());  // L3084',
 '                v2 = parseInt(http.get(CF服务器 + "/hqsj.php?token=" + CF令牌, {headers: CF请求头()}).body.string());  // L3084'),

("激活隐藏-lx26", '        var url = "http://" + 服务器地址 + ":966/lx=26&IMEI=" + IMEI + "&sg=" + cscs + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId;  // L6247',
 '        var url = CF服务器 + "/lx=26?IMEI=" + IMEI + "&sg=" + cscs + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId + "&token=" + CF令牌;  // L6247'),

("激活隐藏-lx26-post", '        var res = http.post(url, {lx: "26", IMEI: IMEI, password: yzm});  // L6248',
 '        var res = http.post(url, {lx: "26", IMEI: IMEI, password: yzm}, {headers: CF请求头()});  // L6248'),

("激活隐藏-lx28", '                url = "http://" + 服务器地址 + ":966/lx=28&?IMEI=" + IMEI + "&sg=" + cscs + "&ys=" + xjhm + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId;  // L6277',
 '                url = CF服务器 + "/lx=28?IMEI=" + IMEI + "&sg=" + cscs + "&ys=" + xjhm + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId + "&token=" + CF令牌;  // L6277'),

("激活隐藏-lx28-get", '                res = http.get(url).body.string();  // L6283',
 '                res = http.get(url, {headers: CF请求头()}).body.string();  // L6283'),

("服务器地址定义", '    var 服务器地址 = storage.get("服务器地址", "47.108.239.26").toString();  // L6464',
 '    var 服务器地址 = CF服务器;  // L6464 改为 Cloudflare 配置(不再读 storage 旧值)'),

("配置接口", '        var res = http.get("http://" + 服务器地址 + "/update/guanggaolianjie.js");  // L6474',
 '        var res = http.get(服务器地址 + "/update/guanggaolianjie.js?token=" + CF令牌, {headers: CF请求头()});  // L6474'),

("失联备用链整体删除",
 '''    if (需要获取服务器地址 == true) {  // L6480
        res = http.get("https://520xzs.lanzouj.com/iuHqy295eohc").body.string();  // L6481
        if (res.lastIndexOf("dizhiqian") > -1) {  // L6482
            服务器地址 = 文本取中间(res, "dizhiqian", "dizhihou");  // L6483
        } else {
            try {  // L6485
                res = http.get("http://520xzs.cn/in.php?update/guanggaolianjie.js");  // L6486
                objj = res.body.json();  // L6487
                服务器地址 = objj["激活服务器地址"];  // L6488
            } catch (e) {
                服务器地址 = undefined;  // L6490
            }
        }
        if (isEmpty(服务器地址)) {  // L6494
            alert("软件已失联。请联系qq：767187006 下载新版");  // L6495
            log("软件已失联。请联系qq：767187006 下载新版");  // L6496
            return;  // L6497
        } else {
            storage.put("服务器地址", 服务器地址);  // L6499
        }
    }''',
 '''    if (需要获取服务器地址 == true) {  // L6480
        alert("无法连接激活服务器 " + CF服务器 + " ，请检查网络后重试。");  // 原失联备用链(lanzou/520xzs.cn)已移除
        log("无法连接激活服务器: " + CF服务器);
        return;  // L6497
    }'''),

("远程脚本yxjs", '        var msg = http.get("http://" + 服务器地址 + "/update/yxjs.js").body.string();  // L6555',
 '        var msg = http.get(服务器地址 + "/update/yxjs.js?token=" + CF令牌, {headers: CF请求头()}).body.string();  // L6555'),

("反馈#1-url", '    url = "http://520xzs.cn/fk.php?rjm=点击器&nr=" + jhm + "&IMEI=" + IMEI + "&bbh=" + bbh;  // L6593',
 '    url = CF服务器 + "/fk.php?rjm=点击器&nr=" + encodeURIComponent(jhm) + "&IMEI=" + IMEI + "&bbh=" + bbh + "&token=" + CF令牌;  // L6593'),

("反馈#1-post", '    res = http.post(url, {rjm: "hdzs", nr: jhm, IMEI: IMEI});  // L6595',
 '    res = http.post(url, {rjm: "hdzs", nr: jhm, IMEI: IMEI}, {headers: CF请求头()});  // L6595'),

("更新检测djq.html", '    res = http.get("http://" + 服务器地址 + "/update/djq.html?IMEI=" + IMEI + "&bbh=" + bbh).body.string();  // L6695',
 '    res = http.get(服务器地址 + "/update/djq.html?IMEI=" + IMEI + "&bbh=" + bbh + "&token=" + CF令牌, {headers: CF请求头()}).body.string();  // L6695'),

("热更新main.snapshot", '        msg = http.get("http://" + 服务器地址 + "/gx/main.snapshot").body.bytes();  // L6710',
 '        msg = http.get(服务器地址 + "/gx/main.snapshot?token=" + CF令牌, {headers: CF请求头()}).body.bytes();  // L6710'),

("热更新zhu.snapshot", '            msg = http.get("http://" + 服务器地址 + "/gx/zhu.snapshot").body.bytes();  // L6720',
 '            msg = http.get(服务器地址 + "/gx/zhu.snapshot?token=" + CF令牌, {headers: CF请求头()}).body.bytes();  // L6720'),

("新激活-lx26", '    var url = "http://" + 服务器地址 + ":966/lx=26&?IMEI=" + IMEI + "&sg=" + cscs + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId;  // L6805',
 '    var url = CF服务器 + "/lx=26?IMEI=" + IMEI + "&sg=" + cscs + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId + "&token=" + CF令牌;  // L6805'),

("新激活-lx26-get", '    var sqnr = http.get(url).body.string();  // L6812',
 '    var sqnr = http.get(url, {headers: CF请求头()}).body.string();  // L6812'),

("新激活-lx28", '            url = "http://" + 服务器地址 + ":966/lx=28&?IMEI=" + IMEI + "&sg=" + cscs + "&ys=" + xjhm + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId;  // L6837',
 '            url = CF服务器 + "/lx=28?IMEI=" + IMEI + "&sg=" + cscs + "&ys=" + xjhm + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId + "&token=" + CF令牌;  // L6837'),

("新激活-lx28-get", '            res = http.get(url).body.string();  // L6843',
 '            res = http.get(url, {headers: CF请求头()}).body.string();  // L6843'),

("使用说明页", '        app.openUrl("http://106.53.151.188:8000/g/%E5%AE%9A%E6%97%B6%E7%82%B9%E5%87%BB%E5%99%A8(%E5%AE%89%E5%8D%93%E7%89%88)");  // L6909',
 '        app.openUrl(CF服务器 + "/g/");  // L6909'),

("新激活2-lx100", '            var res = http.get("http://" + 服务器地址 + ":966/lx=100&IMEI=" + IMEI + "&yourId=" + yourId + "&bbh=" + bbh + "&password=" + jhm);  // L6962',
 '            var res = http.get(CF服务器 + "/lx=100?IMEI=" + IMEI + "&yourId=" + yourId + "&bbh=" + bbh + "&password=" + jhm + "&token=" + CF令牌, {headers: CF请求头()});  // L6962'),

("新激活2-lx100-fallback", '            res = http.get("http://520xzs.cn/djq.php?lx=100&IMEI=" + IMEI + "&yourId=" + yourId + "&bbh=" + bbh + "&password=" + jhm);  // L6967',
 '            res = http.get(CF服务器 + "/lx=100?IMEI=" + IMEI + "&yourId=" + yourId + "&bbh=" + bbh + "&password=" + jhm + "&token=" + CF令牌, {headers: CF请求头()});  // L6967'),

("新激活2-lx28", '                        var url = "http://" + 服务器地址 + ":966/lx=28?IMEI=" + IMEI + "&sg=" + cscs + "&ys=" + jhm + "&password=" + jhm + "&bbh=" + bbh + "&id=" + yourId;  // L7009',
 '                        var url = CF服务器 + "/lx=28?IMEI=" + IMEI + "&sg=" + cscs + "&ys=" + jhm + "&password=" + jhm + "&bbh=" + bbh + "&id=" + yourId + "&token=" + CF令牌;  // L7009'),

("新激活2-lx28-post", '                        res = http.post(url, {lx: "28", IMEI: IMEI, password: yzm});  // L7010',
 '                        res = http.post(url, {lx: "28", IMEI: IMEI, password: yzm}, {headers: CF请求头()});  // L7010'),

("反馈#2-url", '    url = "http://520xzs.cn/fk.php?rjm=点击器&nr=" + jhm + "&IMEI=" + IMEI + "&bbh=" + bbh;  // L7083',
 '    url = CF服务器 + "/fk.php?rjm=点击器&nr=" + encodeURIComponent(jhm) + "&IMEI=" + IMEI + "&bbh=" + bbh + "&token=" + CF令牌;  // L7083'),

("反馈#2-post", '    res = http.post(url, {rjm: "hdzs", nr: jhm, IMEI: IMEI});  // L7085',
 '    res = http.post(url, {rjm: "hdzs", nr: jhm, IMEI: IMEI}, {headers: CF请求头()});  // L7085'),
]

def main():
    text = io.open(SRC, encoding="utf-8").read()
    for name, old, new in PATCHES:
        n = text.count(old)
        if n != 1:
            print("[失败] %s: 匹配 %d 次(需要1次)" % (name, n))
            return 1
        text = text.replace(old, new)
        print("[OK] %s" % name)
    io.open(OUT, "w", encoding="utf-8").write(text)
    # 校验没有残留旧地址
    import re
    left = re.findall(r'47\.108\.239\.26|520xzs|lanzouj|106\.53\.151\.188|:966/', text)
    print("\n残留旧地址引用:", left if left else "无")
    print("输出:", OUT)
    return 0

if __name__ == "__main__":
    sys.exit(main())
