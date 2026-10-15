"ui";  // L2
// ================= Cloudflare 激活服务配置(更换令牌只需改这两行) =================
var CF服务器 = "https://automation-activation.pages.dev";  // Pages 激活服务地址, 不含末尾斜杠
// 应用标识: 与旧版(原包)激活体系隔离。服务端只接受带 app=CF应用标识 且激活码 app 字段一致的请求,
// 旧版发出的激活码在本软件中一律无效, 因此本软件必须单独激活。
var CF应用标识 = "auto";
var CF令牌 = "362521f0335bce2cf2e0a12318705366f97e9e9717769d06";  // 必须与 Pages 端的 TOKEN 一致
function CF请求头() { return {"Authorization": "Bearer " + CF令牌, "User-Agent": "Mozilla/5.0"}; }
// ==========================================================================
var color = "#a52a2a";  // L3
importClass(android.graphics.Color);  // L4
importClass(android.graphics.PorterDuff);  // L5
importClass(android.graphics.PorterDuffXfermode);  // L6
importClass(android.graphics.Rect);  // L7
importClass(android.graphics.RectF);  // L8
importClass(android.text.TextWatcher);  // L9
var entries = "指定输入法输入|添加新主线程|添加新子线程|跳出循环|添加悬浮按钮并等待被按下|选择复选框|执行返回|执行回到桌面|打开链接|用淘宝app打开链接|用京东app打开链接|打开app|输入|打开Activity|结束执行脚本|置剪辑版文本|粘贴|导入js文件|设置全局变量|执行js代码|设置找字app";  // L10
var djl = "";  // L12
var bbhv = "3.0.5";
var 关闭悬浮 = 0;
var djms = 1;
var 网络延时 = 0;
var wlsjc = 0;
var 时间通道 = "";  // 全局默认空串: 启动即走 CF服务器 /hqsj.php(最稳); UI选中后分流到对应平台
var xinhao = "pro";
var szzzfw = "1";
var 已添加循环次数 = 0;
var storage = storages.create("automation_djq_auto");  // L14 (与原包隔离: 不与旧版共享激活记录)
var mingcheng = "自动化 v1";  // 顶部标题固定 v1
// ==================== 激活模块(重写) ====================
// 原则:
//   1) 后端是唯一权威 —— 有效期/作废/换机/是否有效 全部由后端判定
//   2) 本地仅缓存"激活码字符串"(免重复输入), 不保存任何授权状态/到期时间
//   3) 每次启动都联网校验; 未通过前, 激活框绝不关闭(被关就重弹), 绝不进入主界面
var ACT_缓存键 = "激活码缓存";
var ACT_设备 = device.getAndroidId();
var ACT_版本 = "3.0.5";

function act_取中间(s, a, b) {
    var i = s.indexOf(a);
    if (i < 0) return "";
    var j = s.indexOf(b, i + a.length);
    if (j < 0) return s.substring(i + a.length);
    return s.substring(i + a.length, j);
}

// 联网请求(网络操作放子线程, 主线程等待结果)
function act_请求(url) {
    var r = { done: false, ok: false, msg: "" };
    threads.start(function() {
        try {
            // 优化: 原版 http.get 无超时, 网络不通时会挂到系统默认超时(可能十几秒),
            // 叠加外层 30 秒轮询 → 用户感觉"卡死"。这里显式给 connect/read/writeTimeout。
            var res = http.get(url, {
                headers: {},
                timeout: 8000,
                connectTimeout: 5000,
                readTimeout: 8000,
                writeTimeout: 5000
            }).body.string();
            if (res.indexOf("<ok>") > -1) { r.ok = true; }
            else { r.msg = act_取中间(res, "<sb>", "<") || "激活码无效"; }
        } catch (e) {
            r.msg = "无法连接激活服务器, 请检查网络后重试";
        }
        r.done = true;
    });
    // 优化: 轮询上限 60×500ms=30 秒 → 20×250ms=5 秒; 配合上面的 8 秒网络超时足够
    var n = 0;
    while (!r.done && n < 20) { sleep(250); n++; }
    if (!r.done) { r.msg = "连接激活服务器超时"; }
    return r;
}

function act_校验(码) {   // lx=29 启动校验
    return act_请求(CF服务器 + "/lx=29?IMEI=" + ACT_设备 + "&code=" + 码 + "&sg=0&bbh=" + ACT_版本 + "&id=1&token=" + CF令牌 + "&app=" + CF应用标识);
}
function act_激活(码) {   // lx=28 首次激活(绑定设备)
    return act_请求(CF服务器 + "/lx=28?IMEI=" + ACT_设备 + "&sg=0&ys=" + 码 + "&password=" + 码 + "&bbh=" + ACT_版本 + "&id=1&token=" + CF令牌 + "&app=" + CF应用标识);
}
function act_通过(码) {   // 优化: 单次请求
    // 原实现先 lx=29 校验、失败再 lx=28 激活 —— 两次串行网络请求, Cloudflare 冷启动本身
    // 就要 2~5 秒, 失败场景更是 10 秒起步, 这是"校验特别慢"的根因。
    // lx=28 已覆盖 lx=29 的全部校验能力(码格式/不存在/作废/换机/应用不符/解绑设备),
    // 且"已绑定本机"的码同样返回 <ok>。故此处只发一次 lx=28 即可完成"校验+激活"。
    return act_激活(码);
}

// ==================== 激活模块结束 ====================

// ==================== 启动: 激活界面(主界面加载前必须完成激活) ====================
ui.layout(<vertical padding="24" gravity="center" bg="#ffffff">
    <text text="自动化" textSize="26sp" textColor="#1e293b" gravity="center" marginTop="24"/>
    <text text="请输入激活码以激活本软件" textSize="15sp" textColor="#64748b" gravity="center" marginTop="10"/>
    <input id="actCode" hint="请输入激活码" textSize="16sp" marginTop="26" w="*"/>
    <button id="actOk" text="确 定" style="Widget.AppCompat.Button.Colored" marginTop="12" w="*"/>
    <button id="actWeb" text="获取激活码" style="Widget.AppCompat.Button.Borderless" marginTop="4" w="*"/>
    <text id="actMsg" text="" textColor="#e53935" textSize="13sp" gravity="center" marginTop="10" w="*"/>
</vertical>);

var 激活完成标志 = false;
var 主程序已启动 = false;
var 浮窗已授权 = floaty.checkPermission();

// 第 0 步: 悬浮窗授权(未授权则引导跳转, 子线程轮询等待)
threads.start(function() {
    var n = 0;
    while (!floaty.checkPermission() && n < 120) {
        if (n % 6 == 0) { try { floaty.requestPermission(); } catch (e) {} }
        sleep(500); n++;
    }
});

// 已有缓存码: 后台自动校验, 通过则直接进主界面(不阻塞, 纯事件驱动)
var ACT_缓存码 = storage.get(ACT_缓存键);
if (ACT_缓存码) {
    ui.actMsg.setText("正在校验激活状态...");
    threads.start(function() {
        var r0 = act_通过(ACT_缓存码);
        ui.run(function() {
            if (r0.ok) {
                激活完成标志 = true;
                if (!主程序已启动) {
                    主程序已启动 = true;
                    启动主程序();
                }
            } else {
                storage.remove(ACT_缓存键);      // 过期/作废/换机 → 清缓存, 等用户重新输入
                ui.actMsg.setText(r0.msg || "激活已失效, 请重新输入激活码");
            }
        });
    });
}

ui.actWeb.on("click", function() {
    try { app.openUrl(CF服务器 + "/g/"); } catch (e) { toast("打开失败, 请联系分发者获取激活码"); }
});

ui.actOk.on("click", function() {
    var code = String(ui.actCode.getText() || "").trim();
    if (!code) { ui.run(function() { ui.actMsg.setText("请输入激活码"); }); return; }
    ui.run(function() { ui.actOk.setEnabled(false); ui.actMsg.setText("正在校验激活码, 请稍候..."); });
    threads.start(function() {
        var r = act_通过(code);          // 后端判定: 有效/过期/作废/换机
        ui.run(function() {
            ui.actOk.setEnabled(true);
            if (r.ok) {
                storage.put(ACT_缓存键, code);   // 仅缓存码字符串, 不存任何授权状态
                激活完成标志 = true;
                ui.actMsg.setText("激活成功");
                if (!主程序已启动) {
                    主程序已启动 = true;
                    启动主程序();                 // 激活成功 → 才加载主界面
                }
            } else {
                ui.actMsg.setText(r.msg);
            }
        });
    });
});


// ==================== 主界面(激活成功后由回调调用; 全程事件驱动, 不阻塞 UI 线程) ====================
function 启动主程序() {
ui.layout(new XML(<drawer id="drawer">
        <vertical>
            <appbar bg="#a52a2a">
                <horizontal gravity="center_vertical">
                    <text id="menuBtn" text="☰" textSize="26sp" textColor="#ffffff" padding="8 14 8 14" />
                    <toolbar id="toolbar" title="{{mingcheng}} " />
                </horizontal>
                {}
            </appbar>
            <viewpager id="viewpager">
                <frame>
                    <ScrollView>
                        <vertical padding="10">
                            <text textSize="16sp" id="networkTest" textColor="#ff7f50" margin="0 5" text="正在检测网络延迟..." />
                            <Switch id="autoService" text="无障碍服务" checked="{{auto.service != null}}" margin="0 10" textSize="15sp" />
                            <horizontal w="*" h="1sp" margin="0 5 0 5" bg='#E2E2E2'></horizontal>
                            <horizontal gravity="center_vertical">
                                <text text="选择时间：     " />
                                {}
                            </horizontal>
                            <horizontal gravity="center_vertical">
                                <radiogroup orientation="horizontal">

                                    <radio id="dx3" text="时间1" checked="true" />
                                    <radio id="dx2" text="时间2" />
                                    <radio id="dx1" text="时间3" />
                                    <radio id="dx5" text="本机" />
                                </radiogroup>
                                <checkbox id="显示时间" text="显示时间" />
                            </horizontal>
                            <horizontal w="*" h="1sp" margin="0 10 0 10" bg='#E2E2E2'></horizontal>
                            <vertical minHeight="135dp">
                                <horizontal gravity="center_vertical">
                                    <text id="这个点点击" text="这个点 点击" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="次数" text="1" />
                                    <text id="每次等待" text="次，每次等待" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="时间间隔" text="10" />
                                    <text id="毫秒后再执行" text="毫秒后再执行" />
                                </horizontal>
                                <horizontal gravity="center_vertical">
                                    <text id="像素文本" text="点击时长:" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="点击时长" text="10" hint="10" />
                                    <text id="毫秒文本" text="毫秒" />
                                    <checkbox h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="随机偏移选择框" text="点击随机偏移" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="随机偏移值" text="10" hint="10" />
                                    <text id="随机偏移值文本" text="像素" />
                                </horizontal>
                                <horizontal gravity="center_vertical">
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="添加" text="添加一个点" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <text id="空1" text="  " />
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="清除" text="重新设置" style="Widget.AppCompat.Button.Colored" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                                    </card>
                                </horizontal>
                                <horizontal gravity="center_vertical" marginTop="6dp">
                                    {}
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="随机延迟时间" text="添加延迟" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="随机延迟时间1" text="10" hint="10" />
                                    <text id="随机延迟时间11" text="-" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="随机延迟时间2" text="25" hint="20" />
                                    <text id="随机延迟时间22" text="毫秒" />
                                </horizontal>


                                {}

                                <horizontal gravity="center_vertical">
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="添加延时坐标" text="添加延时" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <text id="添加延时1坐标" text="" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="添加延时2坐标" text="100" hint="100" />
                                    <text id="添加延时3坐标" text="毫秒   " />

                                </horizontal>

                                <horizontal gravity="center_vertical">
                                    <spinner h="34dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="sp1" entries="匹配文本|匹配包含文本|匹配描述|匹配包含描述|匹配控件层级|找图|ocr识别(全对)|ocr识别(包含)|匹配范围|在此范围内寻找|控件包含此范围|匹配可点击|匹配长按可点击|匹配启用状态|匹配ID|匹配类名|匹配Activity" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="要找的字" text="结算" hint="提交订单" />
                                </horizontal>
                                <horizontal gravity="center_vertical">
                                    <Spinner h="34dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="sp2" entries="找到后点击控件|找到后点击控件坐标|找到后点以下坐标|无动作|如果存在则执行|附加到下一项" />
                                    <text id="class索引1" text="第几个：" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="class索引" text="1" hint="1" />
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="截图" text="准备截图" style="Widget.AppCompat.Button.Colored" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                                    </card>

                                </horizontal>
                                <horizontal gravity="center_vertical">
                                    <text id="x坐标文本" text="   x=" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="x坐标" text="100" hint="100" />
                                    <text id="y坐标文本" text="y=" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="y坐标" text="100" hint="100" />
                                    <text id="图片相似度1" text="相似度=" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="图片相似度2" text="0.9" hint="0.9 " />
                                    <text id="找图范围1" text=" 找图范围:" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="找图范围2" text="0,0" hint="0,0" />

                                    <text id="点击次数文本" text="点击次数" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="点击次数" text="1" hint="1" />
                                    <text id="间隔时间文本" text="  间隔ms" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="间隔时间ms" text="0" hint="20" />
                                </horizontal>
                                <horizontal gravity="center_vertical">
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="保存找字" text="保存设置" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>

                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="清除设置" text="重新设置" style="Widget.AppCompat.Button.Colored" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                                    </card>
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="取坐标" text="取坐标" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="取找图范围" text="选找图区域" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <checkbox h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="对比找图" text="模式2" />
                                    {}

                                </horizontal>

                                <horizontal gravity="center_vertical">
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="添加其他命令" text="添加" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <spinner h="34dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="其他命令" entries="{{entries}}" />
                                </horizontal>
                                <horizontal gravity="center_vertical">
                                    {}
                                    <text id="其他命令1" text="索引" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="其他命令2" text="1" hint="参数" />
                                    <text id="其他命令3" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="其他命令4" />
                                    <text id="其他命令00" text=" " />
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="悬浮按钮位置" text="选取位置" style="Widget.AppCompat.Button.Colored" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                                    </card>
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="导入js文件" text="导入js文件" style="Widget.AppCompat.Button.Colored" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                                    </card>
                                    {}
                                </horizontal>


                                <horizontal gravity="center_vertical">

                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="新线程" text="添加循环" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <text id="新线程2" text="循环次数" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="新线程1" text="1" hint="1000" />

                                    <text id="切换输入法" text="切换输入法" w="auto" color="#DA70D6" />

                                    {}
                                    {}
                                </horizontal>

                                <horizontal gravity="center_vertical" marginTop="6dp">
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="添加延时" text="添加延时" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                    <text id="添加延时1" text="" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="添加延时2" text="100" hint="1000" />
                                    <text id="添加延时3" text="毫秒   " />
                                    {}
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="清除设置其他" text="重新设置" style="Widget.AppCompat.Button.Colored" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                                    </card>
                                </horizontal>

                                {}
                                <horizontal gravity="center_vertical">
                                    <radiogroup orientation="horizontal">
                                        <radio h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="kjhd" text="滑动控件" />
                                        <radio h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="zbhd" text="多指滑动" />

                                    </radiogroup>
                                </horizontal>

                                <horizontal gravity="center_vertical">
                                    <spinner h="34dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="滑动方式" entries="上滑或左滑|下滑或右滑" />
                                </horizontal>

                                <horizontal gravity="center_vertical">
                                    <text id="滑动索引提示1" text="  第" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="滑动索引" text="1" hint="1" />
                                    <text id="滑动索引提示2" text="个可滑动组件" />
                                </horizontal>


                                <horizontal gravity="center_vertical">

                                    <text id="添加新手指" text="添加新手指" color="#DA70D6" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="多指滑动代码" text="手指1|" hint="手指1|100,100" />


                                    {}

                                </horizontal>



                                <horizontal gravity="center_vertical">
                                    <text id="滑动时间毫秒" text="滑动时长(ms)：" />
                                    <input h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="滑动时间" text="500" hint="1000" />
                                    <checkbox h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="模拟手动轨迹" text="模拟手动轨迹" />
                                </horizontal>

                                <horizontal gravity="center_vertical">
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="保存滑动" text="保存设置" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>

                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="清除设置滑动" text="重新设置" style="Widget.AppCompat.Button.Colored" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                                    </card>
                                    <card w="auto" h="auto" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#F2F2F2">
                                        <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="取坐标滑动" text="取第一个点" bg="#00000000" textColor="#333333" elevation="0dp" />
                                    </card>
                                </horizontal>
                            </vertical>
                            {}



                            <horizontal w="*" h="1sp" margin="0 10 0 10" bg='#E2E2E2'></horizontal>

                            <horizontal gravity="center_vertical">
                                <text text="模式：" marginTop="2" />
                                {}
                                <radiogroup orientation="horizontal">
                                    <radio id="zb" text="坐标" marginTop="-5" checked="true" />
                                    <radio id="zz" text="找字" marginTop="-5" />
                                    <radio id="hd" text="滑动" marginTop="-5" />

                                    <radio id="ys" text="其它" marginTop="-5" />
                                </radiogroup>

                            </horizontal>

                            <horizontal w="*" h="1sp" margin="0 10 0 10" bg='#E2E2E2'></horizontal>

                            {}
                            <horizontal gravity="center_vertical">
                                <text textColor="black" marginTop="-10" text="开始时间：" />
                                <input id="startTime" marginTop="-10" text="0" />

                            </horizontal>
                            <horizontal gravity="center_vertical">
                                <text textColor="black" marginTop="-10" text="提前" />
                                <input id="forwardTime" marginTop="-10" text="200" hint="200" />

                                <text textColor="black" marginTop="-10" text="ms开始执行  " />
                                <checkbox id="执行前校时" marginTop="-10" text="执行前校时" />
                                <checkbox id="隐藏日志" marginTop="-10" text="隐藏日志" />
                                {}
                                {}
                            </horizontal>
                            <horizontal w="*" h="1sp" margin="0 10 0 10" bg='#E2E2E2'></horizontal>
                            <card w="*" h="auto" marginTop="-5" cardCornerRadius="8dp" cardElevation="0dp" cardUseCompatPadding="false" cardBackgroundColor="#a52a2a">
                                <button h="30dp" minHeight="0dp" paddingTop="0" paddingBottom="0" includeFontPadding="false" id="runSrt" w="*" style="Widget.AppCompat.Button.Colored" text="开始运行" textSize="16sp" bg="#00000000" textColor="#FFFFFF" elevation="0dp" />
                            </card>
                            <horizontal w="*" h="1sp" margin="0 10 0 10" bg='#E2E2E2'></horizontal>
                            <horizontal w="*" gravity="center_vertical">
                                <text text="插入到第" textSize="14sp" />
                                <input id="插入行号" text="1" hint="100" w="60" textSize="14sp" />
                                <text text="行后     " textSize="14sp" />

                                <text id="存档1" text="存档" style="Widget.AppCompat.Button.Borderless.Colored"
                                    w="auto" color="#ff5722" textSize="20sp" padding="8 0" />
                                <text id="读档1" text="读档" style="Widget.AppCompat.Button.Borderless.Colored"
                                    w="auto" color="#DA70D6" textSize="20sp" padding="8 0" />
                                <text id="存档2" text="删档" style="Widget.AppCompat.Button.Borderless.Colored"
                                    w="auto" color="#DA70D6" textSize="20sp" padding="8 0" />
                            </horizontal>
                            {}

                            <horizontal w="*" h="1sp" margin="0 -6 0 10" bg='#E2E2E2'></horizontal>
                            <vertical>

                                <scroll id="scrollContainer" layout_weight="1">
                                    <vertical id="listContainer" />
                                </scroll>
                            </vertical>

                            {}
                            <text id="反馈" textSize="16sp" gravity="center" text="有bug或建议点击进入反馈" />
                            <text id="qqq" gravity="center" textColor="red" text="" />
                            <text id="qq" gravity="center" textColor="red" text="此程序是为了研究js而编写的，仅用于技术交流，不得用于非法用途，否则，一切后果请用户自负！不懂先看左上角使用说明。" />


                        </vertical>
                    </ScrollView>
                </frame>

            </viewpager>

        </vertical>

        <vertical layout_gravity="left" bg="#ffffff" w="230">
            <img w="280" h="200" scaleType="fitXY" />
            <list id="menu">
                <horizontal bg="?selectableItemBackground" w="*">
                    <img w="50" h="50" padding="16" src="{{this.icon}}" tint="{{color}}" />
                    <text textColor="black" textSize="15sp" text="{{this.title}}" layout_gravity="center" />
                </horizontal>
            </list>
        </vertical>
    </drawer>));  // L17
storage.put("版本号", bbhv.replace(/\./i, ""));  // L357
ui.networkTest.click(function() {
    校时();  // L359
    return;
});  // L358
var spinner2 = ui.sp2;  // L362
var currentAdapter = null;  // L363
function updateSpinner(items) {
    adapter = new android.widget.ArrayAdapter(context, android.R.layout.simple_spinner_item, items);  // L366
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);  // L371
    spinner2.setAdapter(adapter);  // L372
    var currentAdapter = adapter;  // L373
    return;
}

var items = [{name: "<<>>线程|1|_|"}];  // L379
var selectedIndex = -1;  // L383
var expandedIndex = -1;  // L384
var ROW_HEIGHT = dp2px(38);  // L385
function rebuildList() {
    ui.run(function() {
    container = ui.listContainer;  // L390
    container.removeAllViews();  // L391
    for (i = 0; i < items.length; i++) {
        row = createRow(i, items[i]);  // L393
        container.addView(row);  // L394
    }
    return;
});  // L389
    return;
}

function createRow(index, data) {
    function makeBtn(text, onClick) {
    btn = new android.widget.TextView(context);  // L423
    btn.setText(text);  // L424
    btn.setTextSize(11);  // L425
    btn.setGravity(android.view.Gravity.CENTER);  // L426
    btn.setBackgroundColor(android.graphics.Color.parseColor("#DDDDDD"));  // L427
    btn.setLayoutParams(new android.widget.LinearLayout.LayoutParams(0, -1, 1));  // L428
    btn.setOnClickListener(onClick);  // L429
    return btn;  // L430
    }

    var root = new android.widget.FrameLayout(context);  // L401
    root.setLayoutParams(new android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT, ROW_HEIGHT));  // L402
    root.setBackgroundColor(android.graphics.Color.WHITE);  // L406
    var btnBar = new android.widget.LinearLayout(context);  // L409
    btnBar.setOrientation(android.widget.LinearLayout.HORIZONTAL);  // L410
    btnBar.setGravity(android.view.Gravity.CENTER_VERTICAL);  // L411
    var btnBarWidth = dp2px(180);  // L412
    var btnBarLp = new android.widget.FrameLayout.LayoutParams(btnBarWidth, android.widget.FrameLayout.LayoutParams.MATCH_PARENT);  // L413
    btnBarLp.gravity = android.view.Gravity.RIGHT | android.view.Gravity.CENTER_VERTICAL;  // L417
    btnBar.setLayoutParams(btnBarLp);  // L418
    btnBar.setPadding(0, 0, 0, 0);  // L419
    btnBar.setBackgroundColor(android.graphics.Color.parseColor("#EEEEEE"));  // L420
    btnBar.addView(makeBtn("上移", function() {
    moveItem(index, -1);  // L433
    return;
}));  // L433
    btnBar.addView(makeBtn("下移", function() {
    moveItem(index, 1);  // L434
    return;
}));  // L434
    btnBar.addView(makeBtn("删除", function() {
    deleteItem(index);  // L435
    return;
}));  // L435
    btnBar.addView(makeBtn("修改", function() {
    showEditDialog(index);  // L436
    return;
}));  // L436
    root.addView(btnBar);  // L438
    var contentLayer = new android.widget.LinearLayout(context);  // L441
    contentLayer.setOrientation(android.widget.LinearLayout.HORIZONTAL);  // L442
    contentLayer.setGravity(android.view.Gravity.CENTER_VERTICAL);  // L443
    contentLayer.setPadding(dp2px(8), 0, dp2px(8), 0);  // L444
    contentLayer.setBackgroundColor(android.graphics.Color.WHITE);  // L445
    var contentLp = new android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT, android.widget.FrameLayout.LayoutParams.MATCH_PARENT);  // L446
    contentLayer.setLayoutParams(contentLp);  // L450
    var numTv = new android.widget.TextView(context);  // L453
    numTv.setTextSize(13);  // L454
    numTv.setWidth(dp2px(32));  // L455
    numTv.setGravity(android.view.Gravity.CENTER);  // L456
    numTv.setTextColor(android.graphics.Color.parseColor("#888888"));  // L457
    numTv.setText(String(index + 1));  // L458
    contentLayer.addView(numTv);  // L459
    var nameTv = new android.widget.TextView(context);  // L462
    nameTv.setTextSize(15);  // L463
    nameTv.setTextColor(android.graphics.Color.BLACK);  // L464
    nameTv.setSingleLine(true);  // L465
    nameTv.setEllipsize(android.text.TextUtils.TruncateAt.END);  // L466
    nameTv.setText(data.name);  // L467
    var nameLp = new android.widget.LinearLayout.LayoutParams(0, -2, 1);  // L468
    nameTv.setLayoutParams(nameLp);  // L469
    contentLayer.addView(nameTv);  // L470
    root.addView(contentLayer);  // L472
    root.contentLayer = contentLayer;  // L474
    root.itemIndex = index;  // L475
    var touchStartX = 0;  // L478
    var touchStartY = 0;
    var isSwiping = false;  // L479
    var maxSwipeDistance = btnBarWidth;  // L480
    touchStartX = 0;  // L481
    touchStartY = 0;
    isSwiping = false;  // L482
    maxSwipeDistance = btnBarWidth;  // L483
    var handler = new android.os.Handler();  // L486
    var longPressRunnable = null;  // L487
    var longPressTriggered = false;  // L488
    var LONG_PRESS_TIME = 600;  // L489
    contentLayer.setOnTouchListener(function(view, event) {
    var action = event.getAction();  // L492
    switch (action) {  // L493
        case android.view.MotionEvent.ACTION_DOWN:
            var touchStartX = event.getX();  // L495
            var touchStartY = event.getY();  // L496
            var isSwiping = false;  // L497
            var longPressTriggered = false;  // L498
            if (longPressRunnable != null) {  // L501
                handler.removeCallbacks(longPressRunnable);  // L502
            }
            var longPressRunnable = new java.lang.Runnable({run: function() {
            var longPressTriggered = true;  // L508
            if (expandedIndex !== index) {  // L510
                if (expandedIndex >= 0) {  // L512
                    collapseItem(expandedIndex);  // L513
                }
                contentLayer.animate().translationX(-maxSwipeDistance).setDuration(150).start();  // L519
                var expandedIndex = index;  // L520
            }
            return;
        }});  // L506
            handler.postDelayed(longPressRunnable, LONG_PRESS_TIME);  // L524
            if (expandedIndex >= 0 && expandedIndex !== index) {  // L527
                collapseItem(expandedIndex);  // L528
            }
            return true;  // L530
        case android.view.MotionEvent.ACTION_MOVE:
            if (longPressTriggered) {  // L534
                return true;  // L535
            }
            var dx = event.getX() - touchStartX;  // L537
            var dy = event.getY() - touchStartY;  // L538
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > dp2px(10)) {  // L539
                isSwiping = true;  // L540
                handler.removeCallbacks(longPressRunnable);  // L542
                view.getParent().requestDisallowInterceptTouchEvent(true);  // L543
            }
            if (isSwiping) {  // L545
                var transX = Math.min(0, Math.max(-maxSwipeDistance, dx));  // L546
                contentLayer.setTranslationX(transX);  // L547
                return true;  // L548
            }
            break;
        case android.view.MotionEvent.ACTION_UP:
        case android.view.MotionEvent.ACTION_CANCEL:
            if (longPressRunnable != null) {  // L555
                handler.removeCallbacks(longPressRunnable);  // L556
            }
            if (longPressTriggered) {  // L559
                isSwiping = false;  // L560
                view.getParent().requestDisallowInterceptTouchEvent(false);  // L561
                return true;  // L562
            }
            if (isSwiping) {  // L565
                var finalTransX = contentLayer.getTranslationX();  // L566
                if (finalTransX < -maxSwipeDistance / 2) {  // L567
                    contentLayer.animate().translationX(-maxSwipeDistance).setDuration(150).start();  // L568
                    var expandedIndex = index;  // L569
                } else {
                    contentLayer.animate().translationX(0).setDuration(150).start();  // L571
                    if (expandedIndex === index) {  // L572
                        expandedIndex = -1;
                    }
                }
                isSwiping = false;  // L574
                view.getParent().requestDisallowInterceptTouchEvent(false);  // L575
                return true;  // L576
            } else {
                if (expandedIndex === index) {  // L579
                    collapseItem(index);  // L580
                    return true;  // L581
                }
                return true;  // L583
            }
    }
    return false;  // L587
});  // L491
    return root;  // L590
}

function showEditDialog(index) {
    var item = items[index];  // L595
    threads.start(function() {
    try {  // L597
        var newName = dialogs.rawInput("输入修改内容", item.name);  // L598
        if (newName === null) {  // L599
            return;
        }
        newName = newName.trim();  // L600
        if (newName === "") {  // L601
            toast("内容不能为空");  // L602
            return;  // L603
        }
        ui.run(function() {
        items[index].name = newName;  // L606
        collapseItem(index);  // L607
        rebuildList();  // L608
        toast("修改成功");  // L609
        return;
    });  // L605
    } catch (e) {
        toast("修改出错：" + e.message);  // L612
        console.error(e);  // L613
    }
    return;
});  // L596
    return;
}

function collapseItem(index) {
    container = ui.listContainer;  // L620
    if (index < 0 || index >= container.getChildCount()) {  // L621
        return;
    }
    row = container.getChildAt(index);  // L622
    if (row && row.contentLayer) {  // L623
        row.contentLayer.animate().translationX(0).setDuration(150).start();  // L624
    }
    if (expandedIndex === index) {  // L626
        var expandedIndex = -1;
    }
    return;
}

function moveItem(index, direction) {
    newIndex = index + direction;  // L630
    if (newIndex < 0 || newIndex >= items.length) {  // L631
        toast("无法移动");  // L632
        return;  // L633
    }
    temp = items[index];  // L635
    items[index] = items[newIndex];  // L636
    items[newIndex] = temp;  // L637
    collapseItem(index);  // L638
    collapseItem(newIndex);  // L639
    rebuildList();  // L640
    toast("已移动");  // L641
    return;
}

function deleteItem(index) {
    items.splice(index, 1);  // L645
    collapseItem(index);  // L646
    rebuildList();  // L647
    toast("已删除");  // L648
    return;
}

var 打开软件时间 = new Date().getTime();  // L658
function 增加列表项(新内容, 行号) {
    行号 = parseInt(行号);  // L661
    if (isNaN(行号)) {  // L662
        行号 = items.length + 1;
    }
    if (行号 < 1) {  // L663
        行号 = 1;
    }
    if (行号 > items.length) {  // L664
        items.push({name: 新内容});  // L666
    } else {
        items.splice(行号 - 1, 0, {name: 新内容});  // L669
    }
    if (expandedIndex >= 0) {  // L672
        collapseItem(expandedIndex);  // L673
    }
    rebuildList();  // L675
    if (new Date().getTime() - 打开软件时间 > 1000) {  // L676
        toast("已插入: " + 新内容);  // L677
    }
    return;
}

function dp2px(dp) {
    return Math.round(dp * context.getResources().getDisplayMetrics().density);  // L683
}

function refreshList() {
    rebuildList();  // L687
    var selectedIndex = -1;  // L688
    var expandedIndex = -1;  // L689
    return;
}

ui.post(function() {
    refreshList();  // L694
    return;
}, 300);  // L693
function 清空列表() {
    var items = [];  // L709
    var selectedIndex = -1;  // L710
    var expandedIndex = -1;  // L711
    rebuildList();  // L712
    return;
}

function 初始化列表() {
    var items = [];  // L719
    var selectedIndex = -1;  // L720
    var expandedIndex = -1;  // L721
    rebuildList();  // L722
    return;
}

function 输出所有内容(索引) {
    if (items.length === 0) {  // L731
        return "";  // L733
    }
    if (parseInt(索引) >= items.length) {  // L735
        return "";  // L736
    }
    startIdx = 0;  // L739
    if (索引 !== undefined && 索引 !== null) {  // L740
        parsed = parseInt(索引);  // L741
        if (parsed >= 1 && parsed <= items.length) {  // L742
            startIdx = parsed - 1;  // L743
        } else {
        }
    }
    names = [];  // L748
    for (i = startIdx; i < items.length; i++) {
        names.push(items[i].name);  // L750
    }
    output = names.join("<->");  // L752
    return output;  // L755
}

var bbh = bbhv.replace(/\./i, "");  // L762
var 总代码 = "";  // L763
var 代码头部 = "";
var 测试模式 = 0;
// ===== 对齐原版: 以下变量在原版 v3.0.5 中均为顶层全局 =====
// 缺失全局声明会导致跨函数读写失效(main() 读 e/daske 直接 ReferenceError → 开始运行无反应)
var e = null;  // 子脚本引擎对象, 由 engines.execScript 赋值; main()/停止分支需读取
var daske = false;  // 启动后防抖标记, main() 读取
var 代码尾部 = "";  // a转为代码() 生成, 供代码拼接使用
var 用户全局代码 = "";  // a转为代码() 累积用户全局代码
var 已完成线程数 = 0;  // 子线程计数
var startTime = "";
var forwardTime = 0;
// 以下同为原版顶层全局变量, 我源码此前缺失声明或仅在局部声明, 导致跨函数读写失效
var 悬浮时钟停止 = 0;
var 线程索引 = 0;
var mima = "";
var 悬浮x = 100;
var 悬浮y = 100;
var dengdai = 0;
var 音量加被按下 = false;
var 音量减被按下 = false;
function 校时() {
    var thread = threads.start(function() {
    网络校时();  // L770
    return;
});  // L769
    return;
}

ui["执行前校时"].on("click", function(checked) {
    if (ui["执行前校时"].isChecked()) {  // L779
        storage.put("执行前校时", "1");  // L780
    } else {
        storage.put("执行前校时", "0");  // L782
    }
    return;
});  // L777
ui["隐藏日志"].visibility = 8;  // L787
ui["存档1"].on("click", function() {
    rawInput("请输入您要保存的文件名", "", function(name) {
    if (name != "") {  // L791
        if (files.exists("/sdcard/auscript/" + name + ".txt")) {  // L792
            dialogs.build({title: "文件已存在，是否覆盖？", positive: "覆盖", negative: "取消"}).on("positive", function() {
            var djl = 输出所有内容();  // L805
            files.write("/sdcard/auscript/" + name + ".txt", djl);  // L807
            djl = ui.forwardTime.getText().toString();  // L808
            files.write("/sdcard/auscript/" + name + ".tqsj", djl);  // L809
            if (ui.dx1.isChecked()) {  // L810
                files.write("/sdcard/auscript/" + name + ".sj", "1");  // L811
            }
            if (ui.dx2.isChecked()) {  // L813
                files.write("/sdcard/auscript/" + name + ".sj", "2");  // L814
            }
            if (ui.dx3.isChecked()) {  // L816
                files.write("/sdcard/auscript/" + name + ".sj", "3");  // L817
            }
            if (ui.dx5.isChecked()) {  // L819
                files.write("/sdcard/auscript/" + name + ".sj", "5");  // L820
            }
            toast("已保存");  // L822
            return;
        }).show();  // L823
        } else {
            var djl = 输出所有内容();  // L826
            files.write("/sdcard/auscript/" + name + ".txt", djl);  // L828
            djl = ui.forwardTime.getText().toString();  // L829
            files.write("/sdcard/auscript/" + name + ".tqsj", djl);  // L830
            if (ui.dx1.isChecked()) {  // L831
                files.write("/sdcard/auscript/" + name + ".sj", "1");  // L832
            }
            if (ui.dx2.isChecked()) {  // L834
                files.write("/sdcard/auscript/" + name + ".sj", "2");  // L835
            }
            if (ui.dx3.isChecked()) {  // L837
                files.write("/sdcard/auscript/" + name + ".sj", "3");  // L838
            }
            if (ui.dx5.isChecked()) {  // L840
                files.write("/sdcard/auscript/" + name + ".sj", "5");  // L841
            }
            toast("已保存");  // L843
        }
    } else {
        toast("取消保存");  // L848
    }
    return;
});  // L790
    return;
});  // L788
ui["读档1"].on("click", function() {
    显示脚本文件();  // L854
    return;
});  // L853
ui["存档2"].on("click", function() {
    删除脚本文件();  // L858
    return;
});  // L857
var 是否有截图权限 = false;  // L860
ui["存档2"].visibility = 8;  // L862
ui.zbhd.on("click", function() {
    ui["添加新手指"].visibility = 0;  // L864
    ui["多指滑动代码"].visibility = 0;  // L865
    ui["滑动时间毫秒"].visibility = 0;  // L872
    ui["滑动时间"].visibility = 0;  // L873
    ui["取坐标滑动"].visibility = 0;  // L875
    ui["滑动方式"].visibility = 8;  // L877
    ui["滑动索引"].visibility = 8;  // L878
    ui["滑动索引提示1"].visibility = 8;  // L879
    ui["滑动索引提示2"].visibility = 8;  // L880
    var 滑动模式 = 2;  // L881
    ui["模拟手动轨迹"].visibility = 0;  // L882
    return;
});  // L863
ui["添加新手指"].on("click", function() {
    原代码 = ui["多指滑动代码"].getText().toString();  // L885
    新代码 = 文本取右边(原代码, "手指", -1);  // L887
    arr = 新代码.split(",");  // L889
    if (arr.length > 3) {  // L891
        新代码 = 文本取左边(新代码, "|", 0);  // L892
        临时数值 = 1 + parseInt(新代码);  // L893
        ui["多指滑动代码"].setText(原代码 + "|手指" + 临时数值 + "|");  // L894
    } else {
        toast("至少需要取两个点才能增加新手指");  // L897
    }
    return;
});  // L884
ui.kjhd.on("click", function() {
    ui["添加新手指"].visibility = 8;  // L902
    ui["多指滑动代码"].visibility = 8;  // L903
    ui["滑动时间毫秒"].visibility = 8;  // L910
    ui["滑动时间"].visibility = 8;  // L911
    ui["取坐标滑动"].visibility = 8;  // L912
    ui["模拟手动轨迹"].visibility = 8;  // L913
    ui["滑动方式"].visibility = 0;  // L914
    ui["滑动索引"].visibility = 0;  // L915
    ui["滑动索引提示1"].visibility = 0;  // L916
    ui["滑动索引提示2"].visibility = 0;  // L917
    var 滑动模式 = 1;  // L918
    return;
});  // L901
ui["取坐标滑动"].on("click", function(checked) {
    if (ui["取坐标滑动"].getText().toString() == "取第一个点") {  // L921
        ui["取坐标滑动"].setText("保存并取下一个点坐标");  // L922
        显示按钮啦();  // L923
    } else {
        if (ui["取坐标滑动"].getText() == "保存并取下一个点坐标") {  // L926
            原代码 = ui["多指滑动代码"].getText().toString();  // L927
            if (原代码[(原代码.length - 1)] == "|") {  // L929
                ui["多指滑动代码"].setText(原代码 + Math.round(按钮x).toString() + "," + Math.round(按钮y).toString());  // L930
            } else {
                ui["多指滑动代码"].setText(原代码 + "," + Math.round(按钮x).toString() + "," + Math.round(按钮y).toString());  // L932
            }
        }
    }
    return;
});  // L920
ui["取找图范围"].on("click", function(checked) {
    xzztfw();  // L951
    return;
});  // L949
ui["新线程"].on("click", function(checked) {
    原来的内容 = "其他命令|循环开始|" + ui["新线程1"].getText().toString();  // L958
    a添加代码(ui["插入行号"].getText().toString(), 原来的内容);  // L960
    原来的行数 = ui["插入行号"].getText().toString();  // L961
    a添加代码(ui["插入行号"].getText().toString(), "其他命令|循环结束");  // L962
    ui["插入行号"].setText(原来的行数);  // L963
    return;
});  // L957
ui["添加延时"].on("click", function(checked) {
    原来的内容 = "延时|" + ui["添加延时2"].getText().toString() + "<->";  // L969
    a添加代码(ui["插入行号"].getText().toString(), 原来的内容);  // L971
    return;
});  // L968
ui["随机延迟时间"].on("click", function(checked) {
    原来的内容 = "随机延时|" + ui["随机延迟时间1"].getText().toString() + "|" + ui["随机延迟时间2"].getText().toString() + "<->";  // L974
    a添加代码(ui["插入行号"].getText().toString(), 原来的内容);  // L976
    return;
});  // L973
ui["清除设置"].on("click", function(checked) {
    threads.start(function() {
    confirm = dialogs.confirm("此举会清空您之前设置的所有代码", "确认重置？");  // L983
    if (confirm) {  // L984
        初始化列表();  // L985
    }
    return;
});  // L982
    return;
});  // L980
ui["清除设置滑动"].on("click", function() {
    ui["多指滑动代码"].setText("手指1|");  // L995
    threads.start(function() {
    confirm = dialogs.confirm("此举会清空您之前设置的所有代码，取消则只重置", "确认重置？");  // L997
    if (confirm) {  // L998
        初始化列表();  // L999
    }
    return;
});  // L996
    return;
});  // L994
ui["清除设置其他"].on("click", function(checked) {
    threads.start(function() {
    confirm = dialogs.confirm("此举会清空您之前设置的所有代码", "确认重置？");  // L1006
    if (confirm) {  // L1007
        初始化列表();  // L1008
    }
    return;
});  // L1005
    return;
});  // L1003
ui["取坐标"].on("click", function(checked) {
    if (ui["取坐标"].getText() == "取坐标") {  // L1014
        ui["取坐标"].setText("保存坐标");  // L1015
        显示按钮啦();  // L1016
    } else {
        floaty.closeAll();  // L1019
        ui["取坐标"].setText("取坐标");  // L1022
        ui["x坐标"].setText(Math.round(按钮x).toString());  // L1023
        ui["y坐标"].setText(Math.round(按钮y).toString());  // L1024
    }
    return;
});  // L1013
ui["保存滑动"].on("click", function(checked) {
    原来的内容 = "滑动|";  // L1030
    if (!ui.zbhd.isChecked()) {  // L1031
        i = ui["滑动方式"].getSelectedItemPosition();  // L1032
        if (i == 0) {  // L1033
            var j = "上滑或左滑";
        }
        if (i == 1) {  // L1034
            j = "下滑或右滑";
        }
        原来的内容 = 原来的内容 + "滑动控件|" + j + "|" + ui["滑动索引"].getText().toString() + "<->";  // L1036
    } else {
        原代码 = ui["多指滑动代码"].getText().toString();  // L1038
        新代码 = 文本取右边(原代码, "手指", -1);  // L1040
        arr = 新代码.split(",");  // L1042
        if (arr.length > 3) {  // L1044
        } else {
            toast("一个手指至少需要添加两个点！");  // L1047
            return;  // L1048
        }
        ui["取坐标滑动"].setText("取第一个点");  // L1052
        floaty.closeAll();  // L1053
        if (!ui["模拟手动轨迹"].isChecked()) {  // L1054
            原来的内容 = 原来的内容 + "多指滑动|" + ui["滑动时间"].getText().toString() + "|" + ui["多指滑动代码"].getText().toString();  // L1055
        } else {
            原来的内容 = 原来的内容 + "多指滑动-手动轨迹|" + ui["滑动时间"].getText().toString() + "|" + ui["多指滑动代码"].getText().toString();  // L1057
        }
        ui["多指滑动代码"].setText("手指1|");  // L1059
    }
    a添加代码(ui["插入行号"].getText().toString(), 原来的内容);  // L1062
    return;
});  // L1029
var isFirst = true;  // L1065
var myAdapterListener = new android.widget.AdapterView.OnItemSelectedListener({onItemSelected: function() {
    处理下拉框();  // L1068
    return;
}});  // L1066
function 处理下拉框() {
    var 命令名称 = ui["其他命令"].getSelectedItem();  // L1073
    ui["其他命令1"].visibility = 8;  // L1074
    ui["悬浮按钮位置"].visibility = 8;  // L1075
    ui["导入js文件"].visibility = 8;  // L1076
    ui["其他命令2"].visibility = 8;  // L1077
    ui["其他命令3"].visibility = 8;  // L1078
    ui["其他命令4"].visibility = 8;  // L1079
    if (命令名称 == "选择复选框") {  // L1081
        ui["其他命令1"].visibility = 0;  // L1082
        ui["其他命令2"].visibility = 0;  // L1083
        ui["其他命令1"].setText("索引：");  // L1084
        ui["其他命令2"].setText("0");  // L1085
        var 几个内容 = 1;  // L1086
    } else {
        if (命令名称 == "等待音量+被按下" || 命令名称 == "等待音量-被按下") {  // L1088
            ui["其他命令2"].setText("无需填写参数");  // L1089
            ui["其他命令2"].visibility = 0;  // L1090
            几个内容 = 0;  // L1091
        } else {
            if (命令名称 == "监听系统通知" || 命令名称 == "监听系统通知并进入") {  // L1095
                ui["其他命令1"].visibility = 0;  // L1096
                ui["其他命令2"].visibility = 0;  // L1097
                ui["其他命令1"].setText("监听关键字：");  // L1098
                ui["其他命令2"].setText("红包");  // L1099
                几个内容 = 1;  // L1100
            } else {
                if (命令名称 == "指定输入法输入") {  // L1102
                    ui["其他命令1"].visibility = 0;  // L1103
                    ui["其他命令2"].visibility = 0;  // L1104
                    ui["其他命令1"].setText("输入：");  // L1105
                    ui["其他命令2"].setText("你好");  // L1106
                    几个内容 = 1;  // L1107
                } else {
                    if (命令名称 == "粘贴") {  // L1110
                        ui["其他命令1"].visibility = 0;  // L1111
                        ui["其他命令2"].visibility = 0;  // L1112
                        ui["其他命令1"].setText("如果为空，则直接执行粘贴：");  // L1113
                        ui["其他命令2"].setText("粘贴内容");  // L1114
                        几个内容 = 1;  // L1115
                    } else {
                        if (命令名称 == "置剪辑版文本") {  // L1119
                            ui["其他命令1"].visibility = 0;  // L1120
                            ui["其他命令2"].visibility = 0;  // L1121
                            ui["其他命令1"].setText("文本：");  // L1122
                            ui["其他命令2"].setText("文本");  // L1123
                            几个内容 = 1;  // L1124
                        } else {
                            if (命令名称 == "打开链接") {  // L1126
                                ui["其他命令1"].visibility = 0;  // L1127
                                ui["其他命令2"].visibility = 0;  // L1128
                                ui["其他命令1"].setText("链接：");  // L1130
                                ui["其他命令2"].setText(" ");  // L1131
                                几个内容 = 1;  // L1132
                            } else {
                                if (命令名称 == "用京东app打开链接" || 命令名称 == "用淘宝app打开链接") {  // L1134
                                    ui["其他命令1"].visibility = 0;  // L1135
                                    ui["其他命令2"].visibility = 0;  // L1136
                                    ui["其他命令1"].setText("地址：");  // L1137
                                    ui["其他命令2"].setText("输入链接");  // L1138
                                    几个内容 = 1;  // L1139
                                } else {
                                    if (命令名称 == "打开app") {  // L1141
                                        ui["其他命令1"].visibility = 0;  // L1142
                                        ui["其他命令2"].visibility = 0;  // L1143
                                        ui["其他命令1"].setText("包名：");  // L1144
                                        ui["其他命令2"].setText("0");  // L1145
                                        几个内容 = 1;  // L1146
                                    } else {
                                        if (命令名称 == "输入") {  // L1148
                                            ui["其他命令1"].visibility = 0;  // L1149
                                            ui["其他命令2"].visibility = 0;  // L1150
                                            ui["其他命令3"].visibility = 0;  // L1151
                                            ui["其他命令4"].visibility = 0;  // L1152
                                            ui["其他命令1"].setText("索引：");  // L1153
                                            ui["其他命令2"].setText("0");  // L1154
                                            ui["其他命令3"].setText("内容：");  // L1155
                                            ui["其他命令4"].setText("你好");  // L1156
                                            几个内容 = 2;  // L1157
                                        } else {
                                            if (命令名称 == "打开Activity") {  // L1159
                                                ui["其他命令1"].visibility = 0;  // L1160
                                                ui["其他命令2"].visibility = 0;  // L1161
                                                ui["其他命令3"].visibility = 0;  // L1162
                                                ui["其他命令4"].visibility = 0;  // L1163
                                                ui["其他命令1"].setText("包名：");  // L1164
                                                ui["其他命令2"].setText("0");  // L1165
                                                ui["其他命令3"].setText("目标Activity：");  // L1166
                                                ui["其他命令4"].setText("0");  // L1167
                                                几个内容 = 2;  // L1168
                                            } else {
                                                if (命令名称 == "添加悬浮按钮并等待被按下") {  // L1170
                                                    ui["其他命令1"].visibility = 0;  // L1171
                                                    ui["其他命令2"].visibility = 0;  // L1172
                                                    ui["其他命令3"].visibility = 0;  // L1173
                                                    ui["其他命令4"].visibility = 0;  // L1174
                                                    ui["其他命令1"].setText("名称：");  // L1175
                                                    ui["其他命令2"].setText("悬浮按钮" + 悬浮按钮编号);  // L1176
                                                    ui["其他命令3"].setText("  位置：");  // L1177
                                                    ui["其他命令4"].setText(按钮x + "|" + 按钮y);  // L1178
                                                    几个内容 = 2;  // L1179
                                                    ui["悬浮按钮位置"].visibility = 0;  // L1180
                                                    var xsnr = "悬浮按钮" + 悬浮按钮编号;  // L1181
                                                } else {
                                                    if (命令名称 == "导入js文件") {  // L1183
                                                        ui["其他命令1"].visibility = 0;  // L1184
                                                        ui["其他命令2"].visibility = 0;  // L1185
                                                        ui["其他命令1"].setText("文件地址：");  // L1186
                                                        ui["其他命令2"].setText(" ");  // L1187
                                                        ui["导入js文件"].visibility = 0;  // L1188
                                                        几个内容 = 1;  // L1189
                                                    } else {
                                                        if (命令名称 == "设置全局变量") {  // L1191
                                                            ui["其他命令1"].visibility = 0;  // L1192
                                                            ui["其他命令2"].visibility = 0;  // L1193
                                                            ui["其他命令1"].setText("代码：");  // L1194
                                                            ui["其他命令2"].setText(" ");  // L1195
                                                            几个内容 = 1;  // L1197
                                                        } else {
                                                            if (命令名称 == "执行js代码") {  // L1199
                                                                ui["其他命令1"].visibility = 0;  // L1200
                                                                ui["其他命令2"].visibility = 0;  // L1201
                                                                ui["其他命令1"].setText("代码：");  // L1202
                                                                ui["其他命令2"].setText(" ");  // L1203
                                                                几个内容 = 1;  // L1205
                                                            } else {
                                                                if (命令名称 == "设置找字app") {  // L1207
                                                                    ui["其他命令1"].visibility = 0;  // L1208
                                                                    ui["其他命令2"].visibility = 0;  // L1209
                                                                    ui["其他命令1"].setText("指定app：");  // L1210
                                                                    ui["其他命令2"].setText("所有");  // L1211
                                                                    几个内容 = 1;  // L1212
                                                                } else {
                                                                    if (命令名称 == "循环开始") {  // L1215
                                                                        ui["其他命令1"].visibility = 0;  // L1216
                                                                        ui["其他命令2"].visibility = 0;  // L1217
                                                                        ui["其他命令1"].setText("需循环次数：");  // L1218
                                                                        ui["其他命令2"].setText("2");  // L1219
                                                                        几个内容 = 0;  // L1220
                                                                    } else {
                                                                        if (命令名称 == "跳出循环") {  // L1223
                                                                            ui["其他命令1"].visibility = 0;  // L1224
                                                                            ui["其他命令2"].visibility = 0;  // L1225
                                                                            ui["其他命令1"].setText("可添加跳出次数");  // L1226
                                                                            ui["其他命令2"].setText("");  // L1227
                                                                            几个内容 = 0;  // L1228
                                                                        } else {
                                                                            if (命令名称 == "循环结束") {  // L1232
                                                                                ui["其他命令1"].visibility = 0;  // L1233
                                                                                ui["其他命令2"].visibility = 0;  // L1234
                                                                                ui["其他命令1"].setText("可结束的次数");  // L1235
                                                                                ui["其他命令2"].setText("");  // L1236
                                                                                几个内容 = 0;  // L1237
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return;
}

var 悬浮按钮编号 = 1;  // L1240
var xsnr = "悬浮按钮";
var 添加循环次数 = 0;
ui["其他命令"].setOnItemSelectedListener(myAdapterListener);  // L1242
var 几个内容 = 1;  // L1243
var mysp1 = new android.widget.AdapterView.OnItemSelectedListener({onItemSelected: function() {
    处理sp1下拉框();  // L1247
    处理找字下拉框();  // L1248
    return;
}});  // L1245
function 处理sp1下拉框() {
    var 命令名称sp1 = ui.sp1.getSelectedItem();  // L1252
    ui["class索引1"].visibility = 8;  // L1253
    ui["class索引"].visibility = 8;  // L1254
    ui["截图"].visibility = 8;  // L1255
    ui["图片相似度1"].visibility = 8;  // L1256
    ui["图片相似度2"].visibility = 8;  // L1257
    ui["对比找图"].visibility = 8;  // L1258
    ui["找图范围1"].visibility = 8;  // L1259
    ui["找图范围2"].visibility = 8;  // L1260
    ui["取找图范围"].visibility = 8;  // L1261
    if (命令名称sp1 == "找图") {  // L1265
        ui["class索引1"].visibility = 8;  // L1266
        ui["class索引"].visibility = 8;  // L1267
        ui["截图"].visibility = 0;  // L1268
        ui["图片相似度1"].visibility = 0;  // L1269
        ui["图片相似度2"].visibility = 0;  // L1270
        ui["对比找图"].visibility = 0;  // L1271
        ui["x坐标"].visibility = 8;  // L1272
        ui["找图范围1"].visibility = 0;  // L1273
        ui["找图范围2"].visibility = 0;  // L1274
        ui["取找图范围"].visibility = 0;  // L1275
        ui.run(function() {
        ui["找图范围1"].setText("找图范围：");  // L1277
        ui["取找图范围"].setText("选找图区域");  // L1278
        ui["找图范围2"].setText("0,0," + device.width + "," + device.height);  // L1279
        return;
    });  // L1276
        updateSpinner(["找到后点击控件坐标", "找到后点以下坐标", "无动作", "如果存在则执行"]);  // L1281
    } else {
        if (命令名称sp1 == "ocr识别(全对)") {  // L1282
            ui["找图范围1"].visibility = 0;  // L1285
            ui["找图范围2"].visibility = 0;  // L1286
            ui["取找图范围"].visibility = 0;  // L1287
            ui["class索引1"].visibility = 8;  // L1289
            ui["class索引"].visibility = 8;  // L1290
            ui["x坐标"].visibility = 8;  // L1291
            ui.run(function() {
            ui["找图范围1"].setText("识别范围：");  // L1293
            ui["取找图范围"].setText("取识别区域");  // L1294
            ui["找图范围2"].setText("0,0," + device.width + "," + device.height);  // L1295
            return;
        });  // L1292
            updateSpinner(["找到后点击控件坐标", "找到后点以下坐标", "无动作", "如果存在则执行"]);  // L1297
        } else {
            if (命令名称sp1 == "ocr识别(包含)") {  // L1298
                ui["找图范围1"].visibility = 0;  // L1299
                ui["找图范围2"].visibility = 0;  // L1300
                ui["取找图范围"].visibility = 0;  // L1301
                ui["class索引1"].visibility = 8;  // L1302
                ui["class索引"].visibility = 8;  // L1303
                ui["x坐标"].visibility = 8;  // L1304
                ui.run(function() {
                ui["找图范围1"].setText("识别范围：");  // L1306
                ui["取找图范围"].setText("取识别区域");  // L1307
                ui["找图范围2"].setText("0,0," + device.width + "," + device.height);  // L1308
                return;
            });  // L1305
                updateSpinner(["找到后点击控件坐标", "找到后点以下坐标", "无动作", "如果存在则执行"]);  // L1310
            } else {
                if (命令名称sp1 == "控件包含此范围" || 命令名称sp1 == "匹配范围") {  // L1311
                    updateSpinner(["找到后点击控件", "找到后点击控件坐标", "找到后点以下坐标", "无动作", "如果存在则执行", "附加到下一项"]);  // L1312
                } else {
                    if (命令名称sp1 == "匹配Activity") {  // L1327
                        updateSpinner(["无动作", "如果存在则执行"]);  // L1328
                    } else {
                        updateSpinner(["找到后点击控件", "找到后点击控件坐标", "找到后点以下坐标", "无动作", "如果存在则执行", "附加到下一项"]);  // L1331
                    }
                }
            }
        }
    }
    return;
}

ui.run(function() {
    ui["找图范围2"].setText("0,0," + device.width + "," + device.height);  // L1343
    return;
});  // L1342
ui.sp1.setOnItemSelectedListener(mysp1);  // L1345
var myTextWatcher = new TextWatcher({onTextChanged: function(CharSequence) {
    if (ui.sp1.getSelectedItem() == "找图") {  // L1349
        if (files.exists("/sdcard/auscript/" + CharSequence + ".xy")) {  // L1350
            ui["找图范围2"].setText(files.read("/sdcard/auscript/" + CharSequence + ".xy"));  // L1351
        } else {
            ui["找图范围2"].setText(全屏找图值);  // L1353
        }
    }
    return;
}});  // L1347
var 全屏找图值 = "0,0," + device.width + "," + device.height;  // L1358
ui["要找的字"].addTextChangedListener(myTextWatcher);  // L1359
ui["添加其他命令"].on("click", function() {
    if (几个内容 == 0) {  // L1364
        if (ui["其他命令"].getSelectedItem() == "跳出循环") {  // L1365
            开始序号 = parseInt(ui["插入行号"].getText().toString());  // L1367
            后面代码 = 输出所有内容(开始序号);  // L1369
            if (后面代码.lastIndexOf("循环结束") == -1) {  // L1372
                toast("错误！当前位置不是在循环内");  // L1373
                return;  // L1374
            }
            原来的内容 = "其他命令|" + ui["其他命令"].getSelectedItem() + "<->";  // L1379
        } else {
            if (ui["其他命令"].getSelectedItem() == "循环结束") {  // L1386
                原来的内容 = "其他命令|" + ui["其他命令"].getSelectedItem() + "<->";  // L1388
            } else {
                if (ui["其他命令"].getSelectedItem() == "添加新主线程") {  // L1395
                    原来的内容 = "<<>>线程|1|_|";  // L1397
                } else {
                    if (ui["其他命令"].getSelectedItem() == "添加新子线程") {  // L1399
                        原来的内容 = "创建子线程|1|<->";  // L1400
                    } else {
                        原来的内容 = "其他命令|" + ui["其他命令"].getSelectedItem() + "<->";  // L1405
                    }
                }
            }
        }
    }
    if (几个内容 == 1) {  // L1410
        原来的内容 = 输出所有内容();  // L1414
        if (原来的内容.lastIndexOf("设置找字app|") > -1) {  // L1416
            toast("此命令只能存在一个，若需要设置多个请用,隔开。例如 淘宝,京东");  // L1417
            return;  // L1418
        }
        if (原来的内容.lastIndexOf("指定输入法输入") > -1) {  // L1420
            检测输入法();  // L1422
        }
        原来的内容 = "其他命令|" + ui["其他命令"].getSelectedItem() + "|" + ui["其他命令2"].getText().toString() + "<->";  // L1425
    }
    if (几个内容 == 2) {  // L1427
        if (ui["其他命令"].getSelectedItem() == "添加悬浮按钮并等待被按下") {  // L1429
            原来的内容 = 输出所有内容();  // L1430
            j = 原来的内容.lastIndexOf("添加悬浮按钮并等待被按下|" + ui["其他命令2"].getText().toString() + "|");  // L1431
            if (j > 3) {  // L1432
                toast("悬浮按钮不能同名！");  // L1433
                return;  // L1434
            }
            var 悬浮按钮编号 = 悬浮按钮编号 + 1;  // L1436
            原来的内容 = "其他命令|" + ui["其他命令"].getSelectedItem() + "|" + ui["其他命令2"].getText().toString() + "|" + ui["其他命令4"].getText().toString() + "<->";  // L1437
            ui["其他命令2"].setText("悬浮按钮" + 悬浮按钮编号);  // L1438
        } else {
            原来的内容 = "其他命令|" + ui["其他命令"].getSelectedItem() + "|" + ui["其他命令2"].getText().toString() + "|" + ui["其他命令4"].getText().toString() + "<->";  // L1440
        }
    }
    a添加代码(ui["插入行号"].getText().toString(), 原来的内容);  // L1445
    if (ui["其他命令"].getSelectedItem() == "添加新子线程") {  // L1446
        原来行号 = ui["插入行号"].getText().toString();  // L1447
        a添加代码(ui["插入行号"].getText().toString(), "子线程结束");  // L1449
        ui["插入行号"].setText(原来行号);  // L1450
    }
    return;
});  // L1363
var 可添加否则次数 = 0;  // L1455
var 可添加结束次数 = 0;
function 是否为整数(str) {
    if (typeof  str !== "string") {  // L1457
        return false;
    }
    str = str.trim();  // L1459
    if (str === "") {  // L1460
        return false;
    }
    return /^-?\d+$/.test(str);  // L1462
}

ui["保存找字"].on("click", function(checked) {
    if (checked) {  // L1465
        i = ui.sp1.getSelectedItem();  // L1468
        j = ui.sp2.getSelectedItem();  // L1469
        原来的内容 = "找字点击|";  // L1471
        要找的词 = ui["要找的字"].getText().toString().replace(/\|/i, "%7C");  // L1472
        if (i == "匹配长按可点击" || i == "匹配启用状态") {  // L1473
            if (要找的词 == "false" || 要找的词 == "true") {  // L1474
            } else {
                toast("必须为true或false");  // L1477
                return;  // L1478
            }
        }
        if (i == "匹配控件层级") {  // L1481
            if (是否为整数(要找的词) == false) {  // L1482
                toast("控件层级必须是整数");  // L1484
                return;  // L1485
            }
        }
        if (i == "控件包含此范围" || i == "在此范围内寻找") {  // L1489
            content = storage.get("a到期时间");  // L1490
            if (parseInt(content) < new Date().getTime() - wlsjc || isEmpty(content)) {  // L1491
                alert("这个为新增功能", "需要先在左上角里面激活此功能哦");  // L1494
                return;  // L1496
            }
            要找的词 = 要找的词.replace(/，/i, ",");  // L1498
            要找的词 = 要找的词.replace("→", ",");  // L1499
            arr = 要找的词.split(",");  // L1500
            if (arr.length != 4) {  // L1501
                toast("范围格式错误，必须为数值，格式为x1,y1,x2,y2");  // L1502
                return;  // L1503
            }
        }
        if (i == "找className") {  // L1507
            if (j == "找到后点以下坐标") {  // L1508
                原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["class索引"].getText().toString() + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + +ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1511
            } else {
                原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["class索引"].getText().toString() + "|";  // L1516
            }
        } else {
            if (i == "匹配类名") {  // L1519
                if (j == "找到后点以下坐标") {  // L1520
                    原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["class索引"].getText().toString() + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + +ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1521
                } else {
                    原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["class索引"].getText().toString() + "|";  // L1524
                }
            } else {
                if (i == "找图") {  // L1586
                    if (ui.sp2.getSelectedItemPosition() == 2) {  // L1587
                        if (ui["对比找图"].isChecked()) {  // L1589
                            原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["图片相似度2"].getText().toString() + "|2" + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + "|" + ui["找图范围2"].getText().toString() + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1590
                        } else {
                            原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["图片相似度2"].getText().toString() + "|1" + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + "|" + ui["找图范围2"].getText().toString() + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1592
                        }
                    } else {
                        if (ui["对比找图"].isChecked()) {  // L1595
                            原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["图片相似度2"].getText().toString() + "|2" + "|" + ui["找图范围2"].getText().toString() + "|";  // L1596
                        } else {
                            原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["图片相似度2"].getText().toString() + "|1" + "|" + ui["找图范围2"].getText().toString() + "|";  // L1598
                        }
                    }
                    files.write("/sdcard/auscript/" + 要找的词 + ".xy", ui["找图范围2"].getText().toString());  // L1602
                } else {
                    if (i == "ocr识别(全对)") {  // L1604
                        if (ui.sp2.getSelectedItemPosition() == 2) {  // L1605
                            原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["找图范围2"].getText().toString() + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + "|" + ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1607
                        } else {
                            原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["找图范围2"].getText().toString() + "|";  // L1609
                        }
                    } else {
                        if (i == "ocr识别(包含)") {  // L1613
                            if (ui.sp2.getSelectedItemPosition() == 2) {  // L1614
                                原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["找图范围2"].getText().toString() + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + "|" + ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1616
                            } else {
                                原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["找图范围2"].getText().toString() + "|";  // L1618
                            }
                        } else {
                            if (i == "找范围内可点击控件") {  // L1621
                                if (parseInt(要找的词) > 1) {  // L1623
                                } else {
                                    要找的词 = "1";  // L1626
                                }
                                if (ui.sp2.getSelectedItemPosition() == 2) {  // L1628
                                    原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["找图范围2"].getText().toString() + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + "|" + ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1629
                                } else {
                                    原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["找图范围2"].getText().toString() + "|";  // L1631
                                }
                            } else {
                                if (j == "找到后点以下坐标") {  // L1637
                                    原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|" + ui["x坐标"].getText().toString() + "|" + ui["y坐标"].getText().toString() + "|" + ui["点击次数"].getText().toString() + "|" + ui["间隔时间ms"].getText().toString() + "|";  // L1639
                                } else {
                                    原来的内容 = 原来的内容 + i + "|" + 要找的词 + "|" + j + "|";  // L1642
                                }
                            }
                        }
                    }
                }
            }
        }
        if (j == "如果存在则执行") {  // L1646
            原来的内容 = 原来的内容 + ui["x坐标"].getText().toString() + "<->";  // L1647
        } else {
            原来的内容 = 原来的内容 + "<->";  // L1649
        }
        a添加代码(ui["插入行号"].getText().toString(), 原来的内容);  // L1652
        if (j == "如果存在则执行") {  // L1653
            原来的行数 = ui["插入行号"].getText().toString();  // L1654
            a添加代码(ui["插入行号"].getText().toString(), "否则执行|<->");  // L1655
            a添加代码(ui["插入行号"].getText().toString(), "结束判断|<->");  // L1656
            ui["插入行号"].setText(原来的行数);  // L1657
        }
    }
    return;
});  // L1464
ui.zz.on("check", function(checked) {
    if (checked) {  // L1668
        全部隐藏();  // L1669
        ui.sp1.visibility = 0;  // L1671
        ui["要找的字"].visibility = 0;  // L1672
        ui.sp2.visibility = 0;  // L1673
        ui["x坐标文本"].visibility = 0;  // L1674
        ui["x坐标"].visibility = 0;  // L1675
        ui["y坐标文本"].visibility = 0;  // L1676
        ui["y坐标"].visibility = 0;  // L1677
        ui["保存找字"].visibility = 0;  // L1678
        ui["点击次数"].visibility = 0;  // L1680
        ui["间隔时间文本"].visibility = 0;  // L1681
        ui["间隔时间ms"].visibility = 0;  // L1682
        ui["点击次数文本"].visibility = 0;  // L1683
        ui["清除设置"].visibility = 0;  // L1684
        ui["取坐标"].visibility = 0;  // L1685
        处理sp1下拉框();  // L1687
        处理找字下拉框();  // L1688
    }
    return;
});  // L1667
myAdapterListener = new android.widget.AdapterView.OnItemSelectedListener({onItemSelected: function() {
    处理找字下拉框();  // L1700
    return;
}});  // L1698
ui.sp2.setOnItemSelectedListener(myAdapterListener);  // L1703
function 处理找字下拉框() {
    找字命令名称 = ui.sp2.getSelectedItem();  // L1705
    ui["x坐标文本"].visibility = 0;  // L1707
    ui["x坐标"].visibility = 0;  // L1708
    ui["y坐标文本"].visibility = 0;  // L1709
    ui["y坐标"].visibility = 0;  // L1710
    ui["取坐标"].visibility = 8;  // L1711
    ui["点击次数"].visibility = 8;  // L1713
    ui["间隔时间文本"].visibility = 8;  // L1714
    ui["间隔时间ms"].visibility = 8;  // L1715
    ui["点击次数文本"].visibility = 8;  // L1716
    上个下拉框的命令名称 = ui.sp1.getSelectedItem();  // L1717
    if (上个下拉框的命令名称 == "ocr识别(全对)" || 上个下拉框的命令名称 == "ocr识别(包含)") {  // L1718
        ui["x坐标"].visibility = 8;  // L1719
        ui["找图范围1"].visibility = 0;  // L1720
        ui["找图范围2"].visibility = 0;  // L1721
        ui["取找图范围"].visibility = 0;  // L1722
    }
    if (找字命令名称 == "找到后点击控件") {  // L1726
        ui["x坐标文本"].visibility = 8;  // L1727
        ui["y坐标文本"].visibility = 8;  // L1728
        ui["y坐标"].visibility = 8;  // L1729
        ui["x坐标"].setText("只有控件可点击为true是有用");  // L1730
        if (ui.sp1.getSelectedItem() == "找图") {  // L1731
            ui["x坐标"].visibility = 8;  // L1732
            ui["找图范围1"].visibility = 0;  // L1733
            ui["找图范围2"].visibility = 0;  // L1734
            ui["对比找图"].visibility = 0;  // L1735
            ui["取找图范围"].visibility = 0;  // L1736
        }
    } else {
        if (找字命令名称 == "找到后点击控件坐标") {  // L1740
            ui["x坐标文本"].visibility = 8;  // L1741
            ui["y坐标文本"].visibility = 8;  // L1742
            ui["y坐标"].visibility = 8;  // L1743
            ui["x坐标"].setText("需点击的位置不能被遮挡");  // L1744
            if (ui.sp1.getSelectedItem() == "找图") {  // L1745
                ui["x坐标"].visibility = 8;  // L1746
                ui["找图范围1"].visibility = 0;  // L1747
                ui["找图范围2"].visibility = 0;  // L1748
                ui["对比找图"].visibility = 0;  // L1749
                ui["取找图范围"].visibility = 0;  // L1750
            }
        } else {
            if (找字命令名称 == "找到后点以下坐标") {  // L1757
                ui["x坐标文本"].setText("x=");  // L1758
                ui["x坐标"].setText("100");  // L1759
                ui["y坐标"].setText("100");  // L1760
                ui["取坐标"].visibility = 0;  // L1761
                if (ui.sp1.getSelectedItem() == "找图") {  // L1762
                    ui["找图范围1"].visibility = 8;  // L1763
                    ui["找图范围2"].visibility = 8;  // L1764
                    ui["对比找图"].visibility = 8;  // L1765
                }
                if (ui.sp1.getSelectedItem() == "ocr识别(全对)" || ui.sp1.getSelectedItem() == "找范围内可点击控件") {  // L1767
                    ui["找图范围1"].visibility = 8;  // L1768
                    ui["找图范围2"].visibility = 8;  // L1769
                    ui["对比找图"].visibility = 8;  // L1770
                    ui["x坐标"].visibility = 0;  // L1772
                }
                if (ui.sp1.getSelectedItem() == "ocr识别(包含)") {  // L1776
                    ui["找图范围1"].visibility = 8;  // L1777
                    ui["找图范围2"].visibility = 8;  // L1778
                    ui["对比找图"].visibility = 8;  // L1779
                    ui["x坐标"].visibility = 0;  // L1780
                }
                ui["点击次数"].visibility = 0;  // L1782
                ui["间隔时间文本"].visibility = 0;  // L1783
                ui["间隔时间ms"].visibility = 0;  // L1784
                ui["点击次数文本"].visibility = 0;  // L1785
            } else {
                if (找字命令名称 == "如果存在则执行") {  // L1787
                    ui["x坐标文本"].setText("最大寻找时间(毫秒)：");  // L1788
                    ui["x坐标"].setText("1000");  // L1789
                    ui["y坐标文本"].visibility = 8;  // L1790
                    ui["y坐标"].visibility = 8;  // L1791
                    if (ui.sp1.getSelectedItem() == "找图") {  // L1792
                        ui["找图范围1"].visibility = 8;  // L1793
                        ui["找图范围2"].visibility = 8;  // L1794
                        ui["取找图范围"].visibility = 8;  // L1795
                        ui["对比找图"].visibility = 8;  // L1796
                    }
                    if (ui.sp1.getSelectedItem() == "ocr识别(全对)" || ui.sp1.getSelectedItem() == "找范围内可点击控件") {  // L1798
                        ui["找图范围1"].visibility = 8;  // L1799
                        ui["找图范围2"].visibility = 8;  // L1800
                        ui["取找图范围"].visibility = 8;  // L1801
                        ui["对比找图"].visibility = 8;  // L1802
                        ui["x坐标"].visibility = 0;  // L1803
                    }
                    if (ui.sp1.getSelectedItem() == "ocr识别(包含)") {  // L1805
                        ui["找图范围1"].visibility = 8;  // L1806
                        ui["找图范围2"].visibility = 8;  // L1807
                        ui["取找图范围"].visibility = 8;  // L1808
                        ui["对比找图"].visibility = 8;  // L1809
                        ui["x坐标"].visibility = 0;  // L1810
                    }
                } else {
                    if (找字命令名称 == "附加到下一项") {  // L1813
                        ui["x坐标文本"].visibility = 8;  // L1814
                        ui["y坐标文本"].visibility = 8;  // L1815
                        ui["y坐标"].visibility = 8;  // L1816
                        ui["x坐标"].setText("不适应于找图，ocr和Activity");  // L1817
                        content = storage.get("a到期时间");  // L1818
                    } else {
                        ui["x坐标文本"].visibility = 8;  // L1827
                        ui["y坐标文本"].visibility = 8;  // L1828
                        ui["y坐标"].visibility = 8;  // L1829
                        ui["x坐标"].setText("执行下一步骤");  // L1830
                        if (ui.sp1.getSelectedItem() == "找图") {  // L1831
                            ui["x坐标"].visibility = 8;  // L1832
                            ui["找图范围1"].visibility = 0;  // L1833
                            ui["找图范围2"].visibility = 0;  // L1834
                            ui["取找图范围"].visibility = 0;  // L1835
                            ui["对比找图"].visibility = 0;  // L1836
                        }
                    }
                }
            }
        }
    }
    if (上个下拉框的命令名称 == "控件包含此范围" || 上个下拉框的命令名称 == "在此范围内寻找") {  // L1840
        ui["x坐标"].visibility = 0;  // L1841
        ui["取找图范围"].visibility = 0;  // L1842
        ui["取找图范围"].setText("选取范围");  // L1843
        ui["x坐标"].setText("可以用分析布局工具取范围");  // L1844
    }
    return;
}

ui.zb.on("check", function(checked) {
    if (checked) {  // L1851
        全部隐藏();  // L1852
        ui["随机偏移选择框"].visibility = 0;  // L1853
        ui["随机偏移值"].visibility = 0;  // L1854
        ui["随机偏移值文本"].visibility = 0;  // L1855
        ui["像素文本"].visibility = 0;  // L1856
        ui["点击时长"].visibility = 0;  // L1857
        ui["毫秒文本"].visibility = 0;  // L1858
        ui["次数"].visibility = 0;  // L1859
        ui["这个点点击"].visibility = 0;  // L1860
        ui["每次等待"].visibility = 0;  // L1861
        ui["时间间隔"].visibility = 0;  // L1862
        ui["毫秒后再执行"].visibility = 0;  // L1863
        ui["添加"].visibility = 0;  // L1864
        ui["空1"].visibility = 0;  // L1865
        ui["清除"].visibility = 0;  // L1866
        ui["随机延迟时间"].visibility = 0;  // L1867
        ui["随机延迟时间1"].visibility = 0;  // L1868
        ui["随机延迟时间2"].visibility = 0;  // L1869
        ui["随机延迟时间11"].visibility = 0;  // L1870
        ui["随机延迟时间22"].visibility = 0;  // L1871
    }
    return;
});  // L1850
var 滑动模式 = 1;  // L1882
ui.hd.on("check", function(checked) {
    if (checked) {  // L1884
        全部隐藏();  // L1885
        ui["模拟手动轨迹"].visibility = 8;  // L1886
        ui["保存滑动"].visibility = 0;  // L1887
        ui["取坐标滑动"].visibility = 0;  // L1888
        ui["清除设置滑动"].visibility = 0;  // L1889
        ui.zbhd.visibility = 0;  // L1890
        ui.kjhd.visibility = 0;  // L1891
        if (!ui.zbhd.isChecked()) {  // L1892
            ui.kjhd.setChecked(true);  // L1893
            ui["取坐标滑动"].visibility = 8;  // L1894
            ui["滑动方式"].visibility = 0;  // L1895
            ui["滑动索引"].visibility = 0;  // L1896
            ui["滑动索引提示1"].visibility = 0;  // L1897
            ui["滑动索引提示2"].visibility = 0;  // L1898
        } else {
            ui["添加新手指"].visibility = 0;  // L1902
            ui["多指滑动代码"].visibility = 0;  // L1903
            ui["滑动时间毫秒"].visibility = 0;  // L1910
            ui["滑动时间"].visibility = 0;  // L1911
            ui["模拟手动轨迹"].visibility = 0;  // L1912
        }
    }
    return;
});  // L1883
ui.ys.on("check", function(checked) {
    if (checked) {  // L1919
        全部隐藏();  // L1920
        ui["清除设置其他"].visibility = 0;  // L1921
        ui["添加延时"].visibility = 0;  // L1922
        ui["添加延时1"].visibility = 0;  // L1923
        ui["添加延时2"].visibility = 0;  // L1924
        ui["添加延时3"].visibility = 0;  // L1925
        ui["新线程"].visibility = 0;  // L1926
        ui["新线程1"].visibility = 0;  // L1927
        ui["新线程2"].visibility = 0;  // L1928
        ui["切换输入法"].visibility = 0;  // L1929
        ui["添加其他命令"].visibility = 0;  // L1938
        ui["其他命令"].visibility = 0;  // L1939
        ui["其他命令1"].visibility = 0;  // L1940
        ui["其他命令2"].visibility = 0;  // L1941
        ui["其他命令3"].visibility = 0;  // L1942
        ui["其他命令4"].visibility = 0;  // L1943
        ui["其他命令00"].visibility = 0;  // L1944
        处理下拉框();  // L1945
    }
    return;
});  // L1918
全部隐藏();  // L1948
ui["随机偏移选择框"].visibility = 0;  // L1950
ui["随机偏移值"].visibility = 0;  // L1951
ui["随机偏移值文本"].visibility = 0;  // L1952
ui["像素文本"].visibility = 0;  // L1953
ui["点击时长"].visibility = 0;  // L1954
ui["毫秒文本"].visibility = 0;  // L1955
ui["次数"].visibility = 0;  // L1956
ui["这个点点击"].visibility = 0;  // L1957
ui["每次等待"].visibility = 0;  // L1958
ui["时间间隔"].visibility = 0;  // L1959
ui["毫秒后再执行"].visibility = 0;  // L1960
ui["添加"].visibility = 0;  // L1961
ui["空1"].visibility = 0;  // L1962
ui["清除"].visibility = 0;  // L1963
ui["随机延迟时间"].visibility = 0;  // L1964
ui["随机延迟时间1"].visibility = 0;  // L1965
ui["随机延迟时间2"].visibility = 0;  // L1966
ui["随机延迟时间11"].visibility = 0;  // L1967
ui["随机延迟时间22"].visibility = 0;  // L1968
function 全部隐藏() {
    ui["添加延时坐标"].visibility = 8;  // L1976
    ui["添加延时1坐标"].visibility = 8;  // L1977
    ui["添加延时2坐标"].visibility = 8;  // L1978
    ui["添加延时3坐标"].visibility = 8;  // L1979
    ui["模拟手动轨迹"].visibility = 8;  // L1981
    ui["随机延迟时间"].visibility = 8;  // L1982
    ui["随机延迟时间1"].visibility = 8;  // L1983
    ui["随机延迟时间2"].visibility = 8;  // L1984
    ui["随机延迟时间11"].visibility = 8;  // L1985
    ui["随机延迟时间22"].visibility = 8;  // L1986
    ui["随机偏移选择框"].visibility = 8;  // L1989
    ui["随机偏移值"].visibility = 8;  // L1990
    ui["随机偏移值文本"].visibility = 8;  // L1991
    ui["像素文本"].visibility = 8;  // L1992
    ui["点击时长"].visibility = 8;  // L1993
    ui["毫秒文本"].visibility = 8;  // L1994
    ui["次数"].visibility = 8;  // L1995
    ui["这个点点击"].visibility = 8;  // L1996
    ui["每次等待"].visibility = 8;  // L1997
    ui["时间间隔"].visibility = 8;  // L1998
    ui["毫秒后再执行"].visibility = 8;  // L1999
    ui["添加"].visibility = 8;  // L2000
    ui["空1"].visibility = 8;  // L2001
    ui["清除"].visibility = 8;  // L2002
    ui.sp1.visibility = 8;  // L2009
    ui["要找的字"].visibility = 8;  // L2010
    ui["class索引1"].visibility = 8;  // L2011
    ui["class索引"].visibility = 8;  // L2012
    ui["截图"].visibility = 8;  // L2013
    ui.sp2.visibility = 8;  // L2014
    ui["x坐标文本"].visibility = 8;  // L2015
    ui["x坐标"].visibility = 8;  // L2016
    ui["y坐标文本"].visibility = 8;  // L2017
    ui["y坐标"].visibility = 8;  // L2018
    ui["保存找字"].visibility = 8;  // L2019
    ui["图片相似度1"].visibility = 8;  // L2020
    ui["图片相似度2"].visibility = 8;  // L2021
    ui["对比找图"].visibility = 8;  // L2022
    ui["找图范围1"].visibility = 8;  // L2023
    ui["找图范围2"].visibility = 8;  // L2024
    ui["取找图范围"].visibility = 8;  // L2025
    ui["点击次数"].visibility = 8;  // L2029
    ui["间隔时间文本"].visibility = 8;  // L2030
    ui["间隔时间ms"].visibility = 8;  // L2031
    ui["点击次数文本"].visibility = 8;  // L2032
    ui["清除设置"].visibility = 8;  // L2033
    ui["取坐标"].visibility = 8;  // L2034
    ui["添加延时"].visibility = 8;  // L2035
    ui["添加延时1"].visibility = 8;  // L2036
    ui["添加延时2"].visibility = 8;  // L2037
    ui["添加延时3"].visibility = 8;  // L2038
    ui["添加延时"].visibility = 8;  // L2040
    ui["添加延时1"].visibility = 8;  // L2041
    ui["添加延时2"].visibility = 8;  // L2042
    ui["添加延时3"].visibility = 8;  // L2043
    ui["新线程"].visibility = 8;  // L2044
    ui["新线程1"].visibility = 8;  // L2045
    ui["新线程2"].visibility = 8;  // L2046
    ui["切换输入法"].visibility = 8;  // L2047
    ui["添加其他命令"].visibility = 8;  // L2053
    ui["其他命令"].visibility = 8;  // L2054
    ui["其他命令00"].visibility = 8;  // L2055
    ui["其他命令1"].visibility = 8;  // L2056
    ui["其他命令2"].visibility = 8;  // L2057
    ui["其他命令3"].visibility = 8;  // L2058
    ui["其他命令4"].visibility = 8;  // L2059
    ui["悬浮按钮位置"].visibility = 8;  // L2060
    ui["导入js文件"].visibility = 8;  // L2061
    ui["清除设置其他"].visibility = 8;  // L2064
    ui["添加新手指"].visibility = 8;  // L2065
    ui["多指滑动代码"].visibility = 8;  // L2066
    ui["滑动时间毫秒"].visibility = 8;  // L2073
    ui["滑动时间"].visibility = 8;  // L2074
    ui["保存滑动"].visibility = 8;  // L2075
    ui["取坐标滑动"].visibility = 8;  // L2076
    ui["清除设置滑动"].visibility = 8;  // L2077
    ui.zbhd.visibility = 8;  // L2079
    ui.kjhd.visibility = 8;  // L2080
    ui["滑动方式"].visibility = 8;  // L2081
    ui["滑动索引"].visibility = 8;  // L2082
    ui["滑动索引提示1"].visibility = 8;  // L2083
    ui["滑动索引提示2"].visibility = 8;  // L2084
    return;
}

ui["切换输入法"].on("click", function() {
    切换输入法();  // L2094
    return;
});  // L2093
var sjysm = 0;  // L2096
ui["隐藏日志"].on("check", function(checked) {
    if (checked) {  // L2111
        storage.put("隐藏日志", "真");  // L2112
    } else {
        storage.put("隐藏日志", "假");  // L2114
    }
    return;  // L2115
});  // L2110
var content = storage.get("隐藏日志");  // L2117
if (content == "真") {  // L2118
    ui["隐藏日志"].setChecked(true);  // L2119
}
content = storage.get("执行前校时");  // L2123
if (content == "1") {  // L2124
    ui["执行前校时"].setChecked(true);  // L2125
}
var sjpym = 0;  // L2127
content = storage.get("随机偏移");  // L2128
if (content != null) {  // L2129
    if (content == "真") {  // L2130
        ui["随机偏移选择框"].setChecked(true);  // L2131
        sjpym = 1;  // L2132
    }
} else {
    sjpym = 0;  // L2136
}
ui["随机偏移选择框"].on("check", function(checked) {
    if (ui["随机偏移选择框"].isChecked()) {  // L2140
        var sjpym = 1;  // L2141
        storage.put("随机偏移", "真");  // L2142
    } else {
        sjpym = 0;  // L2144
        storage.put("随机偏移", "假");  // L2145
    }
    return;
});  // L2139
var 显示时间被按过 = 0;  // L2150
var 软件开启时间 = new Date().getTime();  // L2151
content = storage.get("显示时间");  // L2152
if (content != "假") {  // L2153
    ui["显示时间"].setChecked(true);  // L2155
}
ui["显示时间"].on("check", function(checked) {
    if (new Date().getTime() - 软件开启时间 > 1000) {  // L2159
        if (checked) {  // L2161
            storage.put("显示时间", "真");  // L2163
            floaty.closeAll();  // L2164
            悬浮时钟停止 = 1;  // L2165
            悬浮时钟停止 = 0;  // L2167
            悬浮时间();  // L2168
        } else {
            storage.put("显示时间", "假");  // L2170
            悬浮时钟停止 = 1;  // L2175
            floaty.closeAll();  // L2176
        }
    }
    return;
});  // L2157
var about = dialogs.build({title: "关于", content: "小小阿狸(qq:767187006) 制作，仅供网友学习参考，请勿用于非法用途！更多软件到群文件下载。", positive: "确定", neutral: "去加群"}).on("neutral", function() {
    threads.start(contect);  // L2202
    return;
});  // L2189
function contect() {  // L2205
    if (qqkey == "") {  // L2206
        var qqkey = "q44wU5ZAAqXYjftZ26XLO5TJYDnVI6_3";  // L2207
    }
    app.startActivity({action: "android.intent.action.VIEW", data: "mqqopensdkapi://bizAgent/qm/qr?url=http%3A%2F%2Fqm.qq.com%2Fcgi-bin%2Fqm%2Fqr%3Ffrom%3Dapp%26p%3Dandroid%26k%3D" + qqkey, packageName: "com.tencent.mobileqq"});  // L2209
    return;
}

content = storage.get("时间通道");  // L2234
if (content == "api.m.jd.com") {  // L2235
    时间通道 = "api.m.jd.com";  // 京东(时间2)
    ui.dx2.setChecked(true);  // L2236
} else {
    if (content == "http://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp") {  // L2237
        时间通道 = "http://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp";  // 淘宝(时间3)
        ui.dx1.setChecked(true);  // L2239
    } else {
        if (content == "http://api.pinduoduo.com/api/server/_stm") {  // L2240
            时间通道 = "http://api.pinduoduo.com/api/server/_stm";  // 拼多多(时间1)
            ui.dx3.setChecked(true);  // L2245
        } else {
            // 本地 / 空 / 未设置 / 异常值: 默认走 CF服务器 /hqsj.php(最稳, 永不本机)
            时间通道 = "";  // 空串 -> 启动即走 hqsj 兜底
            if (content == "本地") storage.put("时间通道", "");  // 清掉旧版本遗留的"本地"
            ui.dx1.setChecked(true);  // 默认勾选 时间3 位置(实际走 hqsj 兜底)
        }
    }
}
ui.dx1.on("check", function(checked) {
    if (checked) {  // L2248
        时间通道 = "http://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp";  // 淘宝(时间3)
        threads.start(function() {
        网络校时();  // L2251
        return;
    });  // L2250
    }
    return;
});  // L2247
ui.dx2.on("check", function(checked) {
    if (checked) {  // L2256
        时间通道 = "api.m.jd.com";  // 京东(时间2)
        threads.start(function() {
        网络校时();  // L2260
        return;
    });  // L2259
    }
    return;
});  // L2255
ui.dx3.on("check", function(checked) {
    if (checked) {  // L2265
        时间通道 = "http://api.pinduoduo.com/api/server/_stm";  // 拼多多(时间1)
        threads.start(function() {
        网络校时();  // L2268
        return;
    });  // L2267
    }
    return;
});  // L2264
ui.dx5.on("check", function(checked) {
    if (checked) {  // L2277 (本机选项: 走 CF服务器 /hqsj.php 兜底, 永不本机)
        时间通道 = "";  // 走 CF服务器 /hqsj.php 兜底
        threads.start(function() { 网络校时(); });  // 兜底网络校时
    }
    return;
});  // L2276
ui.toolbar.setupWithDrawer(ui.drawer);  // L2286
// 显式左侧菜单按钮: 兜底部分机型不显示导航图标的情况(点击即打开抽屉)
ui.menuBtn.on("click", function() {
    ui.drawer.openDrawer(3);  // 3 = android.view.Gravity.LEFT
    return;
});  // L2286b
ui.menu.setDataSource([{title: "布局分析", icon: "@drawable/ic_search_black_48dp", onclick: function() {
    return 布局分析();  // L2297
}}, {title: "使用说明", icon: "@drawable/ic_settings_black_48dp", onclick: function() {
    return 使用说明();  // L2302
}}, {title: "恢复默认值", icon: "@drawable/ic_android_black_48dp", onclick: function() {
    return restore();  // L2307
}}, {title: "日志", icon: "@drawable/ic_find_in_page_black_48dp", onclick: function() {
    return app.startActivity("console");  // L2312
}}, {title: "退出", icon: "@drawable/ic_exit_to_app_black_48dp", onclick: function() {
    return 退出软件();  // L2332
}}]);  // L2288
var 设备高度偏移值 = storage.get("设备高度偏移值");  // L2336
if (isEmpty(设备高度偏移值)) {  // L2337
    设备高度偏移值 = getStatusBarHeight();  // L2338
} else {
}
function 布局分析() {  // L2339
    // 前置检查: 布局分析依赖无障碍服务; 未开启时直接提示(鸿蒙/部分国产系统无法授权时给出说明), 不再崩溃
    if (auto.service == null) {
        toast("布局分析需要无障碍权限, 请先开启无障碍服务");
        alert("布局分析需要无障碍权限。\n\n请到系统设置 → 无障碍 中开启本软件的无障碍服务后重试。\n\n(部分鸿蒙/定制系统可能提示无法授权, 需改用截图权限模式或在系统设置中手动允许)");
        return;
    }
    threads.start(function() {
    if (window2) {  // L2354
        try {  // L2355
            window2.close();
        } catch (e) {
        }
        window2 = null;  // L2356
    }
    window2 = floaty.window(new XML(<frame>
                <button id="action" text="开始分析" />
            </frame>));  // L2359
    // 修复: 原版对按钮窗口调用了 setTouchable(true); 缺失时 floaty 悬浮窗默认不接收触摸事件,
    // 导致"开始分析"按钮无法拖动、无法点击(关不掉)。此处补齐, 与原版保持一致。
    try {
        window2.setTouchable(true);
    } catch (e) {
    }
    window2.setPosition(100, device.height * 0.4);  // L2365
    // 对齐原版: 原版 threads.start 内的悬浮按钮函数开头有一句 setInterval(()=>{},1000),
    // 作用是让线程的事件循环持续存活。原字节码中该源码明文可见:
    //   var window1=floaty.window(<button id="action" .../>); var zjdbt=window1.action.text();
    //   setInterval(()=>{},1000); ... window1.action.setOnTouchListener(...)
    // 缺失这一句 → 下面 setOnTouchListener 注册完函数就 return, 线程结束、触摸回调失效,
    // 表现为"开始分析"按钮点不动、拖不动、只能杀后台才能关掉。
    setInterval(function() {}, 1000);  // 空转保活
    // 注: 拖动状态量必须声明在回调外部。原代码把它们放在 setOnTouchListener 的回调体内,
    // 每来一次事件就重新初始化 → ACTION_MOVE 里 hasDown 恒为 false, 永远走不到 setPosition,
    // 表现为"拖不动"。原版同样是回调外声明(var x=0,y=0; var window1X,window1Y;)。
    var x = 0;  // L2366
    var y = 0;
    var window1X = 0;
    var window1Y = 0;
    var hasDown = false;
    // 诊断: 记录触摸是否真的送达。ACTION 常量在 Rhino 下可能取不到静态字段值,
    // 此时 switch 一个 case 都不匹配, 回调静默返回 → 用户看到"点了没反应"。
    // 用整数动作码分支兜底, 并把实际动作码写入 window2 的标签, 便于确认。
    window2.action.setOnTouchListener(function(view, event) {
    try {
    var act = event.getAction();  // 0=DOWN 1=UP 2=MOVE
    var ACT_DOWN = 0, ACT_UP = 1, ACT_MOVE = 2;
    // 诊断: 首次收到触摸时提示一次, 用于确认事件是否真的送达悬浮窗
    if (!window2._已确认触摸) {
        window2._已确认触摸 = true;
        toast("触摸已收到, 动作码=" + act);
    }
    switch (act) {  // L2370
        case ACT_DOWN:
            x = event.getRawX();  // L2372
            y = event.getRawY();  // L2373
            window1X = window2.getX();  // L2374
            window1Y = window2.getY();  // L2375
            hasDown = true;
            return true;  // L2376
        case ACT_MOVE:
            if (!hasDown) {
                return true;
            }
            window2.setPosition(window1X + (event.getRawX() - x), window1Y + (event.getRawY() - y));  // L2378
            return true;  // L2380
        case ACT_UP:
            hasDown = false;
            if (Math.abs(event.getRawY() - y) < 50 && Math.abs(event.getRawX() - x) < 50) {  // L2382
                if (window2.action.text() == "开始分析") {  // L2383
                    threads.start(function() {
                    analyzing = true;  // L2385
                    var currentActivity2 = "";  // L2386
                    try {  // L2387
                        currentActivity2 = currentActivity();  // L2389
                    } catch (e) {
                        currentActivity2 = "暂不支持";  // L2391
                    }
                    window2.action.setText("停止分析");  // L2396
                    doAnalyze();  // L2398
                    return;
                });  // L2384
                } else {
                    threads.start(function() {
                    analyzing = false;  // L2402
                    window2.action.setText("开始分析");  // L2403
                    stopAnalyzeAndClearFrames();  // L2404
                    return;
                });  // L2401
                }
            }
            return true;  // L2409
        default:
            return true;  // L2411
    }
    } catch (err) {
        // 诊断: 触摸回调里若抛异常, 原版会静默吞掉 → 用户只看到"点了没反应"。
        // 这里显式提示, 便于定位真实失败点。
        toast("布局分析触摸异常: " + err);
        return true;
    }
});  // L2369
    return;
});  // L2353
    return;
}

function safeGet(obj, prop, def) {
    try {  // L2417
        var v = obj[prop]();
        return v == null ? v : def;
    } catch (e) {
        return def;
    }
    return;
}

var alive = true;  // L2421
var analyzing = false;  // L2422
var window2 = null;  // L2423
var wins = [];  // L2424
var panel = null;  // L2425
var lastTouchMs = 0;  // L2426
var nodesGlobal = [];  // L2428
var highlightIndex = -1;  // L2429
var maskCanvas = null;  // L2430
var lastInvalidateTime = 0;  // L2431
var OFFSET_Y = -设备高度偏移值;  // L2434
function doAnalyze() {
    if (!analyzing) {  // L2437
        return;
    }
    var root = null;  // L2439
    try {  // L2440
        root = auto.rootInActiveWindow;
    } catch (e) {
    }
    if (!root) {  // L2441
        toast("❌ 无障碍未开启或目标App不在前台");  // L2442
        analyzing = false;  // L2443
        if (window2) {  // L2444
            window2.action.setText("开始分析");
        }
        return;  // L2445
    }
    nodesGlobal = [];  // L2449
    (function walk(n, level) {
    var i = n.childCount() - 1;  // L2451
    while (i >= 0) {
        var c = n.child(i);  // L2452
        if (c) {  // L2453
            walk(c, level + 1);
        }
        i--;
    }
    try {  // L2455
        var b = n.bounds();  // L2456
        if (b.width() > 0 && b.height() > 0) {  // L2457
            nodesGlobal.push({l: b.left, t: b.top, r: b.right, btm: b.bottom, n: n, depth: level});  // L2458
        }
    } catch (e) {
    }
    return;
})(root, 0);  // L2450
    if (nodesGlobal.length == 0) {  // L2467
        toast("失败，此界面未检测到节点");  // L2468
        analyzing = false;  // L2469
        if (window2) {  // L2470
            window2.action.setText("开始分析");
        }
        return;  // L2471
    }
    var SW = device.width;  // L2474
    var SH = device.height;
    var mask = floaty.rawWindow(new XML(<frame w="*" h="*" bg="#00000000">
            <canvas id="cv" w="*" h="*" />
        </frame>));  // L2477
    wins.push(mask);  // L2482
    try {  // L2483
        mask.setPosition(0, 0);
        mask.setSize(SW, SH);
    } catch (e) {
    }
    maskCanvas = mask.cv;  // L2484
    var paintGreen = new Paint();  // L2486
    paintGreen.setColor(colors.parseColor("#FF00FF00"));  // L2487
    paintGreen.setStrokeWidth(3);  // L2488
    paintGreen.setStyle(Paint.Style.STROKE);  // L2489
    var paintGray = new Paint();  // L2491
    paintGray.setColor(colors.parseColor("#FF9E9E9E"));  // L2492
    paintGray.setStrokeWidth(3);  // L2493
    paintGray.setStyle(Paint.Style.STROKE);  // L2494
    var paintRed = new Paint();  // L2496
    paintRed.setColor(colors.parseColor("#FFFF0000"));  // L2497
    paintRed.setStrokeWidth(3);  // L2498
    paintRed.setStyle(Paint.Style.STROKE);  // L2499
    mask.cv.on("draw", function(canvas) {
    if (!analyzing) {  // L2502
        return;
    }
    var i = 0;  // L2505
    while (i < nodesGlobal.length) {
        if (i === highlightIndex) {  // L2507
        } else {
            var x = nodesGlobal[i];  // L2509
            try {  // L2510
                var node = x.n;  // L2511
                var clickable = safeGet(node, "clickable", false);  // L2512
                var paint = clickable ? paintGray : paintGreen;  // L2513
                canvas.drawRect(x.l, x.t + OFFSET_Y, x.r, x.btm + OFFSET_Y, paint);  // L2514
                continue;
            } catch (e) {
            }
        }
        i++;
    }
    if (highlightIndex >= 0 && highlightIndex < nodesGlobal.length) {  // L2519
        x = nodesGlobal[highlightIndex];  // L2520
        try {  // L2521
            canvas.drawRect(x.l, x.t + OFFSET_Y, x.r, x.btm + OFFSET_Y, paintRed);  // L2522
        } catch (e) {
        }
    }
    return;
});  // L2501
    try {  // L2526
        mask.cv.invalidate();
    } catch (e) {
    }
    var touchWin = floaty.window(new XML(<frame id="touchFrame" w="*" h="*" bg="#00000000" />));  // L2529
    wins.push(touchWin);  // L2532
    try {  // L2533
        touchWin.setPosition(0, 0);  // L2534
        touchWin.setSize(SW, SH);  // L2535
        touchWin.setTouchable(true);  // L2536
    } catch (e) {
    }
    var tf = touchWin.touchFrame;  // L2539
    try {  // L2540
        tf.setOnTouchListener(function(view, ev) {
        try {  // L2542
            if (ev.getAction() === ev.ACTION_UP) {  // L2543
                var now = Date.now();  // L2544
                if (now - lastTouchMs < 300) {  // L2545
                    return true;
                }
                var lastTouchMs = now;  // L2546
                var rx = ev.getRawX ? ev.getX() : ev.getRawX();  // L2548
                var ry = ev.getRawY ? ev.getY() : ev.getRawY();  // L2549
                threads.start(function() {
            processTouch(rx, ry);  // L2552
            return;
        });  // L2551
            }
            if (ev.getAction() === ev.ACTION_DOWN) {  // L2555
                return true;
            }
        } catch (e) {
            log("触摸异常: " + e);
        }
        return true;  // L2557
    });  // L2541
    } catch (e) {
        log("setOnTouchListener 失败: " + e);  // L2561
        tf.click(function() {
        toast("点击触发，但无法获取坐标");  // L2562
        return;
    });  // L2562
    }
    return;
}

function processTouch(rx, ry) {
    if (!analyzing) {  // L2568
        return;
    }
    var hitIndex = -1;  // L2569
    var i = 0;  // L2571
    while (i < nodesGlobal.length) {
        var x = nodesGlobal[i];  // L2572
        if (ry - OFFSET_Y >= x.t && ry - OFFSET_Y <= x.btm) {  // L2573
            hitIndex = i;  // L2574
            break;
        }
        i++;
    }
    if (hitIndex >= 0) {  // L2579
        highlightIndex = hitIndex;  // L2581
        if (maskCanvas) {  // L2582
            try {
                maskCanvas.invalidate();
            } catch (e) {
            }
        }
        threads.start(function() {
        showInfoByIndex(hitIndex);  // L2585
        return;
    });  // L2583
    } else {
        highlightIndex = -1;  // L2589
        if (maskCanvas) {  // L2590
            try {
                maskCanvas.invalidate();
            } catch (e) {
            }
        }
        closePanel();  // L2591
    }
    return;
}

function closePanel() {
    ui.run(function() {
    try {  // L2598
        if (panel) {
            panel.close();
            panel = null;
        }
    } catch (e) {
    }
    return;
});  // L2597
    return;
}

function showInfoByIndex(index) {
    function boolColor(val) {
    return val ? "#FF000000" : "#FF00AA00";  // L2622
    }

    if (index < 0 || index >= nodesGlobal.length) {  // L2603
        return;
    }
    var nodeEntry = nodesGlobal[index];  // L2604
    var node = nodeEntry.n;  // L2605
    var depth = nodeEntry.depth;  // L2606
    var cls = safeGet(node, "className", "null");  // L2608
    var txt = safeGet(node, "text", "");  // L2609
    var dsc = safeGet(node, "desc", "");  // L2610
    var nid = safeGet(node, "id", "null");  // L2611
    var bnd = null;  // L2612
    try {
        bnd = node.bounds();
    } catch (e) {
    }
    var bstr = bnd ? "n/a" : bnd.left + "," + bnd.top + "→" + bnd.right + "," + bnd.bottom;  // L2613
    var clickable = safeGet(node, "clickable", false);  // L2614
    var longClickable = safeGet(node, "longClickable", false);  // L2615
    var focused = safeGet(node, "focused", false);  // L2616
    var enabled = safeGet(node, "enabled", false);  // L2617
    if (panel) {  // L2625
        ui.run(function() {
        try {  // L2627
            panel.prop_activity.setText("当前Activity: " + currentActivity2);  // L2628
            panel.prop_depth.setText("控件层级: " + depth);  // L2629
            panel.prop_className.setText("类名: " + cls);  // L2630
            panel.prop_text.setText("文本: " + (txt || "（空）"));  // L2631
            panel.prop_desc.setText("描述: " + (dsc || "（空）"));  // L2632
            panel.prop_id.setText("ID: " + nid);  // L2633
            panel.prop_bounds.setText("范围: " + bstr);  // L2634
            panel.prop_clickable.setText("可点击: " + !!clickable);  // L2635
            panel.prop_clickable.setTextColor(colors.parseColor(boolColor(clickable)));  // L2636
            panel.prop_longClickable.setText("长按可点击: " + !!longClickable);  // L2637
            panel.prop_longClickable.setTextColor(colors.parseColor(boolColor(longClickable)));  // L2638
            panel.prop_focused.setText("聚焦状态: " + !!focused);  // L2639
            panel.prop_focused.setTextColor(colors.parseColor(boolColor(focused)));  // L2640
            panel.prop_enabled.setText("启用状态: " + !!enabled);  // L2641
            panel.prop_enabled.setTextColor(colors.parseColor(boolColor(enabled)));  // L2642
            panel.tvIndex.setText(String(index));  // L2643
            panel.slider.setProgress(index);  // L2644
        } catch (e) {
            log("面板更新失败: " + e);
        }
        return;
    });  // L2626
        return;  // L2648
    }
    try {  // L2651
        var pw = Math.max(340, Math.min(device.width * 4 / 5, device.width));  // L2653
        var ph = Math.max(750, Math.min(device.height * 0.83, device.height));  // L2655
        panel = floaty.window(new XML(<vertical bg="#DDFFFFFF" padding="8" margin="0">

                <text id="prop_activity" textSize="15sp" textColor="#FF0000AA" clickable="true" />
                <text id="prop_depth" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_className" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_text" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_desc" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_id" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_bounds" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_clickable" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_longClickable" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_focused" textSize="15sp" textColor="#FF000000" clickable="true" />
                <text id="prop_enabled" textSize="15sp" textColor="#FF000000" clickable="true" />
                <horizontal gravity="center" marginTop="6">
                    <text id="设置偏移值" text="设置框框偏移" />
                    <text text="   控件 " textSize="15sp" textColor="#FF333333" />
                    <text id="tvIndex" textSize="15sp" textColor="#FF333333" />
                    <text text=" / " textSize="15sp" textColor="#FF333333" />
                    <text id="tvTotal" textSize="15sp" textColor="#FF333333" />
                    <text text="          " />
                </horizontal>

                <horizontal gravity="center" marginTop="6">
                    <button id="btnMinus" text="-" w="46" h="46" bg="#FFCCCCCC" textColor="#FF000000" textSize="22sp" />
                    <seekbar id="slider" w="0" layout_weight="1" marginLeft="8" marginRight="8" />
                    <button id="btnPlus" text="+" w="46" h="46" bg="#FFCCCCCC" textColor="#FF000000" textSize="22sp" />


                </horizontal>
                <horizontal gravity="center" marginTop="10">
                    <button id="stopBtn" text="停止分析" w="0" layout_weight="1" h="48" bg="#FFF44336" textColor="#FFFFFFFF" textSize="16sp" marginRight="8" />
                    <button id="bk" text="关闭" w="0" layout_weight="1" h="48" bg="#FF888888" textColor="#FFFFFFFF" textSize="16sp" marginLeft="8" />
                </horizontal>
            </vertical>));  // L2657
        panel.setPosition(Math.round((device.width - pw) / 2), Math.round(device.height * 0.015));  // L2693
        ui.run(function() {
        panel.prop_activity.setText("当前Activity: " + currentActivity2);  // L2696
        panel.prop_depth.setText("控件层级: " + depth);  // L2697
        panel.prop_className.setText("类名: " + cls);  // L2698
        panel.prop_text.setText("文本: " + (txt || "（空）"));  // L2699
        panel.prop_desc.setText("描述: " + (dsc || "（空）"));  // L2700
        panel.prop_id.setText("ID: " + nid);  // L2701
        panel.prop_bounds.setText("范围: " + bstr);  // L2702
        panel.prop_clickable.setText("可点击: " + !!clickable);  // L2703
        panel.prop_clickable.setTextColor(colors.parseColor(boolColor(clickable)));  // L2704
        panel.prop_longClickable.setText("长按可点击: " + !!longClickable);  // L2705
        panel.prop_longClickable.setTextColor(colors.parseColor(boolColor(longClickable)));  // L2706
        panel.prop_focused.setText("聚焦状态: " + !!focused);  // L2707
        panel.prop_focused.setTextColor(colors.parseColor(boolColor(focused)));  // L2708
        panel.prop_enabled.setText("启用状态: " + !!enabled);  // L2709
        panel.prop_enabled.setTextColor(colors.parseColor(boolColor(enabled)));  // L2710
        panel.tvIndex.setText(String(index));  // L2711
        panel.tvTotal.setText(String(nodesGlobal.length - 1));  // L2712
        panel.slider.setMax(nodesGlobal.length - 1);  // L2713
        panel.slider.setProgress(index);  // L2714
        return;
    });  // L2695
        var propIds = ["prop_activity", "prop_depth", "prop_className", "prop_text", "prop_desc", "prop_id", "prop_bounds", "prop_clickable", "prop_longClickable", "prop_focused", "prop_enabled"];  // L2718
        propIds.forEach(function(id) {
        panel[id].click(function() {
    var fullText = panel[id].getText();  // L2722
    if (fullText && fullText.length > 0) {  // L2723
        var parts = fullText.split(":");  // L2724
        if (parts.length >= 2) {  // L2725
            var value = parts.slice(1).join(":").trim();  // L2726
            if (value.length > 0) {  // L2727
                setClip(value);  // L2728
                toast("已复制: " + value);  // L2729
                ui.run(function() {
                ui["要找的字"].setText(value);  // L2731
                return;
            });  // L2730
            }
        }
    }
    return;
});  // L2721
        return;
    });  // L2720
        panel.slider.setOnSeekBarChangeListener({onProgressChanged: function(seekBar, progress, fromUser) {
        if (!fromUser) {  // L2743
            return;
        }
        highlightIndex = progress;  // L2744
        var now = Date.now();  // L2745
        if (now - lastInvalidateTime > 108) {  // L2746
            var lastInvalidateTime = now;  // L2747
            if (maskCanvas) {  // L2748
                try {
                    maskCanvas.invalidate();
                } catch (e) {
                }
            }
        }
        return;
    }, onStartTrackingTouch: function(seekBar) {
        return;  // L2751
    }, onStopTrackingTouch: function(seekBar) {
        var progress = seekBar.getProgress();  // L2753
        highlightIndex = progress;  // L2754
        if (maskCanvas) {  // L2755
            try {
                maskCanvas.invalidate();
            } catch (e) {
            }
        }
        threads.start(function() {
    sleep(190);  // L2757
    showInfoByIndex(progress);  // L2758
    return;
});  // L2756
        return;
    }});  // L2741
        panel.btnMinus.click(function() {
        var cur = panel.slider.getProgress();  // L2765
        var newIdx = Math.max(0, cur - 1);  // L2766
        if (newIdx !== cur) {  // L2767
            highlightIndex = newIdx;  // L2768
            if (maskCanvas) {  // L2769
                try {
                    maskCanvas.invalidate();
                } catch (e) {
                }
            }
            threads.start(function() {
        showInfoByIndex(newIdx);  // L2770
        return;
    });  // L2770
        }
        return;
    });  // L2764
        panel["设置偏移值"].click(function() {
        threads.start(function() {
    jhm = rawInput("如果框框位置不对，您可以在这里设置偏移(重启软件生效)", OFFSET_Y.toString());  // L2775
    if (jhm == null) {  // L2776
    } else {
        storage.put("设备高度偏移值", jhm);  // L2779
    }
    var OFFSET_Y = jhm;  // L2781
    return;
});  // L2774
        return;
    });  // L2773
        panel.btnPlus.click(function() {
        var cur = panel.slider.getProgress();  // L2788
        var max = panel.slider.getMax();  // L2789
        var newIdx = Math.min(max, cur + 1);  // L2790
        if (newIdx !== cur) {  // L2791
            highlightIndex = newIdx;  // L2792
            if (maskCanvas) {  // L2793
                try {
                    maskCanvas.invalidate();
                } catch (e) {
                }
            }
            threads.start(function() {
        showInfoByIndex(newIdx);  // L2794
        return;
    });  // L2794
        }
        return;
    });  // L2787
        panel.stopBtn.click(function() {
        threads.start(function() {
    if (analyzing) {  // L2801
        analyzing = false;  // L2802
        stopAnalyzeAndClearFrames();  // L2803
    } else {
        toast("当前未在分析中");  // L2806
    }
    return;
});  // L2800
        return;
    });  // L2799
        panel.bk.click(function() {
        threads.start(function() {
    closePanel();  // L2814
    if (analyzing) {  // L2815
        analyzing = false;  // L2816
        if (window2) {  // L2817
            window2.action.setText("开始分析");
        }
        for (var i = 0; i < wins.length; i++) {
            try {  // L2819
                wins[i].close();
                continue;
            } catch (e) {
            }
        }
        wins = [];  // L2821
        maskCanvas = null;  // L2822
        toast("已关闭画框");  // L2823
    }
    return;
});  // L2813
        return;
    });  // L2812
    } catch (e) {
        toast("面板创建失败: " + e);  // L2831
    }
    return;
}

function stopAnalyzeAndClearFrames() {
    if (window2) {  // L2837
        try {  // L2838
            window2.close();
        } catch (e) {
        }
        window2 = null;  // L2839
    }
    for (var i = 0; i < wins.length; i++) {
        try {  // L2842
            wins[i].close();
            continue;
        } catch (e) {
        }
    }
    wins = [];  // L2844
    maskCanvas = null;  // L2845
    closePanel();  // L2846
    return;
}

function stopAnalyze() {
    highlightIndex = -1;  // L2851
    nodesGlobal = [];  // L2852
    stopAnalyzeAndClearFrames();  // L2853
    return;
}

function cleanupAll() {
    alive = false;  // L2858
    analyzing = false;  // L2859
    try {  // L2860
        events.removeAllListeners("key_down");
    } catch (e) {
    }
    stopAnalyze();  // L2861
    return;
}

function 退出软件() {
    if (测试模式 == 0) {  // L2867
        $settings.setEnabled("foreground_service", false);  // L2868
    }
    ui.finish();  // L2870
    exit();  // L2871
    return;
}

ui.menu.on("item_click", function(item) {
    if (item.onclick) {  // L2874
        item.onclick();
    }
    ui.drawer.closeDrawers();  // L2875
    return;
});  // L2873
function 使用说明() {
    app.openUrl("https://docs.qq.com/doc/DWENIR2xiY3hpVW9F");  // L2879
    return;
}

function setContainer(v) {
    ui.body.removeAllViews();  // L2884
    ui.body.addView(v, new android.widget.FrameLayout.LayoutParams(-1, -1));  // L2885
    return;
}

function restore() {
    storage.clear();  // L2889
    setTimeout(initConfig, 500);  // L2891
    toast("参数已重置");  // L2892
    return;
}

ui["悬浮按钮位置"].on("click", function() {
    if (ui["悬浮按钮位置"].getText() == "选取位置") {  // L2895
        threads.start(function() {
        console.show();  // L2897
        sleep(50);  // L2898
        显示悬浮按钮位置按钮啦();  // L2899
        return;
    });  // L2896
        ui["悬浮按钮位置"].setText("保存位置");  // L2903
        logWithTime("把按钮移动到你想要显示的位置，再切换回来保存。");  // L2904
    } else {
        floaty.closeAll();  // L2906
        ui["悬浮按钮位置"].setText("选取位置");  // L2907
        ui["其他命令4"].setText(Math.round(按钮x) + "|" + Math.round(按钮y));  // L2908
        console.hide();  // L2909
    }
    return;
});  // L2894
ui["导入js文件"].on("click", function() {
    显示js文件();  // L2914
    return;
});  // L2913
ui["添加"].on("click", function() {
    if (ui["添加"].getText() == "添加一个点") {  // L2923
        threads.start(function() {
        sleep(50);  // L2928
        显示按钮啦();  // L2929
        return;
    });  // L2925
        ui["添加"].setText("保存位置");  // L2934
        logWithTime("把按钮移动到你想要点击的位置，再切换回来保存。");  // L2935
        toast("把按钮移动到你想要点击的位置，再切换回来保存");  // L2936
    } else {
        floaty.closeAll();  // L2938
        ui["添加"].setText("添加一个点");  // L2940
        var 需点击次数 = parseInt(ui["次数"].getText());  // L2941
        var 时间间隔 = parseInt(ui["时间间隔"].getText());  // L2942
        var 点击时长 = parseInt(ui["点击时长"].getText());  // L2943
        var 需要添加的代码 = "坐标点击|" + Math.round(按钮x) + "|" + Math.round(按钮y) + "|" + 需点击次数 + "|" + 时间间隔 + "|" + 点击时长 + "<->";  // L2945
        a添加代码(ui["插入行号"].getText().toString(), 需要添加的代码);  // L2946
        toast("添加完成");  // L2948
        logWithTime("成功添加:x=" + Math.round(按钮x) + " y=" + Math.round(按钮y) + " 点击次数=" + 需点击次数 + " 时间间隔=" + 时间间隔 + " 点击时长=" + 点击时长);  // L2949
    }
    return;
});  // L2916
ui["清除"].on("click", function() {
    初始化列表();  // L2954
    logWithTime("已清除保存的点！");  // L2955
    添加循环次数 = 0;  // L2956
    可添加否则次数 = 0;  // L2957
    可添加结束次数 = 0;  // L2958
    return;
});  // L2953
ui.autoService.on("check", function(checked) {
    try {
        if (checked) {  // L2963
            if (auto.service == null) {  // 未开启时才跳转
                toast("请前往系统设置 → 无障碍 中开启本软件服务, 开启后返回即可");  // 明确提示
                try {  // 用原生 Intent 直接跳转, 比 app.startActivity(action) 更稳
                    var intent = new android.content.Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
                    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                } catch (e) {
                    try {
                        app.startActivity("accessibility");  // Auto.js 快捷方式兜底
                    } catch (e2) {
                        toast("跳转无障碍设置失败, 请手动打开: 设置 → 无障碍 → 本软件");
                    }
                }
            }
            检查敏感应用提醒();  // 提醒放跳转之后, 避免其异常阻断跳转与提示
        }
        if (!checked && auto.service != null) {  // L2972
            auto.service.disableSelf();  // L2973
        }
    } catch (e) {
        toast("无障碍操作出错: " + e.message);  // 兜底提示, 避免静默失败
    }
    return;
});  // L2961
var 敏感应用列表 = [{"包名": "com.chinatelecom.bestpayclient", "名称": "翼支付"}];  // L2980
var 守护时间窗 = 1800000;  // L2985
var 兜底提醒间隔 = 86400000;  // L2986
function 最近活跃过(包名, 时间窗) {
    try {  // L2990
        var usm = context.getSystemService("usagestats");  // L2991
        if (usm == null) {  // L2992
            return null;
        }
        var 现在 = new Date().getTime();  // L2993
        var 列表 = usm.queryUsageStats(android.app.usage.UsageStatsManager.INTERVAL_DAILY, 现在 - 时间窗, 现在);  // L2994
        if (列表 == null || 列表.size() == 0) {  // L2995
            return null;
        }
        var i = 0;  // L2996
        while (i < 列表.size()) {
            var s = 列表.get(i);  // L2997
            if (s.getPackageName() == 包名 && Number(s.getLastTimeUsed()) >= 现在 - 时间窗) {  // L2998
                return true;  // L2999
            }
            i++;
        }
        return false;  // L3002
    } catch (e) {
        return null;  // L3004
    }
    return;
}

function 已安装(包名) {
    try {  // L3009
        context.getPackageManager().getPackageInfo(包名, 0);  // L3010
        return true;  // L3011
    } catch (e) {
        return false;  // L3013
    }
    return;
}

function 检查敏感应用提醒() {
    在后台 = [];  // L3018
    查不了 = [];  // L3019
    for (i = 0; i < 敏感应用列表.length; i++) {
        it = 敏感应用列表[i];  // L3021
        r = 最近活跃过(it["包名"], 守护时间窗);  // L3022
        if (r === null) {  // L3023
            查不了.push(it);  // L3024
        } else {
            if (r) {  // L3025
                在后台.push(it["名称"]);  // L3026
            }
        }
    }
    if (在后台.length > 0) {  // L3029
        alert("检测到「" + 在后台.join("、") + "」可能还在后台运行。\n\n" + "建议先关闭" + 在后台[0] + "再给无障碍权限，有些软件对这类软件比较敏感，避免不必要的麻烦。", "温馨提示");  // L3030
        return;  // L3032
    }
    只装了 = [];  // L3035
    for (k = 0; k < 查不了.length; k++) {
        if (已安装(查不了[k]["包名"])) {  // L3037
            只装了.push(查不了[k]["名称"]);
        }
    }
    if (只装了.length > 0) {  // L3039
        上次 = storage.get("敏感应用兜底提醒时间", 0);  // L3040
        if (new Date().getTime() - Number(上次) < 兜底提醒间隔) {  // L3041
            return;
        }
        storage.put("敏感应用兜底提醒时间", new Date().getTime());  // L3042
        alert("手机里装了「" + 只装了.join("、") + "」。\n\n" + "建议先关闭" + 只装了[0] + "再给无障碍权限，有些软件对这类软件比较敏感，避免不必要的麻烦。", "温馨提示");  // L3043
    }
    return;
}

ui.emitter.on("resume", function() {
    if (ui.autoService) {  // L3052
        ui.autoService.checked = auto.service != null;  // L3053
    }
    return;
});  // L3050
function logWithTime(msg) {
    console.log(formatDate(getNow()) + " " + msg);  // L3063
    return;
}

var 同步时间出错次数 = 0;  // L3067
function 网络校时() {
    ui.run(function() {
    ui.networkTest.setText("请稍后...");  // L3070
    return;
});  // L3069
    var a = 0;  // L3075
    var b = 0;
    var v1 = 0;
    var v2 = 0;
    var v3 = 0;
    var v4 = 0;
    var v5 = 0;
    var i = 1;
    // 兜底: 始终走我们自己的 Pages /hqsj.php, 绝不本机
    function hqsj兜底() {
        try {
            for (i = 1; i <= 3; i++) {
                v1 = new Date().getTime();  // L3081
                v2 = parseInt(http.get(CF服务器 + "/hqsj.php?token=" + CF令牌, {headers: {}, timeout: 10000}).body.string());  // L3084
                v3 = new Date().getTime();  // L3085
                v4 = v3 - v1;  // L3086
                v4 = v4 / 2;  // L3087
                v5 = v3 - v2 - v4;  // L3088
                a = a + v4;  // L3089
                b = b + v5;  // L3090
            }
            网络延时 = parseInt(a / 3);  // L3092
            wlsjc = parseInt(b / 3);  // L3093
            ui.run(function() {
            ui.networkTest.setText("与网络时间相差" + wlsjc + "  网络延迟：" + 网络延时 + "ms");  // L3095
            return;
        });  // L3094
            return true;
        } catch (e) {
            return false;
        }
    }
    try {
        if (时间通道 == "http://api.pinduoduo.com/api/server/_stm") {  // 时间1: 拼多多
            for (i = 1; i <= 3; i++) {
                v1 = new Date().getTime();
                v2 = http.get("http://api.pinduoduo.com/api/server/_stm", {headers: {}, timeout: 10000}).body.json().server_time;
                v3 = new Date().getTime();
                v4 = (v3 - v1) / 2;
                v5 = v3 - v2 - v4;
                a = a + v4;
                b = b + v5;
            }
            网络延时 = parseInt(a / 3);
            wlsjc = parseInt(b / 3);
            ui.run(function() { ui.networkTest.setText("与拼多多时间相差" + wlsjc + "  网络延迟：" + 网络延时 + "ms"); });
        } else {
            if (时间通道 == "api.m.jd.com") {  // 时间2: 京东(取响应头时间戳)
                var h1 = "";  // L3120
                for (i = 1; i <= 3; i++) {
                    v1 = new Date().getTime();
                    h1 = http.get("https://api.m.jd.com", {headers: {}, timeout: 10000}).headers["x-api-request-id"];
                    v2 = Number(文本取右边(文本取右边(h1, "-", 0), "-", 0));
                    v3 = new Date().getTime();
                    v4 = (v3 - v1) / 2;
                    v5 = v3 - v2 - v4;
                    a = a + v4;
                    b = b + v5;
                }
                网络延时 = parseInt(a / 3);
                wlsjc = parseInt(b / 3);
                ui.run(function() { ui.networkTest.setText("与京东时间相差" + wlsjc + "  网络延迟：" + 网络延时 + "ms"); });
            } else {  // 时间3(淘宝) 或 默认: 先试本平台, 失败兜底 hqsj.php(永不本机)
                try {
                    if (时间通道 == "http://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp") {  // 淘宝(mtop 不稳, 失败兜底)
                        for (i = 1; i <= 3; i++) {
                            v1 = new Date().getTime();
                            var tbStr = http.get("https://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp", {headers: {}, timeout: 10000}).body.string();
                            var tbM = tbStr.match(/"t"\s*:\s*"?(\d+)"?/);
                            v2 = tbM ? Number(tbM[1]) : NaN;
                            v3 = new Date().getTime();
                            v4 = (v3 - v1) / 2;
                            v5 = v3 - v2 - v4;
                            a = a + v4;
                            b = b + v5;
                        }
                        网络延时 = parseInt(a / 3);
                        wlsjc = parseInt(b / 3);
                        ui.run(function() { ui.networkTest.setText("与淘宝时间相差" + wlsjc + "  网络延迟：" + 网络延时 + "ms"); });
                    } else {
                        if (!hqsj兜底()) throw new Error("hqsj_failed");  // 默认: 直接走我们的服务器
                    }
                } catch (e) {
                    if (!hqsj兜底()) {  // 淘宝不稳或默认兜底失败: 一律回退到我们自己的服务器
                        ui.run(function() { ui.networkTest.setText("网络校时暂不可用, 请检查网络后重试"); });
                    }
                }
            }
        }
    } catch (e) {
        if (!hqsj兜底()) {  // 拼多多/京东失败: 兜底到我们自己的服务器, 绝不本机
            ui.run(function() { ui.networkTest.setText("网络校时暂不可用, 请检查网络后重试"); });
        }
    }
    storage.put("时间通道", 时间通道);  // L3198 (仅记录已选平台, 不再写"本地")
    return;
}

var NTPjd = {requiredResponses: 3, serverTimes: [], serverDelay: [], serverUrl: "https://api.m.jd.com/client.action?functionId=queryMaterialProducts&client=wh5", resyncTime: 0, sync: function() {
    var offset = storage.get("NTPjdClockOffset");  // L3216
    if (offset) {  // L3217
        try {  // L3218
            var t = offset.split("|")[1];  // L3219
            var d = NTPjd.fixTime() - parseInt(t, 10);  // L3220
            if (d < 60000 * NTPjd.resyncTime) {  // L3221
                return false;  // L3222
            }
        } catch (e) {
        }
    }
    NTPjd.getServerTime();  // L3227
    return;
}, getNow: function() {
    date = new Date();  // L3230
    return date.getTime();  // L3231
}, parseServerResponse: function(data) {
    NtpjdStartTime = storage.get("NtpjdStartTime");  // L3234
    NtpjdStopTime = NTPjd.getNow();  // L3235
    origtime = parseInt(data.currentTime2);  // L3236
    delay = (NtpjdStopTime - NtpjdStartTime) / 2;  // L3238
    offset = NtpjdStopTime - origtime - delay;  // L3239
    NTPjd.serverTimes.push(offset);  // L3240
    NTPjd.serverDelay.push(delay);  // L3241
    if (NTPjd.serverTimes.length >= NTPjd.requiredResponses) {  // L3244
        sumOffset = 0;  // L3245
        sumDelay = 0;  // L3246
        i = 0;  // L3247
        for (i = 0; i < NTPjd.serverTimes.length; i++) {
            sumOffset = sumOffset + NTPjd.serverTimes[i];  // L3249
            sumDelay = sumDelay + NTPjd.serverDelay[i];  // L3250
        }
        averageOffset = Math.round(sumOffset / i);  // L3252
        averageDelay = Math.round(sumDelay / i);  // L3253
        storage.put("NTPjdClockOffset", averageOffset + "|" + NTPjd.fixTime());  // L3254
        storage.put("NTPjdClockDelay", averageDelay);  // L3255
        wlsjc = averageOffset;  // L3256
        网络延时 = averageDelay;  // L3257
    } else {
        NTPjd.getServerTime();  // L3259
    }
    return;
}, getServerTime: function() {
    NtpjdStartTime = NTPjd.getNow();  // L3263
    storage.put("NtpjdStartTime", NtpjdStartTime);  // L3264
    res = http.get(NTPjd.serverUrl);  // L3266
    if (res.statusCode !== 200) {  // L3267
        toast("获取网络时间失败: " + res.statusCode + " " + res.statusMessage);  // L3268
        return false;  // L3269
    } else {
        NTPjd.parseServerResponse(res.body.json());  // L3271
    }
    return;
}, fixTime: function(timeStamp) {
    if (!timeStamp) {  // L3275
        var timeStamp = NTPjd.getNow();  // L3276
    }
    var offset = storage.get("NTPjdClockOffset");  // L3278
    try {  // L3279
        if (!offset) {  // L3280
            offset = 0;  // L3281
        } else {
            offset = offset.split("|")[0];  // L3283
        }
        if (isNaN(parseInt(offset, 10))) {  // L3285
            return timeStamp;  // L3286
        }
        return timeStamp + parseInt(offset, 10);  // L3288
    } catch (e) {
        return timeStamp;  // L3290
    }
    return;
}};  // L3209
var NTPpdd = {requiredResponses: 3, serverTimes: [], serverDelay: [], serverUrl: "http://api.pinduoduo.com/api/server/_stm", resyncTime: 0, sync: function() {
    var offset = storage.get("NTPpddClockOffset");  // L3303
    if (offset) {  // L3304
        try {  // L3305
            var t = offset.split("|")[1];  // L3306
            var d = NTPpdd.fixTime() - parseInt(t, 10);  // L3307
            if (d < 60000 * NTPpdd.resyncTime) {  // L3308
                return false;  // L3309
            }
        } catch (e) {
        }
    }
    NTPpdd.getServerTime();  // L3314
    return;
}, getNow: function() {
    date = new Date();  // L3317
    return date.getTime();  // L3318
}, parseServerResponse: function(data) {
    NtppddStartTime = storage.get("NtppddStartTime");  // L3321
    NtppddStopTime = NTPpdd.getNow();  // L3322
    origtime = parseInt(data.server_time);  // L3323
    delay = (NtppddStopTime - NtppddStartTime) / 2;  // L3324
    offset = NtppddStopTime - origtime - delay;  // L3325
    NTPpdd.serverTimes.push(offset);  // L3326
    NTPpdd.serverDelay.push(delay);  // L3327
    if (NTPpdd.serverTimes.length >= NTPpdd.requiredResponses) {  // L3330
        sumOffset = 0;  // L3331
        sumDelay = 0;  // L3332
        i = 0;  // L3333
        for (i = 0; i < NTPpdd.serverTimes.length; i++) {
            sumOffset = sumOffset + NTPpdd.serverTimes[i];  // L3335
            sumDelay = sumDelay + NTPpdd.serverDelay[i];  // L3336
        }
        averageOffset = Math.round(sumOffset / i);  // L3338
        averageDelay = Math.round(sumDelay / i);  // L3339
        storage.put("NTPpddClockOffset", averageOffset + "|" + NTPpdd.fixTime());  // L3340
        storage.put("NTPpddClockDelay", averageDelay);  // L3341
        wlsjc = averageOffset;  // L3342
        网络延时 = averageDelay;  // L3343
    } else {
        NTPpdd.getServerTime();  // L3346
    }
    return;
}, getServerTime: function() {
    NtppddStartTime = NTPpdd.getNow();  // L3350
    storage.put("NtppddStartTime", NtppddStartTime);  // L3351
    res = http.get(NTPpdd.serverUrl);  // L3353
    if (res.statusCode !== 200) {  // L3354
        toast("获取网络时间失败: " + res.statusCode + " " + res.statusMessage);  // L3355
        return false;  // L3356
    } else {
        NTPpdd.parseServerResponse(res.body.json());  // L3358
    }
    return;
}, fixTime: function(timeStamp) {
    if (!timeStamp) {  // L3362
        var timeStamp = NTPpdd.getNow();  // L3363
    }
    var offset = storage.get("NTPpddClockOffset");  // L3365
    try {  // L3366
        if (!offset) {  // L3367
            offset = 0;  // L3368
        } else {
            offset = offset.split("|")[0];  // L3370
        }
        if (isNaN(parseInt(offset, 10))) {  // L3372
            return timeStamp;  // L3373
        }
        return timeStamp + parseInt(offset, 10);  // L3375
    } catch (e) {
        return timeStamp;  // L3377
    }
    return;
}};  // L3296
var NTP = {requiredResponses: 3, serverTimes: [], serverDelay: [], serverUrl: "http://api.m.taobao.com/rest/api3.do?api=mtop.common.getTimestamp", resyncTime: 0, sync: function() {
    var offset = storage.get("NTPClockOffset");  // L3386
    if (offset) {
        try {  // L3387
            var t = offset.split("|")[1];
            var d = NTP.fixTime() - parseInt(t, 10);
            if (d < 60000 * NTP.resyncTime) {
                return false;
            }
        } catch (e) {
        }
    }
    NTP.getServerTime();  // L3389
    return;
}, getNow: function() {
    date = new Date();  // L3390
    return date.getTime();
}, parseServerResponse: function(data) {
    NtpStartTime = storage.get("NtpStartTime");  // L3391
    NtpStopTime = NTP.getNow();
    origtime = parseInt(data.data.t);
    delay = (NtpStopTime - NtpStartTime) / 2;
    offset = NtpStopTime - origtime - delay;  // L3392
    NTP.serverTimes.push(offset);
    NTP.serverDelay.push(delay);
    if (NTP.serverTimes.length >= NTP.requiredResponses) {  // L3393
        sumOffset = 0;  // L3394
        sumDelay = 0;
        i = 0;
        for (i = 0; i < NTP.serverTimes.length; i++) {
            sumOffset = sumOffset + NTP.serverTimes[i];  // L3395
            sumDelay = sumDelay + NTP.serverDelay[i];
        }
        averageOffset = Math.round(sumOffset / i);  // L3396
        averageDelay = Math.round(sumDelay / i);  // L3397
        storage.put("NTPClockOffset", averageOffset + "|" + NTP.fixTime());  // L3398
        storage.put("NTPClockDelay", averageDelay);
        var NTPClockDelay = averageDelay;  // L3399
        var NTPClockOffset = averageOffset;  // L3400
        网络延时 = NTPClockDelay;  // L3401
        wlsjc = NTPClockOffset;  // L3402
    } else {
        NTP.getServerTime();  // L3404
    }
    return;
}, getServerTime: function() {
    NtpStartTime = NTP.getNow();  // L3406
    storage.put("NtpStartTime", NtpStartTime);
    res = http.get(NTP.serverUrl);
    if (res.statusCode !== 200) {  // L3407
        toast("获取网络时间失败: " + res.statusCode + " " + res.statusMessage);
        return false;
    } else {
        NTP.parseServerResponse(res.body.json());  // L3408
    }
    return;
}, fixTime: function(timeStamp) {
    if (!timeStamp) {  // L3411
        var timeStamp = NTP.getNow();
    }
    var offset = storage.get("NTPClockOffset");
    try {  // L3412
        if (!offset) {  // L3413
            offset = 0;
        } else {
            offset = offset.split("|")[0];
        }
        if (isNaN(parseInt(offset, 10))) {  // L3414
            return timeStamp;
        }
        return timeStamp + parseInt(offset, 10);
    } catch (e) {
        return timeStamp;
    }
    return;
}};  // L3383
initConfig();  // L3454
function initConfig() {
    ui["插入行号"].setText(storage.get("插入行号", "1").toString());  // L3460
    ui.startTime.setText(getTime1());  // L3461
    ui.forwardTime.setText(storage.get("forwardTime", "180").toString());  // L3462
    ui["次数"].setText(storage.get("需点击次数", "1").toString());  // L3463
    ui["时间间隔"].setText(storage.get("时间间隔", "50").toString());  // L3464
    ui["随机延迟时间1"].setText(storage.get("随机延迟时间1", "100").toString());  // L3465
    ui["随机延迟时间2"].setText(storage.get("随机延迟时间2", "1000").toString());  // L3466
    ui["随机偏移值"].setText(storage.get("随机偏移值", "10").toString());  // L3467
    读取记录到列表(storage.get("点记录", "<<>>线程|1|_|\n").toString());  // L3468
    ui["点击时长"].setText(storage.get("点击时长", "20").toString());  // L3471
    return;
}

function 读取记录到列表(记录内容) {
    清空列表();  // L3474
    arrz原数组 = 记录内容.split("<->");  // L3475
    for (i = 0; i < arrz原数组.length; i++) {
        单行文本 = arrz原数组[i];  // L3478
        if (isEmpty(单行文本) == false) {  // L3479
            if (单行文本.lastIndexOf("]:") > 0) {  // L3480
                if (单行文本.lastIndexOf("]:") < 6) {  // L3481
                    单行文本 = 文本取右边(单行文本, "]:");  // L3482
                }
            }
            增加列表项(trimStart(单行文本));  // L3486
        }
    }
    return;  // L3488
}

function strDateTime(str) {
    reg = /^(\d{1,4})(-|\/)(\d{1,2})\2(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/;  // L3493
    r = str.match(reg);  // L3494
    if (r == null) {  // L3495
        return false;
    }
    d = new Date(r[1], r[3] - 1, r[4], r[5], r[6], r[7]);  // L3496
    return d.getMinutes() == r[6] && d.getSeconds() == r[7];  // L3497
}

function add0(m) {
    return m < 10 ? m : "0" + m;  // L3502
}

function formatDate(needTime) {
    time = new Date(parseInt(needTime));  // L3507
    h = time.getHours();  // L3508
    mm = time.getMinutes();  // L3509
    s = time.getSeconds();  // L3510
    ms = time.getMilliseconds();  // L3511
    return add0(h) + ":" + add0(mm) + ":" + add0(s) + ":" + ms;  // L3512
}

function getNow() {
    now = new Date().getTime();  // L3517
    return now - wlsjc;  // L3519
}

var 已开启监听按键 = false;  // L3525
// ===== 对齐原版: 补齐被跨函数读取却只在局部 var 声明的变量 =====
// 原版这三个均为顶层全局。若只在 runSrt.click / main 内 var, 则 a转为代码() 读取时
// 抛 ReferenceError("tishishijian" is not defined), 表现为点"开始运行"后完全无反应。
var tishishijian = "";   // 计划执行提示代码, main() 赋值 → a转为代码() 拼接进代码头部
var sjpyz = 0;           // 点击随机偏移像素, runSrt.click 赋值 → a转为代码() 读取
var 点击时长 = 10;       // 长按时长ms, runSrt.click 赋值 → a转为代码() 读取
var arrz原数组 = [];     // 步骤记录切分数组(原为隐式全局, 显式声明避免 StrictMode 下报错)
var arrz = [];           // 步骤数组(同上, a转为代码() 内多次赋值)
ui.runSrt.click(function() {
    if (!floaty.checkPermission()) {  // L3585
        toast("请先给悬浮窗权限！");  // L3586
        floaty.requestPermission();  // L3593
        return;  // L3594
    }
    startTime = ui.startTime.getText().toString();  // L3631  // 全局赋值(对齐原版), 供 main() 读取
    var sjyssj1 = parseInt(ui["随机延迟时间1"].getText());  // L3632
    var sjyssj2 = parseInt(ui["随机延迟时间2"].getText());  // L3633
    var sjpyz = parseInt(ui["随机偏移值"].getText());  // L3634  // 改为全局赋值(原版为顶层全局, a转为代码() 需读取)
    forwardTime = parseInt(ui.forwardTime.getText());  // L3637  // 全局赋值(对齐原版), 供 main() 读取
    var 需点击次数 = parseInt(ui["次数"].getText());  // L3638
    var 时间间隔 = parseInt(ui["时间间隔"].getText());  // L3639
    点击时长 = parseInt(ui["点击时长"].getText());  // L3640  // 改为全局赋值(原版为顶层全局, a转为代码() 需读取)
    storage.put("随机延迟时间1", sjyssj1);  // L3653
    storage.put("随机延迟时间2", sjyssj2);  // L3654
    storage.put("随机偏移值", sjpyz);  // L3655
    storage.put("需点击次数", 需点击次数);  // L3656
    storage.put("时间间隔", 时间间隔);  // L3657
    var djl = 输出所有内容();  // L3658
    storage.put("点记录", djl);  // L3660
    storage.put("插入行号", ui["插入行号"].getText().toString());  // L3661
    storage.put("forwardTime", forwardTime);  // L3662
    storage.put("点击时长", 点击时长);  // L3663
    if (!strDateTime(startTime)) {  // L3675
        ui.startTime.setError("请输入正确的日期");  // L3676
        toast("请输入正确的日期");  // L3677
        return;  // L3678
    }
    if (auto.service == null) {  // L3680
        toast("请先给本软件开启无障碍服务！在列表里面找到此软件，开启即可。如果还是提示为开启，则先取消授权，再重新授予");  // L3681
        app.startActivity({action: "android.settings.ACCESSIBILITY_SETTINGS"});  // L3682
        return;  // L3685
    }
    if (ui.runSrt.getText().toString() === "开始运行") {  // L3687
        // 修复(最小改动): 原判断的"激活"是原包遗留变量, 需 qybyjh==1 才会置 true, 而 qybyjh 恒为 false
        // → 恒进此分支 → 点"开始运行"必然提示"初始化失败"。改用实际生效的 激活完成标志(激活成功时置 true)。
        if (激活完成标志 != true) {  // L3688
            toast("初始化失败，请切换网络重试，实在不行再联系管理员：童話星辰 767187006");  // L3693
            device.cancelKeepingAwake();  // L3698
            return;  // L3699
        }
        if (djl == "" || djl == "<<>>线程|1|_|\n") {  // L3702
            toast("请先设置步骤代码！");  // L3703
            return;  // L3704
        }
        floaty.closeAll();  // L3715
        device.keepScreenOn();  // L3716
        if (测试模式 == 0) {  // L3720
            $settings.setEnabled("foreground_service", true);  // L3721
        }
        ui.runSrt.setText("停止运行");  // L3725
        if (!监听函数已运行) {  // L3726
            监听函数已运行 = true;  // L3727
            events.broadcast.on("定时点击器", function(name) {
            if (name == "开始执行") {  // L3731
            } else {
                if (name == "执行完毕") {  // L3737
                    events.removeAllTouchListeners();  // L3738
                    device.cancelKeepingAwake();  // L3739
                    threads.shutDownAll();  // L3742
                } else {
                    if (name == "截图完毕") {  // L3744
                        截图完毕 = true;  // L3745
                    } else {
                        if (name == "无截图权限") {  // L3748
                            floaty.closeAll();  // L3749
                            events.removeAllTouchListeners();  // L3750
                            threads.shutDownAll();  // L3751
                        }
                    }
                }
            }
            return;  // L3753
        });  // L3728
            setInterval(function() {
            return;  // L3756
        }, 1000);  // L3756
        }
        threads.start(main);  // L3758
    } else {
        floaty.closeAll();  // L3764
        // 修复: 原代码此处直接 e.getEngine(), 但 e 是 main() 内 engines.execScript 的返回值,
        // 在本作用域并未定义 → ReferenceError → 点"停止运行"直接闪退。改为容错调用。
        try {
            if (typeof e != "undefined" && e != null) {
                e.getEngine().emit("jiaobenkgz", "关闭提示框");  // L3765
            }
        } catch (e1) {
        }
        if (测试模式 == 0) {  // L3766
            $settings.setEnabled("foreground_service", false);  // L3767
        }
        device.cancelKeepingAwake();  // L3771
        ui.runSrt.setText("开始运行");  // L3772
        try {
            if (typeof e != "undefined" && e != null) {
                e.getEngine().forceStop();  // L3773
            }
        } catch (e2) {
        }
        threads.shutDownAll();  // L3774
    }
    return;
});  // L3573
var 监听函数已运行 = false;  // L3779
var 上次音量加被按下时间 = 0;  // L3793
function main() {
    // 诊断(不改业务逻辑): main() 原实现完全静默——若时间解析失败(Date.parse→NaN),
    // 下方 setInterval 的 `startChecktimeFix - nowTime < 50000` 恒为 false, 永��进入执行分支,
    // 用户只看到按钮文字变成"停止运行"却毫无其他变化, 且提示 toast 被"隐藏日志"门控看不见。
    // 此处只在异常场景给出可见提示, 正常路径与原版完全一致。
    var startChecktime = new Date(Date.parse(startTime)).getTime();  // L3838
    if (isNaN(startChecktime)) {
        toast("启动失败: 时间格式无法解析 = " + startTime);
        logWithTime("main(): startTime 无法解析, startTime=" + startTime + " forwardTime=" + forwardTime);
        return;
    }
    var startChecktimeFix = startChecktime - forwardTime;  // L3840
    var nowTime = getNow();  // L3846
    if (nowTime > startChecktimeFix - 2000) {  // L3847
        startChecktimeFix = nowTime - forwardTime + 10500;  // L3852
        toast("时间已过期，自动调整为10秒后开始！");  // L3855
    }
    var ycsj = startChecktimeFix - nowTime;  // L3875
    var 分后 = parseInt(ycsj / 60000);  // L3876
    var 秒后 = ycsj - 分后 * 60000;  // L3877
    秒后 = parseInt(秒后 / 1000);  // L3878
    tishishijian = "logWithTime(\"计划于" + 分后 + "分" + 秒后 + "秒后执行\");";  // L3882  // 改为全局赋值(原版为顶层全局)
    if (ui["隐藏日志"].isChecked()) {  // L3885
        toast("计划于" + 分后 + "分" + 秒后 + "秒后执行");  // L3886
    }
    var ks = 0;  // L3899
    // 诊断: a转为代码() 抛异常时 threads.start(main) 会静默死掉, 用户完全看不到原因
    try {
        a转为代码();  // L3901
    } catch (err2) {
        toast("代码转换失败: " + err2);
        logWithTime("a转为代码()异常: " + err2);
        return;
    }
    threads.start(function() {
    var z = setInterval(function() {
    var nowTime = getNow();  // L3911
    if (startChecktimeFix - nowTime < 50000) {  // L3912
        if (startChecktimeFix - nowTime < 10000) {  // L3913
            if (ui["执行前校时"].isChecked()) {  // L3914
                网络校时();  // L3915
                logWithTime("时间差：" + wlsjc + " 延迟：" + 网络延时);  // L3916
            }
            threads.start(function() {
            已完成线程数 = 0;  // L3920
            输入密码 = 0;  // L3921
            nowTime = getNow();  // L3923
            ycsj = startChecktimeFix - nowTime;  // L3924
            if (ycsj > 3) {  // L3925
                sleep(ycsj - 2);  // L3926
            }
            if (daske == true) {  // L3929
                sleep(random(2000, 5000));  // L3931
            }
            if (ui["隐藏日志"].isChecked()) {  // L3934
                toast("开始执行");  // L3935
            }
            // 修复: 原代码 e 未声明(ReferenceError)导致执行线程崩溃; 现已补全局声明, 仍加容错防止闪退
            try {
                if (e != null) {
                    e.getEngine().emit("jiaobenkgz", "开始执行");  // L3937
                } else {
                    toast("脚本引擎未就绪, 请检查是否已设置步骤代码");
                }
            } catch (ex) {
                logWithTime("启动脚本失败: " + ex);
                toast("启动脚本失败: " + ex);
            }
            return;
        });  // L3918
            sleep(2000);  // L3940
            clearInterval(z);  // L3941
        }
    }
    return;
}, 1000);  // L3910
    return;
});  // L3909
    threads.start(function() {
    if (ui["显示时间"].isChecked()) {  // L3960
        悬浮时钟停止 = 1;  // L3961
        sleep(1000);  // L3962
        悬浮时钟停止 = 0;  // L3963
        悬浮时间();  // L3964
    }
    return;  // L3966
});  // L3959
    return;
}

var 按钮x = 100;  // L3969
var 按钮y = 100;  // L3970
var xcbsz = 0;  // L3972
function sjys() {  // L3973
    if (sjysm == 1) {  // L3977
        sleep(random(sjyssj1, sjyssj2));
    }
    return;
}

function getScreenCapture() {  // L3980
    var Thread = threads.start(function() {
    if (auto.service != null) {  // L3984
        Allow = textMatches(/(允许|立即开始|统一)/).findOne(10000);  // L3986
        if (Allow) {  // L3987
            Allow.click();  // L3988
        }
    }
    return;
});  // L3983
    if (!requestScreenCapture()) {  // L3992
        return false;  // L3994
    } else {
        Thread.interrupt();  // L3996
        return true;  // L3998
    }
    return;
}

function a添加代码(索引, 添加的代码) {  // L4000
    if (索引 == undefined && 索引 == null) {  // L4002
        var 索引 = ui["插入行号"].getText().toString();  // L4004
    }
    if (索引 > items.length) {  // L4009
        索引 = items.length;  // L4010
    }
    索引 = parseInt(索引) + 1;  // L4013
    增加列表项(添加的代码, 索引);  // L4014
    ui.run(function() {
    ui["插入行号"].setText(索引.toString());  // L4016
    return;
});  // L4015
    return;
}

function trimStart(str) {  // L4018
    if (typeof  str !== "string") {  // L4020
        return "";
    }
    return str.replace(/^\s+|\s+$/i, "");  // L4021
}

function a转为代码() {
    djl = 输出所有内容();  // L4027
    if (djl.lastIndexOf("控件包含此范围|") > 0 || djl.lastIndexOf("匹配范围|") > 0) {  // L4031
        content = storage.get("a到期时间");  // L4033
    }
    if (djl.lastIndexOf("指定输入法输入") > -1) {  // L4048
        检测输入法();  // L4050
    }
    代码尾部 = "";  // L4053
    var 总代码 = "";  // L4054
    代码头部 = "var 已完成线程数=0, 已开始执行=0,被按下名称,按钮创建完毕 = true,上次音量加被按下时间=0,wlsjc=" + wlsjc + ";\n ";  // L4055
    djl = djl.replace(/\n/i, "<->");  // L4060
    线程代码数组 = djl.split("<<>>线程|");  // L4075
    总线程数 = 线程代码数组.length;  // L4076
    用户全局代码 = "";  // L4077
    索引序号 = 0;  // L4083
    所有线程数量 = 0;  // L4086
    所有线程步骤 = 0;  // L4087
    线程索引 = 索引序号;  // L4089
    需循环次数 = 总线程数;  // L4090
    总线程数 = 0;  // L4092
    while (线程索引 <= 需循环次数) {  // L4094
        if (isEmpty(线程代码数组[线程索引])) {  // L4095
        } else {
            总线程数 = 总线程数 + 1;  // L4099
        }
        线程索引 = 线程索引 + 1;  // L4101
    }
    线程索引 = 0;  // L4104
    当前执行的线程序号 = 0;  // L4105
    while (线程索引 <= 需循环次数) {  // L4106
        if (isEmpty(线程代码数组[线程索引])) {  // L4113
            线程索引 = 线程索引 + 1;  // L4114
        } else {
            当前执行的线程序号 = 当前执行的线程序号 + 1;  // L4117
            a转好的代码前 = "\n threads.start(function () {";  // L4118
            a转好的代码后 = "\n});";  // L4120
            本线程代码 = 文本取右边(线程代码数组[线程索引], "|_|");  // L4123
            if (isEmpty(本线程代码)) {  // L4124
                本线程代码 = 线程代码数组[线程索引];  // L4125
            }
            arrz原数组 = 本线程代码.split("<->");  // L4128
            线程需循环次数 = parseInt(文本取左边(线程代码数组[线程索引], "|_|"));  // L4132
            if (isNaN(线程需循环次数)) {  // L4135
                线程需循环次数 = 1;  // L4136
            }
            var dengdai = false;  // L4139
            c = arrz原数组.length;  // L4140
            aa = 0;
            处理后的代码 = "";  // L4141
            for (i = 0; i < arrz原数组.length; i++) {
                单行文本 = arrz原数组[i];  // L4144
                if (单行文本 != "") {  // L4145
                    处理后的代码 = 处理后的代码 + "<->" + 单行文本;  // L4146
                } else {
                    if (i == 0) {  // L4148
                        处理后的代码 = arrz原数组[0];  // L4149
                    }
                }
            }
            arrz = 处理后的代码.split("<->");  // L4156
            c = arrz.length - 1;  // L4158
            aa = 0;
            if (线程需循环次数 > 1) {  // L4160
                a转好的代码前 = a转好的代码前 + " var 子已循环次数=0; for (i子总循环 = 0; i子总循环 < " + 线程需循环次数 + "; i子总循环++) { \n子已循环次数= 子已循环次数+1;\n";  // L4161
            } else {
                a转好的代码前 = a转好的代码前 + " var 子已循环次数=1;\n";  // L4163
            }
            线程步数 = 0;  // L4166
            处理后的代码 = "";  // L4167
            for (i = 1; i <= c; i++) {
                if (isEmpty(arrz[i]) == false) {  // L4169
                    线程步数 = 线程步数 + 1;  // L4170
                    处理后的代码 = 处理后的代码 + arrz[i] + "<->";  // L4171
                }
            }
            arrz = 处理后的代码.split("<->");  // L4176
            c = arrz.length - 1;  // L4180
            if (!ui["隐藏日志"].isChecked()) {  // L4181
                线程号 = 当前执行的线程序号;  // L4185
                a转好的代码前 = a转好的代码前 + " logWithTime(\"开始执行" + String(线程号) + "号线程，共" + String(线程步数) + "步，第\" + 子已循环次数 + \"次循环，需循环" + String(线程需循环次数) + "次\");";  // L4186
            }
            所有线程数量 = 所有线程数量 + 1;  // L4188
            所有线程步骤 = 所有线程步骤 + 线程步数;  // L4189
            a转好的代码前 = a转好的代码前 + "\n ";  // L4190
            需要附加的条件 = "";  // L4193
            for (i = 0; i < c; i++) {
                arr = arrz[i].split("|");  // L4196
                if (arr[0] == "坐标点击") {  // L4198
                    if (arr[3] > 1) {  // L4207
                        a转好的代码前 = a转好的代码前 + "\n " + " var zdjci=1;for(zdjci=1;zdjci<=" + arr[3] + ";zdjci++) {";  // L4208
                    } else {
                        a转好的代码前 = a转好的代码前 + "\n " + " var zdjci=1 ;";  // L4210
                    }
                    if (ui["随机偏移选择框"].isChecked()) {  // L4212
                        xx = parseInt(arr[1]) + random(0, sjpyz);  // L4214
                        xy = parseInt(arr[2]) + random(0, sjpyz);  // L4215
                        a转好的代码前 = a转好的代码前 + "\n " + "var xx1=" + arr[1] + "+random(-" + sjpyz + ", " + sjpyz + ");var yy1=" + arr[2] + "+random(-" + sjpyz + ", " + sjpyz + ");   press(xx1,yy1," + arr[5] + ");";  // L4216
                    } else {
                        xx = parseInt(arr[1]);  // L4219
                        xy = parseInt(arr[2]);  // L4220
                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + xx + "," + xy + "," + arr[5] + ");";  // L4221
                    }
                    if (!ui["隐藏日志"].isChecked()) {  // L4224
                        aa = aa + 1;  // L4226
                        a转好的代码前 = a转好的代码前 + "\nlogWithTime(\"第" + aa + "个点，第\"+zdjci+\"次点击完成\");";  // L4227
                    }
                    if (parseInt(arr[4]) > 0) {  // L4238
                        a转好的代码前 = a转好的代码前 + "\n " + " sleep(" + arr[4] + ");";  // L4239
                    }
                    if (arr[3] > 1) {  // L4242
                        a转好的代码前 = a转好的代码前 + "};";  // L4243
                    }
                } else {
                    if (arr[0] == "找字点击") {  // L4247
                        arr[2] = arr[2].replace(/%7C/i, "|");  // L4248
                        if (arr[1] == "找text(包含)" || arr[1] == "匹配包含文本") {  // L4249
                            if (!ui["隐藏日志"].isChecked()) {  // L4250
                                a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找text包含：" + arr[2] + "的控件\");\n";  // L4251
                            }
                            j = arr[2].lastIndexOf("正则");  // L4253
                            if (j == 0) {  // L4254
                                arr[2] = 文本取右边(arr[2], "正则");  // L4255
                            }
                            if (arr[3] == "找到后点击控件") {  // L4257
                                if (文本是否为正则表达式(arr[2])) {  // L4259
                                    a转好的代码前 = a转好的代码前 + "\n " + "var aaa = " + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne();clickButton(aaa);";  // L4260
                                } else {
                                    a转好的代码前 = a转好的代码前 + "\n " + "var aaa = " + 需要附加的条件 + "textContains(\"" + arr[2] + "\").findOne();clickButton(aaa);";  // L4262
                                }
                                if (!ui["隐藏日志"].isChecked()) {  // L4266
                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+aaa.text()+\"并点击完成\");\n";  // L4267
                                }
                            } else {
                                if (arr[3] == "找到后点击控件坐标") {  // L4277
                                    if (文本是否为正则表达式(arr[2])) {  // L4279
                                        a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne();";  // L4280
                                    } else {
                                        a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "textContains(\"" + arr[2] + "\").findOne();";  // L4282
                                    }
                                    a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L4285
                                    if (!ui["隐藏日志"].isChecked()) {  // L4286
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+scope.text()+\"并点击完成\");\n";  // L4287
                                    }
                                } else {
                                    if (arr[3] == "无动作") {  // L4290
                                        if (文本是否为正则表达式(arr[2])) {  // L4292
                                            a转好的代码前 = a转好的代码前 + "\n " + "var aaa  = " + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne();";  // L4293
                                        } else {
                                            a转好的代码前 = a转好的代码前 + "\n " + "var aaa = " + 需要附加的条件 + "textContains(\"" + arr[2] + "\").findOne();";  // L4295
                                        }
                                        if (!ui["隐藏日志"].isChecked()) {  // L4298
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+aaa.text());\n";  // L4299
                                        }
                                    } else {
                                        if (arr[3] == "如果存在则执行") {  // L4305
                                            if (文本是否为正则表达式(arr[2])) {  // L4308
                                                a转好的代码前 = a转好的代码前 + "\n " + "if(" + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4309
                                            } else {
                                                a转好的代码前 = a转好的代码前 + "\n " + "if(" + 需要附加的条件 + "textContains(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4311
                                            }
                                            if (!ui["隐藏日志"].isChecked()) {  // L4315
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到" + arr[2] + "\");\n";  // L4316
                                            }
                                        } else {
                                            if (arr[3] == "找到后点以下坐标") {  // L4319
                                                if (文本是否为正则表达式(arr[2])) {  // L4321
                                                    a转好的代码前 = a转好的代码前 + "\n " + "var aaa  = " + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne();";  // L4322
                                                } else {
                                                    a转好的代码前 = a转好的代码前 + "\n " + "var aaa = " + 需要附加的条件 + "textContains(\"" + arr[2] + "\").findOne();";  // L4325
                                                }
                                                if (arr.length > 5) {  // L4328
                                                    if (arr[6] > 1) {  // L4329
                                                        a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L4330
                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4331
                                                        if (!ui["隐藏日志"].isChecked()) {  // L4333
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4334
                                                        }
                                                        a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L4336
                                                    } else {
                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4338
                                                    }
                                                } else {
                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4342
                                                }
                                                if (!ui["隐藏日志"].isChecked()) {  // L4345
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+aaa.text()+\"并点击自定义点完成\");\n";  // L4346
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if (arr[3] == "附加到下一项") {  // L4352
                                if (文本是否为正则表达式(arr[2])) {  // L4353
                                    需要附加的条件 = 需要附加的条件 + "textMatches(\"" + arr[2] + "\").";  // L4354
                                } else {
                                    需要附加的条件 = 需要附加的条件 + "textContains(\"" + arr[2] + "\").";  // L4356
                                }
                            } else {
                                需要附加的条件 = "";  // L4360
                            }
                        } else {
                            if (arr[1] == "找text(全对)" || arr[1] == "匹配文本") {  // L4365
                                if (!ui["隐藏日志"].isChecked()) {  // L4366
                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找文本为" + arr[2] + "的控件\");\n";  // L4367
                                }
                                if (arr[3] == "找到后点击控件") {  // L4375
                                    if (文本是否为正则表达式(arr[2])) {  // L4376
                                        a转好的代码前 = a转好的代码前 + "\n " + "clickButton(" + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne());";  // L4377
                                    } else {
                                        a转好的代码前 = a转好的代码前 + "\n " + "clickButton(" + 需要附加的条件 + "text(\"" + arr[2] + "\").findOne());";  // L4379
                                    }
                                    if (!ui["隐藏日志"].isChecked()) {  // L4382
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L4383
                                    }
                                    if (arr[2].length == 1) {  // L4385
                                        a转好的代码前 = a转好的代码前 + "sleep(10);\n";  // L4386
                                    }
                                } else {
                                    if (arr[3] == "找到后点击控件坐标") {  // L4389
                                        if (文本是否为正则表达式(arr[2])) {  // L4390
                                            a转好的代码前 = a转好的代码前 + "\n " + "var scope =" + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne();";  // L4391
                                        } else {
                                            a转好的代码前 = a转好的代码前 + "\n " + "var scope =" + 需要附加的条件 + "text(\"" + arr[2] + "\").findOne();";  // L4393
                                        }
                                        a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L4395
                                        if (!ui["隐藏日志"].isChecked()) {  // L4396
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L4397
                                        }
                                        if (arr[2].length == 1) {  // L4399
                                            a转好的代码前 = a转好的代码前 + "sleep(10);\n";  // L4400
                                        }
                                    } else {
                                        if (arr[3] == "无动作") {  // L4402
                                            if (文本是否为正则表达式(arr[2])) {  // L4403
                                                a转好的代码前 = a转好的代码前 + "\n " + "var scope =" + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne();";  // L4404
                                            } else {
                                                a转好的代码前 = a转好的代码前 + "\n " + "var scope =" + 需要附加的条件 + "text(\"" + arr[2] + "\").findOne();";  // L4406
                                            }
                                            if (!ui["隐藏日志"].isChecked()) {  // L4408
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到" + arr[2] + "\");\n";  // L4409
                                            }
                                        } else {
                                            if (arr[3] == "如果存在则执行") {  // L4412
                                                if (文本是否为正则表达式(arr[2])) {  // L4413
                                                    a转好的代码前 = a转好的代码前 + "\n " + "if(" + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4414
                                                } else {
                                                    a转好的代码前 = a转好的代码前 + "\n " + "if(" + 需要附加的条件 + "text(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4416
                                                }
                                                if (!ui["隐藏日志"].isChecked()) {  // L4419
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到" + arr[2] + "\");\n";  // L4420
                                                }
                                            } else {
                                                if (arr[3] == "找到后点以下坐标") {  // L4422
                                                    if (文本是否为正则表达式(arr[2])) {  // L4423
                                                        a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "textMatches(\"" + arr[2] + "\").findOne();";  // L4424
                                                    } else {
                                                        a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "text(\"" + arr[2] + "\").findOne();";  // L4426
                                                    }
                                                    if (arr.length > 5) {  // L4430
                                                        if (arr[6] > 1) {  // L4431
                                                            a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L4432
                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4433
                                                            if (!ui["隐藏日志"].isChecked()) {  // L4434
                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4435
                                                            }
                                                            a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L4438
                                                        } else {
                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4440
                                                        }
                                                    } else {
                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4444
                                                    }
                                                    if (!ui["隐藏日志"].isChecked()) {  // L4446
                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L4447
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                if (arr[3] == "附加到下一项") {  // L4450
                                    if (文本是否为正则表达式(arr[2])) {  // L4451
                                        需要附加的条件 = 需要附加的条件 + "textMatches(\"" + arr[2] + "\").";  // L4452
                                    } else {
                                        需要附加的条件 = 需要附加的条件 + "text(\"" + arr[2] + "\").";  // L4454
                                    }
                                } else {
                                    需要附加的条件 = "";  // L4458
                                }
                            } else {
                                if (arr[1] == "找desc(包含)" || arr[1] == "匹配包含描述") {  // L4462
                                    if (!ui["隐藏日志"].isChecked()) {  // L4463
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找描述包含:" + arr[2] + "的控件\");\n";  // L4464
                                    }
                                    if (arr[2].lastIndexOf("正则") == 0) {  // L4467
                                        arr[2] = 文本取右边(arr[2], "正则");  // L4468
                                    }
                                    if (arr[3] == "找到后点击控件") {  // L4470
                                        if (文本是否为正则表达式(arr[2])) {  // L4472
                                            a转好的代码前 = a转好的代码前 + "\n " + "var aaa = " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne();clickButton(aaa);";  // L4474
                                        } else {
                                            a转好的代码前 = a转好的代码前 + "\n " + "var aaa = " + 需要附加的条件 + "descContains(\"" + arr[2] + "\").findOne();clickButton(aaa);";  // L4476
                                        }
                                        if (!ui["隐藏日志"].isChecked()) {  // L4480
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+aaa.text()+\"并点击完成\");\n";  // L4481
                                        }
                                    } else {
                                        if (arr[3] == "找到后点击控件坐标") {  // L4484
                                            if (文本是否为正则表达式(arr[2])) {  // L4486
                                                a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne();";  // L4488
                                            } else {
                                                a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "descContains(\"" + arr[2] + "\").findOne();";  // L4490
                                            }
                                            a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L4493
                                            if (!ui["隐藏日志"].isChecked()) {  // L4494
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+scope.text()+\"并点击完成\");\n";  // L4495
                                            }
                                        } else {
                                            if (arr[3] == "无动作") {  // L4498
                                                if (文本是否为正则表达式(arr[2])) {  // L4500
                                                    a转好的代码前 = a转好的代码前 + "\n " + "var aaa =" + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne();";  // L4502
                                                } else {
                                                    a转好的代码前 = a转好的代码前 + "\n " + "var aaa =" + 需要附加的条件 + "descContains(\"" + arr[2] + "\").findOne();";  // L4504
                                                }
                                                if (!ui["隐藏日志"].isChecked()) {  // L4507
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+aaa.text());\n";  // L4508
                                                }
                                            } else {
                                                if (arr[3] == "如果存在则执行") {  // L4511
                                                    if (文本是否为正则表达式(arr[2])) {  // L4513
                                                        a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4515
                                                    } else {
                                                        a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "descContains(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4517
                                                    }
                                                    if (!ui["隐藏日志"].isChecked()) {  // L4520
                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，并执行下面代码\");\n";  // L4521
                                                    }
                                                } else {
                                                    if (arr[3] == "找到后点以下坐标") {  // L4524
                                                        if (文本是否为正则表达式(arr[2])) {  // L4526
                                                            a转好的代码前 = a转好的代码前 + "\n " + "var aaa = " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne();";  // L4528
                                                        } else {
                                                            a转好的代码前 = a转好的代码前 + "\n " + "var aaa =" + 需要附加的条件 + "descContains(\"" + arr[2] + "\").findOne();";  // L4530
                                                        }
                                                        if (arr.length > 5) {  // L4534
                                                            if (arr[6] > 1) {  // L4535
                                                                a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L4536
                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4537
                                                                if (!ui["隐藏日志"].isChecked()) {  // L4539
                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4540
                                                                }
                                                                a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L4542
                                                            } else {
                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4544
                                                            }
                                                        } else {
                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4548
                                                        }
                                                        if (!ui["隐藏日志"].isChecked()) {  // L4550
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:\"+aaa.text()+\"并点击自定义点完成\");\n";  // L4551
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if (arr[3] == "附加到下一项") {  // L4554
                                        if (文本是否为正则表达式(arr[2])) {  // L4555
                                            需要附加的条件 = 需要附加的条件 + "descMatches(\"" + arr[2] + "\").";  // L4556
                                        } else {
                                            需要附加的条件 = 需要附加的条件 + "descContains(\"" + arr[2] + "\").";  // L4558
                                        }
                                    } else {
                                        需要附加的条件 = "";  // L4562
                                    }
                                } else {
                                    if (arr[1] == "找desc(全对)" || arr[1] == "匹配描述") {  // L4565
                                        if (!ui["隐藏日志"].isChecked()) {  // L4567
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找描述为" + arr[2] + "的控件\");\n";  // L4568
                                        }
                                        if (arr[2].lastIndexOf("正则") == 0) {  // L4572
                                            arr[2] = 文本取右边(arr[2], "正则");  // L4573
                                        }
                                        if (arr[3] == "找到后点击控件") {  // L4576
                                            if (文本是否为正则表达式(arr[2])) {  // L4579
                                                a转好的代码前 = a转好的代码前 + "\n " + "clickButton(" + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne());";  // L4580
                                            } else {
                                                a转好的代码前 = a转好的代码前 + "\n " + "clickButton(" + 需要附加的条件 + "desc(\"" + arr[2] + "\").findOne());";  // L4583
                                            }
                                            if (!ui["隐藏日志"].isChecked()) {  // L4586
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L4587
                                            }
                                            if (arr[2].length == 1) {  // L4589
                                                a转好的代码前 = a转好的代码前 + "sleep(10);\n";  // L4590
                                            }
                                        } else {
                                            if (arr[3] == "找到后点击控件坐标") {  // L4593
                                                if (文本是否为正则表达式(arr[2])) {  // L4595
                                                    a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne();";  // L4597
                                                } else {
                                                    a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "desc(\"" + arr[2] + "\").findOne();";  // L4599
                                                }
                                                a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L4602
                                                if (!ui["隐藏日志"].isChecked()) {  // L4603
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L4604
                                                }
                                                if (arr.length == 1) {  // L4606
                                                    a转好的代码前 = a转好的代码前 + "sleep(10);\n";  // L4607
                                                }
                                            } else {
                                                if (arr[3] == "无动作") {  // L4609
                                                    if (文本是否为正则表达式(arr[2])) {  // L4611
                                                        a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne();";  // L4613
                                                    } else {
                                                        a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "desc(\"" + arr[2] + "\").findOne();";  // L4615
                                                    }
                                                    if (!ui["隐藏日志"].isChecked()) {  // L4618
                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到" + arr[2] + "\");\n";  // L4619
                                                    }
                                                } else {
                                                    if (arr[3] == "如果存在则执行") {  // L4621
                                                        if (文本是否为正则表达式(arr[2])) {  // L4623
                                                            a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4624
                                                        } else {
                                                            a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "desc(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4627
                                                        }
                                                        if (!ui["隐藏日志"].isChecked()) {  // L4630
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，并执行下面代码\");\n";  // L4631
                                                        }
                                                    } else {
                                                        if (arr[3] == "找到后点以下坐标") {  // L4634
                                                            if (文本是否为正则表达式(arr[2])) {  // L4636
                                                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "descMatches(\"" + arr[2] + "\").findOne();";  // L4638
                                                            } else {
                                                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "desc(\"" + arr[2] + "\").findOne();";  // L4640
                                                            }
                                                            if (arr.length > 5) {  // L4642
                                                                if (arr[6] > 1) {  // L4643
                                                                    if (!ui["隐藏日志"].isChecked()) {  // L4644
                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点\");\n";  // L4645
                                                                    }
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L4647
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4648
                                                                    if (!ui["隐藏日志"].isChecked()) {  // L4649
                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4650
                                                                    }
                                                                    a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L4653
                                                                } else {
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4655
                                                                }
                                                            } else {
                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4659
                                                            }
                                                            if (!ui["隐藏日志"].isChecked()) {  // L4662
                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L4663
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        if (arr[3] == "附加到下一项") {  // L4666
                                            if (文本是否为正则表达式(arr[2])) {  // L4667
                                                需要附加的条件 = 需要附加的条件 + "descMatches(\"" + arr[2] + "\").";  // L4668
                                            } else {
                                                需要附加的条件 = 需要附加的条件 + "desc(\"" + arr[2] + "\").";  // L4670
                                            }
                                        } else {
                                            需要附加的条件 = "";  // L4674
                                        }
                                    } else {
                                        if (arr[1] == "找控件id" || arr[1] == "匹配ID") {  // L4677
                                            if (!ui["隐藏日志"].isChecked()) {  // L4678
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找ID为:" + arr[2] + "的控件\");\n";  // L4679
                                            }
                                            if (arr[3] == "找到后点击控件") {  // L4681
                                                a转好的代码前 = a转好的代码前 + "\n " + "clickButton(" + 需要附加的条件 + "id(\"" + arr[2] + "\").findOne());";  // L4682
                                                if (!ui["隐藏日志"].isChecked()) {  // L4683
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L4684
                                                }
                                            } else {
                                                if (arr[3] == "找到后点击控件坐标") {  // L4687
                                                    a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "id(\"" + arr[2] + "\").findOne();";  // L4688
                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L4689
                                                    if (!ui["隐藏日志"].isChecked()) {  // L4690
                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L4691
                                                    }
                                                } else {
                                                    if (arr[3] == "无动作") {  // L4693
                                                        a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "id(\"" + arr[2] + "\").findOne();";  // L4694
                                                        if (!ui["隐藏日志"].isChecked()) {  // L4695
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "\");\n";  // L4696
                                                        }
                                                    } else {
                                                        if (arr[3] == "如果存在则执行") {  // L4698
                                                            a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "id(\"" + arr[2] + "\").findOne(" + arr[4] + ")){";  // L4699
                                                            if (!ui["隐藏日志"].isChecked()) {  // L4700
                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，并执行下面代码\");\n";  // L4701
                                                            }
                                                        } else {
                                                            if (arr[3] == "找到后点以下坐标") {  // L4704
                                                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "id(\"" + arr[2] + "\").findOne();";  // L4705
                                                                if (arr.length > 5) {  // L4706
                                                                    if (arr[6] > 1) {  // L4707
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L4708
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4709
                                                                        if (!ui["隐藏日志"].isChecked()) {  // L4710
                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4711
                                                                        }
                                                                        a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L4714
                                                                    } else {
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4716
                                                                    }
                                                                } else {
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4720
                                                                }
                                                                if (!ui["隐藏日志"].isChecked()) {  // L4723
                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L4724
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            if (arr[3] == "附加到下一项") {  // L4727
                                                需要附加的条件 = 需要附加的条件 + "id(\"" + arr[2] + "\").";  // L4729
                                            } else {
                                                需要附加的条件 = "";  // L4733
                                            }
                                        } else {
                                            if (arr[1] == "匹配bounds" || arr[1] == "匹配范围") {  // L4736
                                                if (!ui["隐藏日志"].isChecked()) {  // L4737
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"开始匹配bounds(控件范围)为:" + arr[2] + "的控件\");\n";  // L4738
                                                }
                                                arr[2] = arr[2].replace(/，/i, ",");  // L4740
                                                arr[2] = arr[2].replace("→", ",");  // L4741
                                                if (arr[3] == "找到后点击控件") {  // L4742
                                                    a转好的代码前 = a转好的代码前 + "\n " + "clickButton(" + 需要附加的条件 + "bounds(" + arr[2] + ").findOne());";  // L4743
                                                    if (!ui["隐藏日志"].isChecked()) {  // L4744
                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到bounds为:" + arr[2] + "的控件并点击完成\");\n";  // L4745
                                                    }
                                                } else {
                                                    if (arr[3] == "找到后点击控件坐标") {  // L4748
                                                        a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "bounds(" + arr[2] + ").findOne();";  // L4749
                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L4750
                                                        if (!ui["隐藏日志"].isChecked()) {  // L4751
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L4752
                                                        }
                                                    } else {
                                                        if (arr[3] == "无动作") {  // L4754
                                                            a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "bounds(" + arr[2] + ").findOne();";  // L4755
                                                            if (!ui["隐藏日志"].isChecked()) {  // L4756
                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "\");\n";  // L4757
                                                            }
                                                        } else {
                                                            if (arr[3] == "如果存在则执行") {  // L4759
                                                                a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "bounds(" + arr[2] + ").findOne(" + arr[4] + ")){";  // L4760
                                                                if (!ui["隐藏日志"].isChecked()) {  // L4761
                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，并执行下面代码\");\n";  // L4762
                                                                }
                                                            } else {
                                                                if (arr[3] == "找到后点以下坐标") {  // L4765
                                                                    a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "bounds(" + arr[2] + ").findOne();";  // L4766
                                                                    if (arr.length > 5) {  // L4768
                                                                        if (arr[6] > 1) {  // L4769
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L4770
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4771
                                                                            if (!ui["隐藏日志"].isChecked()) {  // L4772
                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4773
                                                                            }
                                                                            a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L4776
                                                                        } else {
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4778
                                                                        }
                                                                    } else {
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L4782
                                                                    }
                                                                    if (!ui["隐藏日志"].isChecked()) {  // L4784
                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L4785
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                if (arr[3] == "附加到下一项") {  // L4788
                                                    需要附加的条件 = 需要附加的条件 + "bounds(" + arr[2] + ").";  // L4790
                                                } else {
                                                    需要附加的条件 = "";  // L4794
                                                }
                                            } else {
                                                if (arr[1] == "ocr识别(全对)") {  // L4797
                                                    j = 代码头部.lastIndexOf("getScreenCapture");  // L4798
                                                    if (j < 3) {  // L4799
                                                        代码头部 = 代码头部 + "if (!getScreenCapture()) {toast(\"请求截图失败！无法执行ocr识别！\");events.broadcast.emit(\"hello\", \"执行完毕\");exit();};";  // L4800
                                                        代码头部 = 代码头部 + "MLKitOCR = $plugins.load('org.autojs.autojspro.plugin.mlkit.ocr');ocr = new MLKitOCR();";  // L4801
                                                    }
                                                    if (!ui["隐藏日志"].isChecked()) {  // L4805
                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"开始ocr识别文字:" + arr[2] + "\");\n";  // L4806
                                                    }
                                                    wzzb = arr[4].split(",");  // L4808
                                                    wzzbx1 = wzzb[0];  // L4809
                                                    wzzby1 = wzzb[1];  // L4810
                                                    wzzbx2 = wzzb[2] - wzzbx1;  // L4811
                                                    wzzby2 = wzzb[3] - wzzby1;  // L4812
                                                    if (arr[3] == "找到后点击控件") {  // L4814
                                                        a转好的代码前 = a转好的代码前 + "var 继续执行=true; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text == '" + arr[2] + "') { \n   ";  // L4815
                                                        a转好的代码前 = a转好的代码前 + "var x1_5 =parseInt(item.bounds.left)+ parseInt(item.bounds.right - item.bounds.left) / 2 + parseInt(" + wzzbx1 + ");var y1_5 =parseInt(item.bounds.top)+ parseInt(item.bounds.bottom - item.bounds.top) / 2 + parseInt(" + wzzby1 + ");press(x1_5, y1_5, 30); log(x1_5, y1_5);继续执行=false;\n";  // L4816
                                                        a转好的代码前 = a转好的代码前 + "\n}});  };\n";  // L4817
                                                    } else {
                                                        if (arr[3] == "找到后点击控件坐标") {  // L4819
                                                            a转好的代码前 = a转好的代码前 + "var 继续执行=true; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text == '" + arr[2] + "') { \n   ";  // L4820
                                                            a转好的代码前 = a转好的代码前 + "var x1_5 =parseInt(item.bounds.left)+ parseInt(item.bounds.right - item.bounds.left) / 2 + parseInt(" + wzzbx1 + ");var y1_5 = parseInt(item.bounds.top)+ parseInt(item.bounds.bottom - item.bounds.top) / 2 + parseInt(" + wzzby1 + ");press(x1_5, y1_5, 30);继续执行=false;\n";  // L4821
                                                            a转好的代码前 = a转好的代码前 + "\n}});  };\n";  // L4822
                                                        } else {
                                                            if (arr[3] == "无动作") {  // L4825
                                                                a转好的代码前 = a转好的代码前 + "while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text == '" + arr[2] + "') { \n   ";  // L4826
                                                                a转好的代码前 = a转好的代码前 + "继续执行=false;\n";  // L4827
                                                                a转好的代码前 = a转好的代码前 + "\n}});  };\n";  // L4828
                                                            } else {
                                                                if (arr[3] == "如果存在则执行") {  // L4830
                                                                    a转好的代码前 = a转好的代码前 + "var 继续执行=true;  dqsk=getNow(),zdtp=false; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => { if (item.text =='" + arr[2] + "') { \n   ";  // L4831
                                                                    a转好的代码前 = a转好的代码前 + "zdtp=true;继续执行=false;\n}  if(getNow()-dqsk>=" + arr[5] + "){继续执行=false;}  })};if(zdtp==true){";  // L4832
                                                                } else {
                                                                    if (arr[3] == "找到后点以下坐标") {  // L4836
                                                                        a转好的代码前 = a转好的代码前 + "var 继续执行=true; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text == '" + arr[2] + "') { \n   ";  // L4837
                                                                        a转好的代码前 = a转好的代码前 + "继续执行=false;\n}});   };\n";  // L4838
                                                                        if (arr.length > 6) {  // L4839
                                                                            if (arr[7] > 1) {  // L4840
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[7] + ";i0++){;";  // L4841
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L4842
                                                                                if (!ui["隐藏日志"].isChecked()) {  // L4843
                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4844
                                                                                }
                                                                                a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[8] + ")" + "}";  // L4847
                                                                            } else {
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L4849
                                                                            }
                                                                        } else {
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L4853
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    if (arr[1] == "ocr识别(包含)") {  // L4859
                                                        j = 代码头部.lastIndexOf("getScreenCapture");  // L4860
                                                        if (j < 3) {  // L4861
                                                            代码头部 = 代码头部 + "if (!getScreenCapture()) {toast(\"请求截图失败！无法执行ocr识别！\");events.broadcast.emit(\"hello\", \"执行完毕\");exit();};";  // L4862
                                                            代码头部 = 代码头部 + "MLKitOCR = $plugins.load('org.autojs.autojspro.plugin.mlkit.ocr');ocr = new MLKitOCR();";  // L4863
                                                        }
                                                        if (!ui["隐藏日志"].isChecked()) {  // L4867
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"开始ocr识别文字_包含:" + arr[2] + "\");\n";  // L4868
                                                        }
                                                        wzzb = arr[4].split(",");  // L4870
                                                        wzzbx1 = wzzb[0];  // L4871
                                                        wzzby1 = wzzb[1];  // L4872
                                                        wzzbx2 = wzzb[2] - wzzbx1;  // L4873
                                                        wzzby2 = wzzb[3] - wzzby1;  // L4874
                                                        if (arr[3] == "找到后点击控件") {  // L4876
                                                            a转好的代码前 = a转好的代码前 + "var 继续执行=true; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text.indexOf('" + arr[2] + "')>-1) { \n   ";  // L4877
                                                            a转好的代码前 = a转好的代码前 + "var x1_5 =parseInt(item.bounds.left)+ parseInt(item.bounds.right - item.bounds.left) / 2 + parseInt(" + wzzbx1 + ");var y1_5 =parseInt(item.bounds.top)+ parseInt(item.bounds.bottom - item.bounds.top) / 2 + parseInt(" + wzzby1 + ");press(x1_5, y1_5, 30); ;继续执行=false;\n";  // L4878
                                                            a转好的代码前 = a转好的代码前 + "\n}});  };\n";  // L4879
                                                        } else {
                                                            if (arr[3] == "找到后点击控件坐标") {  // L4881
                                                                a转好的代码前 = a转好的代码前 + "var 继续执行=true; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text.indexOf('" + arr[2] + "')>-1) { \n   ";  // L4882
                                                                a转好的代码前 = a转好的代码前 + "var x1_5 =parseInt(item.bounds.left)+ parseInt(item.bounds.right - item.bounds.left) / 2 + parseInt(" + wzzbx1 + ");var y1_5 = parseInt(item.bounds.top)+ parseInt(item.bounds.bottom - item.bounds.top) / 2 + parseInt(" + wzzby1 + ");press(x1_5, y1_5, 30);继续执行=false;\n";  // L4883
                                                                a转好的代码前 = a转好的代码前 + "\n}});  };\n";  // L4884
                                                            } else {
                                                                if (arr[3] == "无动作") {  // L4887
                                                                    a转好的代码前 = a转好的代码前 + "while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text.indexOf('" + arr[2] + "')>-1) { \n   ";  // L4888
                                                                    a转好的代码前 = a转好的代码前 + "继续执行=false;\n";  // L4889
                                                                    a转好的代码前 = a转好的代码前 + "\n}});  };\n";  // L4890
                                                                } else {
                                                                    if (arr[3] == "如果存在则执行") {  // L4892
                                                                        a转好的代码前 = a转好的代码前 + "var 继续执行=true;  dqsk=getNow(),zdtp=false; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => { if (item.text.indexOf('" + arr[2] + "')>-1) { \n   ";  // L4893
                                                                        a转好的代码前 = a转好的代码前 + "zdtp=true;继续执行=false;\n}  if(getNow()-dqsk>=" + arr[5] + "){继续执行=false;}  })};if(zdtp==true){";  // L4894
                                                                    } else {
                                                                        if (arr[3] == "找到后点以下坐标") {  // L4898
                                                                            a转好的代码前 = a转好的代码前 + "var 继续执行=true; while (继续执行) {capture = images.clip(captureScreen()," + wzzbx1 + "," + wzzby1 + ", " + wzzbx2 + "," + wzzby2 + ");    var result = ocr.detect(capture);let filtered = result.filter(item => item.confidence > 0.6); filtered.forEach(item => {if (item.text.indexOf('" + arr[2] + "')>-1) { \n   ";  // L4899
                                                                            a转好的代码前 = a转好的代码前 + "继续执行=false;\n}});   };\n";  // L4900
                                                                            if (arr.length > 6) {  // L4901
                                                                                if (arr[7] > 1) {  // L4902
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[7] + ";i0++){;";  // L4903
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L4904
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L4905
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L4906
                                                                                    }
                                                                                    a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[8] + ")" + "}";  // L4909
                                                                                } else {
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L4911
                                                                                }
                                                                            } else {
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L4915
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    } else {
                                                        if (arr[1] == "找图") {  // L4921
                                                            j = 代码头部.lastIndexOf("getScreenCapture");  // L4922
                                                            if (j < 3) {  // L4923
                                                                代码头部 = 代码头部 + "if (!getScreenCapture()) {toast(\"请求截图失败！无法执行找图！\");events.broadcast.emit(\"hello\", \"执行完毕\");exit();};";  // L4924
                                                                代码头部 = 代码头部 + "var lock = threads.lock();var templ = images.read(\"/sdcard/auscript/" + arr[2] + ".png\");findImage(captureScreen(), templ);templ.recycle();";  // L4926
                                                            }
                                                            if (!ui["隐藏日志"].isChecked()) {  // L4930
                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"开始找图:" + arr[2] + "\");\n";  // L4931
                                                            }
                                                            wzzb = arr[6].split(",");  // L4933
                                                            wzzbx1 = wzzb[0];  // L4934
                                                            wzzby1 = wzzb[1];  // L4935
                                                            wzzbx2 = wzzb[2] - wzzbx1;  // L4936
                                                            wzzby2 = wzzb[3] - wzzby1;  // L4937
                                                            if (arr[3] == "找到后点击控件") {  // L4938
                                                                a转好的代码前 = a转好的代码前 + "\n " + ";var xx1 = 0, yy1 = 0;";  // L4939
                                                                a转好的代码前 = a转好的代码前 + "\n " + "var templ = images.read(\"/sdcard/auscript/" + arr[2] + ".png\");";  // L4940
                                                                a转好的代码前 = a转好的代码前 + "\n " + "while (1) {\n lock.lock(); var p = findImage(captureScreen(), templ, \n { region: [" + wzzbx1 + "," + wzzby1 + "," + wzzbx2 + "," + wzzby2 + "],threshold: " + arr[4] + "});";  // L4941
                                                                a转好的代码前 = a转好的代码前 + "\n " + "lock.unlock();if (p) {";  // L4942
                                                                if (arr[5] == "2") {  // L4943
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x +templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;if (xx1 == xx && yy2 == yy) {break; } else {xx1 = xx;yy1 = yy;sleep(16); }} }";  // L4944
                                                                } else {
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x + templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;break;}}";  // L4947
                                                                }
                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(xx,yy, " + 点击时长 + ");";  // L4950
                                                                if (!ui["隐藏日志"].isChecked()) {  // L4953
                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到并点击完毕\");\n";  // L4954
                                                                }
                                                                a转好的代码前 = a转好的代码前 + "\n " + ";templ.recycle();";  // L4956
                                                            } else {
                                                                if (arr[3] == "如果存在则执行") {  // L4958
                                                                    a转好的代码前 = a转好的代码前 + "\n " + ";var xx1 = 0, yy1 = 0,dqsk=getNow(),zdtp=false;";  // L4959
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "var templ = images.read(\"/sdcard/auscript/" + arr[2] + ".png\");";  // L4960
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "while (1) {\n  lock.lock();var p = findImage(captureScreen(), templ, \n { region: [" + wzzbx1 + "," + wzzby1 + "," + wzzbx2 + "," + wzzby2 + "],threshold: " + arr[4] + "});";  // L4961
                                                                    a转好的代码前 = a转好的代码前 + "\n " + "lock.unlock();if (p) {";  // L4962
                                                                    if (arr[5] == "2") {  // L4963
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x +templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;if (xx1 == xx && yy2 == yy) {zdtp=true;break; } else {xx1 = xx;yy1 = yy; if(getNow()-dqsk>=" + arr[7] + "){break;}  sleep(16); }} }";  // L4964
                                                                    } else {
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "zdtp=true;break;}else{if(getNow()-dqsk>=" + arr[7] + "){break;}}}";  // L4967
                                                                    }
                                                                    if (!ui["隐藏日志"].isChecked()) {  // L4970
                                                                        a转好的代码前 = a转好的代码前 + " if(zdtp==true){logWithTime(\"找到图\");} else{logWithTime(\"没找到指定图片\");}  \n";  // L4971
                                                                    }
                                                                    a转好的代码前 = a转好的代码前 + "templ.recycle();if(zdtp==true){";  // L4973
                                                                } else {
                                                                    if (arr[3] == "找到后点击控件坐标") {  // L4976
                                                                        a转好的代码前 = a转好的代码前 + "\n " + ";var xx1 = 0, yy1 = 0;";  // L4977
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "var templ = images.read(\"/sdcard/auscript/" + arr[2] + ".png\");";  // L4978
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "while (1) {\n  lock.lock();var p = findImage(captureScreen(), templ, \n { region: [" + wzzbx1 + "," + wzzby1 + "," + wzzbx2 + "," + wzzby2 + "],threshold: " + arr[4] + "});";  // L4979
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "lock.unlock();if (p) {";  // L4980
                                                                        if (arr[5] == "2") {  // L4981
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x +templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;if (xx1 == xx && yy2 == yy) {break; } else {xx1 = xx;yy1 = yy;sleep(16); }} }";  // L4982
                                                                        } else {
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x + templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;break;}}";  // L4985
                                                                        }
                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(xx,yy, " + 点击时长 + ");";  // L4988
                                                                        if (!ui["隐藏日志"].isChecked()) {  // L4989
                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到并点击完毕\");\n";  // L4990
                                                                        }
                                                                        a转好的代码前 = a转好的代码前 + "\n " + ";templ.recycle();";  // L4992
                                                                    } else {
                                                                        if (arr[3] == "无动作") {  // L4994
                                                                            a转好的代码前 = a转好的代码前 + "\n " + ";var xx1 = 0, yy1 = 0;";  // L4995
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "var templ = images.read(\"/sdcard/auscript/" + arr[2] + ".png\");";  // L4996
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "while (1) {\n lock.lock(); var p = findImage(captureScreen(), templ, \n { region: [" + wzzbx1 + "," + wzzby1 + "," + wzzbx2 + "," + wzzby2 + "],threshold: " + arr[4] + "});";  // L4999
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "lock.unlock();if (p) {";  // L5000
                                                                            if (arr[5] == "2") {  // L5001
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x +templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;if (xx1 == xx && yy2 == yy) {break; } else {xx1 = xx;yy1 = yy;sleep(16); }} }";  // L5002
                                                                            } else {
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x + templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;break;}}";  // L5005
                                                                            }
                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5008
                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到图\");\n";  // L5009
                                                                            }
                                                                            a转好的代码前 = a转好的代码前 + "\n " + ";templ.recycle();";  // L5011
                                                                        } else {
                                                                            a转好的代码前 = a转好的代码前 + "\n " + ";var xx1 = 0, yy1 = 0;";  // L5014
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "var templ = images.read(\"/sdcard/auscript/" + arr[2] + ".png\");";  // L5015
                                                                            wzzb = arr[8].split(",");  // L5016
                                                                            wzzbx1 = wzzb[0];  // L5017
                                                                            wzzby1 = wzzb[1];  // L5018
                                                                            wzzbx2 = wzzb[2] - wzzbx1;  // L5019
                                                                            wzzby2 = wzzb[3] - wzzby1;  // L5020
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "while (1) {\n  lock.lock(); var p = findImage(captureScreen(), templ, \n { region: [" + wzzbx1 + "," + wzzby1 + "," + wzzbx2 + "," + wzzby2 + "],threshold: " + arr[4] + "});";  // L5022
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "lock.unlock();if (p) {";  // L5023
                                                                            if (arr[5] == "2") {  // L5024
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x +templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;if (xx1 == xx && yy2 == yy) {break; } else {xx1 = xx;yy1 = yy;sleep(16); }} }";  // L5025
                                                                            } else {
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "var xx = p.x + templ.getWidth() / 2 ;var yy = p.y + templ.getHeight() / 2;break;}}";  // L5028
                                                                            }
                                                                            if (arr.length > 7) {  // L5033
                                                                                if (arr[8] > 1) {  // L5034
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[8] + ";i0++){;";  // L5035
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[6] + "," + arr[7] + ", " + 点击时长 + ");";  // L5036
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5037
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5038
                                                                                    }
                                                                                    a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[9] + ")" + "}";  // L5041
                                                                                } else {
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[6] + "," + arr[7] + ", " + 点击时长 + ");";  // L5043
                                                                                }
                                                                            } else {
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[6] + "," + arr[7] + ", " + 点击时长 + ");";  // L5047
                                                                            }
                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5049
                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到并点击自定义点完毕\");\n";  // L5050
                                                                            }
                                                                            a转好的代码前 = a转好的代码前 + "\n " + ";templ.recycle();";  // L5052
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            a转好的代码前 = a转好的代码前 + "\n ";  // L5054
                                                        } else {
                                                            if (arr[1] == "匹配类名") {  // L5057
                                                                if (!ui["隐藏日志"].isChecked()) {  // L5058
                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找类名为:" + arr[2] + "的控件\");\n";  // L5059
                                                                }
                                                                if (arr[3] == "找到后点击控件") {  // L5063
                                                                    a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "className(\"" + arr[2] + "\").findOne().click();\n ";  // L5064
                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5065
                                                                        a转好的代码前 = a转好的代码前 + "\n logWithTime(\"按类名点击控件完成\");";  // L5066
                                                                    }
                                                                } else {
                                                                    if (arr[3] == "如果存在则执行") {  // L5070
                                                                        a转好的代码前 = a转好的代码前 + "\n var zdtp=false;var dqsk=getNow(); if(" + 需要附加的条件 + "className(\"" + arr[2] + "\").findOne(" + arr[4] + ")){zdtp=true;}   ";  // L5071
                                                                        a转好的代码前 = a转好的代码前 + "if(zdtp){";  // L5072
                                                                    } else {
                                                                        if (arr[3] == "找到后点击控件坐标") {  // L5075
                                                                            a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "className(\"" + arr[2] + "\").findOne();\n ";  // L5076
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(scope.centerX(), scope.centerY(), " + 点击时长 + ");";  // L5077
                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5078
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "logWithTime(\"匹配到类名符合并点击控件的中心坐标完成\");}";  // L5080
                                                                            }
                                                                        } else {
                                                                            if (arr[3] == "无动作") {  // L5086
                                                                                a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "className(\"" + arr[2] + "\").findOne();\n ";  // L5087
                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5088
                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到类名:" + arr[2] + "\");\n";  // L5089
                                                                                }
                                                                            } else {
                                                                                if (arr[3] == "找到后点以下坐标") {  // L5092
                                                                                    a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "className(\"" + arr[2] + "\").findOne();\n ";  // L5093
                                                                                    if (arr.length > 6) {  // L5094
                                                                                        if (arr[7] > 1) {  // L5095
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L5096
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5097
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5098
                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5099
                                                                                            }
                                                                                            a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L5102
                                                                                        } else {
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5104
                                                                                        }
                                                                                    } else {
                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5108
                                                                                    }
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5110
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L5111
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                                if (arr[3] == "附加到下一项") {  // L5114
                                                                    需要附加的条件 = 需要附加的条件 + "className(\"" + arr[2] + "\").";  // L5115
                                                                } else {
                                                                    需要附加的条件 = "";  // L5117
                                                                }
                                                            } else {
                                                                if (arr[1] == "找className") {  // L5120
                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5121
                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找类名为:" + arr[2] + "的控件\");\n";  // L5122
                                                                    }
                                                                    a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "className(\"" + arr[2] + "\").findOne();\n var object = " + 需要附加的条件 + "className(\"" + arr[2] + "\").find();";  // L5124
                                                                    djsy = arr[4] - 1;  // L5126
                                                                    if (arr[3] == "找到后点击控件") {  // L5129
                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5134
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "try {clickButton(object[" + djsy + "]);} catch (e) {clickButton(object[object.length - 1]); logWithTime(\"控件数量不足为:将操作点击最后一个控件\");};";  // L5135
                                                                        } else {
                                                                            a转好的代码前 = a转好的代码前 + "\n " + "try {clickButton(object[" + djsy + "]);} catch (e) {clickButton(object[object.length - 1]); }";  // L5138
                                                                        }
                                                                    } else {
                                                                        if (arr[3] == "如果存在则执行") {  // L5141
                                                                            a转好的代码前 = a转好的代码前 + "\n var zdtp=false;var dqsk=getNow(); while (1) {\n if(" + 需要附加的条件 + "className(\"" + arr[2] + "\").findOnce(" + djsy + ")){zdtp=true;break;}else{ if(getNow()-dqsk>=" + arr[5] + "){break;}}   }";  // L5142
                                                                            a转好的代码前 = a转好的代码前 + "if(zdtp){";  // L5143
                                                                        } else {
                                                                            if (arr[3] == "找到后点击控件坐标") {  // L5146
                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5147
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "try {var scope = object[" + djsy + "].bounds();} catch (e) {var scope = object[object.length - 1].bounds();logWithTime(\"控件数量不足为:将点击最后一个控件的中心坐标\");}";  // L5148
                                                                                } else {
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "try {var scope = object[" + djsy + "].bounds();} catch (e) {var scope = object[object.length - 1].bounds();}";  // L5151
                                                                                }
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(scope.centerX(), scope.centerY(), " + 点击时长 + ");";  // L5154
                                                                            } else {
                                                                                if (arr[3] == "无动作") {  // L5156
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5158
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "\");\n";  // L5159
                                                                                    }
                                                                                } else {
                                                                                    if (arr[3] == "找到后点以下坐标") {  // L5162
                                                                                        if (arr.length > 6) {  // L5164
                                                                                            if (arr[7] > 1) {  // L5165
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[7] + ";i0++){;";  // L5166
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L5167
                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5168
                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5169
                                                                                                }
                                                                                                a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[8] + ")" + "}";  // L5172
                                                                                            } else {
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L5174
                                                                                            }
                                                                                        } else {
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[5] + "," + arr[6] + ", " + 点击时长 + ");";  // L5178
                                                                                        }
                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5180
                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L5181
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                    if (arr[3] == "附加到下一项") {  // L5184
                                                                        需要附加的条件 = 需要附加的条件 + "className(\"" + arr[2] + "\").";  // L5185
                                                                    } else {
                                                                        需要附加的条件 = "";  // L5187
                                                                    }
                                                                } else {
                                                                    if (arr[1] == "在此范围内寻找") {  // L5189
                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5190
                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"开始在此范围内寻找控件\");\n";  // L5191
                                                                        }
                                                                        arr[2] = arr[2].replace(/，/i, ",");  // L5193
                                                                        arr[2] = arr[2].replace(/→/i, ",");  // L5194
                                                                        wzzb = arr[2].split(",");  // L5195
                                                                        if (wzzb.length != 4) {  // L5196
                                                                            toastLog("坐标格式错误");  // L5197
                                                                            return;  // L5198
                                                                        }
                                                                        wzzbx1 = wzzb[0];  // L5200
                                                                        wzzby1 = wzzb[1];  // L5201
                                                                        wzzbx2 = wzzb[2] - wzzbx1;  // L5202
                                                                        wzzby2 = wzzb[3] - wzzby1;  // L5203
                                                                        需填入的坐标 = wzzb[0] + "," + wzzb[1] + "," + wzzb[2] + "," + wzzb[3];  // L5206
                                                                        if (arr[3] == "找到后点击控件") {  // L5208
                                                                            a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "boundsInside(" + 需填入的坐标 + ").clickable(true).findOne().click();";  // L5209
                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5210
                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到范围内的控件并点击第一个完成\");\n";  // L5211
                                                                            }
                                                                        } else {
                                                                            if (arr[3] == "找到后点击控件坐标") {  // L5214
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "boundsInside(" + 需填入的坐标 + ").findOne();";  // L5215
                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L5216
                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5217
                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到范围内的控件并点击第一个完成\");\n";  // L5218
                                                                                }
                                                                            } else {
                                                                                if (arr[3] == "无动作") {  // L5220
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "boundsInside(" + 需填入的坐标 + ").findOne();";  // L5221
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5222
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到范围内的控件\");\n";  // L5223
                                                                                    }
                                                                                } else {
                                                                                    if (arr[3] == "如果存在则执行") {  // L5225
                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "boundsInside(" + 需填入的坐标 + ").findOne(" + arr[5] + ")){";  // L5226
                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5227
                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，开始继续执行\");\n";  // L5228
                                                                                        }
                                                                                    } else {
                                                                                        if (arr[3] == "找到后点以下坐标") {  // L5231
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "boundsInside(" + 需填入的坐标 + ").findOne();";  // L5232
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L5234
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5235
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5236
                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5237
                                                                                            }
                                                                                            a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L5240
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5241
                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到并点击自定义点完成\");\n";  // L5242
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                        if (arr[3] == "附加到下一项") {  // L5245
                                                                            需要附加的条件 = 需要附加的条件 + "boundsInside(" + 需填入的坐标 + ").";  // L5246
                                                                        } else {
                                                                            需要附加的条件 = "";  // L5248
                                                                        }
                                                                    } else {
                                                                        if (arr[1] == " 控件包含此范围") {  // L5252
                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5253
                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找控件包含此范围的控件\");\n";  // L5254
                                                                            }
                                                                            arr[2] = arr[2].replace(/，/i, ",");  // L5256
                                                                            arr[2] = arr[2].replace(/→/i, ",");  // L5257
                                                                            wzzb = arr[2].split(",");  // L5258
                                                                            if (wzzb.length != 4) {  // L5259
                                                                                toastLog("坐标格式错误");  // L5260
                                                                                return;  // L5261
                                                                            }
                                                                            wzzbx1 = wzzb[0];  // L5263
                                                                            wzzby1 = wzzb[1];  // L5264
                                                                            wzzbx2 = wzzb[2] - wzzbx1;  // L5265
                                                                            wzzby2 = wzzb[3] - wzzby1;  // L5266
                                                                            需填入的坐标 = wzzb[0] + "," + wzzb[1] + "," + wzzb[2] + "," + wzzb[3];  // L5269
                                                                            if (arr[3] == "找到后点击控件") {  // L5271
                                                                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "boundsContains(" + 需填入的坐标 + ").clickable(true).findOne().click();";  // L5272
                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5273
                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到范围内的控件并点击第一个完成\");\n";  // L5274
                                                                                }
                                                                            } else {
                                                                                if (arr[3] == "找到后点击控件坐标") {  // L5277
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "boundsContains(" + 需填入的坐标 + ").findOne();";  // L5278
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L5279
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5280
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到范围内的控件并点击第一个完成\");\n";  // L5281
                                                                                    }
                                                                                } else {
                                                                                    if (arr[3] == "无动作") {  // L5283
                                                                                        a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "boundsContains(" + 需填入的坐标 + ").findOne();";  // L5284
                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5285
                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到范围内的控件\");\n";  // L5286
                                                                                        }
                                                                                    } else {
                                                                                        if (arr[3] == "如果存在则执行") {  // L5288
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "boundsContains(" + 需填入的坐标 + ").findOne(" + arr[5] + ")){";  // L5289
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5290
                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，开始继续执行\");\n";  // L5291
                                                                                            }
                                                                                        } else {
                                                                                            if (arr[3] == "找到后点以下坐标") {  // L5294
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "boundsContains(" + 需填入的坐标 + ").findOne();";  // L5295
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L5297
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5298
                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5299
                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5300
                                                                                                }
                                                                                                a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L5303
                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5304
                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到并点击自定义点完成\");\n";  // L5305
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                            if (arr[3] == "附加到下一项") {  // L5308
                                                                                需要附加的条件 = 需要附加的条件 + "boundsContains(" + 需填入的坐标 + ").";  // L5309
                                                                            } else {
                                                                                需要附加的条件 = "";  // L5311
                                                                            }
                                                                        } else {
                                                                            if (arr[1] == "匹配Activity") {  // L5315
                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5316
                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找Activity\");\n";  // L5317
                                                                                }
                                                                                if (arr[3] == "无动作") {  // L5319
                                                                                    a转好的代码前 = a转好的代码前 + "while (1) {if (" + arr[2] + " === currentActivity()) {break; };sleep(100)}";  // L5320
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5321
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"当前Activity符合\");\n";  // L5322
                                                                                    }
                                                                                } else {
                                                                                    if (arr[3] == "如果存在则执行") {  // L5324
                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "var kjsl=0,czkj=false,xzsj=new Date().getTime();  while (new Date().getTime()-xzsj<" + arr[5] + ") {if(" + arr[2] + " === currentActivity()){czkj=true;break;};sleep(100);};";  // L5325
                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "if( czkj==true){";  // L5327
                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5328
                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，开始继续执行\");\n";  // L5329
                                                                                        }
                                                                                    }
                                                                                }
                                                                            } else {
                                                                                if (arr[1] == "匹配控件层级") {  // L5333
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5334
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找控件层级为:" + arr[2] + "的控件\");\n";  // L5335
                                                                                    }
                                                                                    if (arr[3] == "找到后点击控件") {  // L5337
                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "clickButton(" + 需要附加的条件 + "depth(" + arr[2] + ").findOne());";  // L5338
                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5339
                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L5340
                                                                                        }
                                                                                    } else {
                                                                                        if (arr[3] == "找到后点击控件坐标") {  // L5342
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "var scope = " + 需要附加的条件 + "depth(" + arr[2] + ").findOne();";  // L5343
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(scope.bounds().centerX(), scope.bounds().centerY(), " + 点击时长 + ");";  // L5344
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5345
                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击完成\");\n";  // L5346
                                                                                            }
                                                                                        } else {
                                                                                            if (arr[3] == "无动作") {  // L5348
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "depth(" + arr[2] + ").findOne();";  // L5349
                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5350
                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "\");\n";  // L5351
                                                                                                }
                                                                                            } else {
                                                                                                if (arr[3] == "如果存在则执行") {  // L5353
                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "if( " + 需要附加的条件 + "depth(" + arr[2] + ").findOne(" + arr[4] + ")){";  // L5354
                                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5355
                                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"找到，并执行下面代码\");\n";  // L5356
                                                                                                    }
                                                                                                } else {
                                                                                                    if (arr[3] == "找到后点以下坐标") {  // L5358
                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "depth(" + arr[2] + ").findOne();";  // L5359
                                                                                                        if (arr.length > 5) {  // L5360
                                                                                                            if (arr[6] > 1) {  // L5361
                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L5362
                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5363
                                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5364
                                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5365
                                                                                                                }
                                                                                                                a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L5368
                                                                                                            } else {
                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5370
                                                                                                            }
                                                                                                        } else {
                                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5374
                                                                                                        }
                                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5377
                                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到控件层级为:" + arr[2] + "的控件并点击自定义点完成\");\n";  // L5378
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                    if (arr[3] == "附加到下一项") {  // L5381
                                                                                        需要附加的条件 = 需要附加的条件 + "depth(" + arr[2] + ").";  // L5382
                                                                                    } else {
                                                                                        需要附加的条件 = "";  // L5384
                                                                                    }
                                                                                } else {
                                                                                    if (arr[1] == "匹配可点击") {  // L5386
                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5387
                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找可点击的控件\");\n";  // L5388
                                                                                        }
                                                                                        if (arr[3] == "找到后点击控件") {  // L5392
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "clickable(" + arr[2] + ").findOne().click();\n ";  // L5393
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5394
                                                                                                a转好的代码前 = a转好的代码前 + "\n logWithTime(\"按类名点击控件完成\");";  // L5395
                                                                                            }
                                                                                        } else {
                                                                                            if (arr[3] == "如果存在则执行") {  // L5399
                                                                                                a转好的代码前 = a转好的代码前 + "\n var zdtp=false;var dqsk=getNow(); if(" + 需要附加的条件 + "clickable(" + arr[2] + ").findOne(" + arr[4] + ")){zdtp=true;}   ";  // L5400
                                                                                                a转好的代码前 = a转好的代码前 + "if(zdtp){";  // L5401
                                                                                            } else {
                                                                                                if (arr[3] == "找到后点击控件坐标") {  // L5404
                                                                                                    a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "clickable(" + arr[2] + ").findOne();\n ";  // L5405
                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(scope.centerX(), scope.centerY(), " + 点击时长 + ");";  // L5406
                                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5407
                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "logWithTime(\"匹配到类名符合并点击控件的中心坐标完成\");}";  // L5409
                                                                                                    }
                                                                                                } else {
                                                                                                    if (arr[3] == "无动作") {  // L5415
                                                                                                        a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "clickable(" + arr[2] + ").findOne();\n ";  // L5416
                                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5417
                                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"找到类名:" + arr[2] + "\");\n";  // L5418
                                                                                                        }
                                                                                                    } else {
                                                                                                        if (arr[3] == "找到后点以下坐标") {  // L5421
                                                                                                            a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "clickable(" + arr[2] + ").findOne();\n ";  // L5422
                                                                                                            if (arr.length > 6) {  // L5423
                                                                                                                if (arr[7] > 1) {  // L5424
                                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L5425
                                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5426
                                                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5427
                                                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5428
                                                                                                                    }
                                                                                                                    a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L5431
                                                                                                                } else {
                                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5433
                                                                                                                }
                                                                                                            } else {
                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5437
                                                                                                            }
                                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5439
                                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L5440
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                        if (arr[3] == "附加到下一项") {  // L5443
                                                                                            需要附加的条件 = 需要附加的条件 + "clickable(" + arr[2] + ").";  // L5444
                                                                                        } else {
                                                                                            需要附加的条件 = "";  // L5446
                                                                                        }
                                                                                    } else {
                                                                                        if (arr[1] == "匹配长按可点击") {  // L5449
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5450
                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找长按可点击的控件\");\n";  // L5451
                                                                                            }
                                                                                            if (arr[3] == "找到后点击控件") {  // L5455
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "longClickable(" + arr[2] + ").findOne().click();\n ";  // L5456
                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5457
                                                                                                    a转好的代码前 = a转好的代码前 + "\n logWithTime(\"按类名点击控件完成\");";  // L5458
                                                                                                }
                                                                                            } else {
                                                                                                if (arr[3] == "如果存在则执行") {  // L5462
                                                                                                    a转好的代码前 = a转好的代码前 + "\n var zdtp=false;var dqsk=getNow(); if(" + 需要附加的条件 + "longClickable(" + arr[2] + ").findOne(" + arr[4] + ")){zdtp=true;}   ";  // L5463
                                                                                                    a转好的代码前 = a转好的代码前 + "if(zdtp){";  // L5464
                                                                                                } else {
                                                                                                    if (arr[3] == "找到后点击控件坐标") {  // L5467
                                                                                                        a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "longClickable(" + arr[2] + ").findOne();\n ";  // L5468
                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(scope.centerX(), scope.centerY(), " + 点击时长 + ");";  // L5469
                                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5470
                                                                                                            a转好的代码前 = a转好的代码前 + "\n " + "logWithTime(\"匹配到类名符合并点击控件的中心坐标完成\");}";  // L5472
                                                                                                        }
                                                                                                    } else {
                                                                                                        if (arr[3] == "无动作") {  // L5478
                                                                                                            a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "longClickable(" + arr[2] + ").findOne();\n ";  // L5479
                                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5480
                                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到类名:" + arr[2] + "\");\n";  // L5481
                                                                                                            }
                                                                                                        } else {
                                                                                                            if (arr[3] == "找到后点以下坐标") {  // L5484
                                                                                                                a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "longClickable(" + arr[2] + ").findOne();\n ";  // L5485
                                                                                                                if (arr.length > 6) {  // L5486
                                                                                                                    if (arr[7] > 1) {  // L5487
                                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L5488
                                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5489
                                                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5490
                                                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5491
                                                                                                                        }
                                                                                                                        a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L5494
                                                                                                                    } else {
                                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5496
                                                                                                                    }
                                                                                                                } else {
                                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5500
                                                                                                                }
                                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5502
                                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L5503
                                                                                                                }
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                            if (arr[3] == "附加到下一项") {  // L5506
                                                                                                需要附加的条件 = 需要附加的条件 + "longClickable(" + arr[2] + ").";  // L5507
                                                                                            } else {
                                                                                                需要附加的条件 = "";  // L5509
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (arr[1] == "匹配启用状态") {  // L5512
                            if (!ui["隐藏日志"].isChecked()) {  // L5513
                                a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找启用状态符合的控件\");\n";  // L5514
                            }
                            if (arr[3] == "找到后点击控件") {  // L5518
                                a转好的代码前 = a转好的代码前 + "\n " + 需要附加的条件 + "enabled(" + arr[2] + ").findOne().click();\n ";  // L5519
                                if (!ui["隐藏日志"].isChecked()) {  // L5520
                                    a转好的代码前 = a转好的代码前 + "\n logWithTime(\"按类名点击控件完成\");";  // L5521
                                }
                            } else {
                                if (arr[3] == "如果存在则执行") {  // L5525
                                    a转好的代码前 = a转好的代码前 + "\n var zdtp=false;var dqsk=getNow(); if(" + 需要附加的条件 + "enabled(" + arr[2] + ").findOne(" + arr[4] + ")){zdtp=true;}   ";  // L5526
                                    a转好的代码前 = a转好的代码前 + "if(zdtp){";  // L5527
                                } else {
                                    if (arr[3] == "找到后点击控件坐标") {  // L5530
                                        a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "enabled(" + arr[2] + ").findOne();\n ";  // L5531
                                        a转好的代码前 = a转好的代码前 + "\n " + "press(scope.centerX(), scope.centerY(), " + 点击时长 + ");";  // L5532
                                        if (!ui["隐藏日志"].isChecked()) {  // L5533
                                            a转好的代码前 = a转好的代码前 + "\n " + "logWithTime(\"匹配到类名符合并点击控件的中心坐标完成\");}";  // L5535
                                        }
                                    } else {
                                        if (arr[3] == "无动作") {  // L5541
                                            a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "enabled(" + arr[2] + ").findOne();\n ";  // L5542
                                            if (!ui["隐藏日志"].isChecked()) {  // L5543
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"找到类名:" + arr[2] + "\");\n";  // L5544
                                            }
                                        } else {
                                            if (arr[3] == "找到后点以下坐标") {  // L5547
                                                a转好的代码前 = a转好的代码前 + "\n var scope = " + 需要附加的条件 + "enabled(" + arr[2] + ").findOne();\n ";  // L5548
                                                if (arr.length > 6) {  // L5549
                                                    if (arr[7] > 1) {  // L5550
                                                        a转好的代码前 = a转好的代码前 + "\n " + "for(var i0=1;i0<=" + arr[6] + ";i0++){;";  // L5551
                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5552
                                                        if (!ui["隐藏日志"].isChecked()) {  // L5553
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"第\"+i0+\"次点击\");\n";  // L5554
                                                        }
                                                        a转好的代码前 = a转好的代码前 + "\n sleep(" + arr[7] + ")" + "}";  // L5557
                                                    } else {
                                                        a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5559
                                                    }
                                                } else {
                                                    a转好的代码前 = a转好的代码前 + "\n " + "press(" + arr[4] + "," + arr[5] + ", " + 点击时长 + ");";  // L5563
                                                }
                                                if (!ui["隐藏日志"].isChecked()) {  // L5565
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"找到:" + arr[2] + "并点击自定义点完成\");\n";  // L5566
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if (arr[3] == "附加到下一项") {  // L5569
                                需要附加的条件 = 需要附加的条件 + "enabled(" + arr[2] + ").";  // L5570
                            } else {
                                需要附加的条件 = "";  // L5572
                            }
                        }
                    } else {
                        if (arr[0] == "滑动") {  // L5578
                            if (arr[1] == "坐标滑动") {  // L5580
                                if (arr[7] == "1") {  // L5581
                                    j = 代码头部.lastIndexOf("smlMove(qx,qy");  // L5583
                                    if (j < 3) {  // L5584
                                        代码头部 = 代码头部 + "\nfunction smlMove(qx,qy,zx,zy,time){var xxy=[time];var point=[];var dx0={\"x\":qx,\"y\":qy};var dx1={\"x\":random(qx-100,qx+100),\"y\":random(qy,qy+50)};var dx2={\"x\":random(zx-100,zx+100),\"y\":random(zy,zy+50),};var dx3={\"x\":zx,\"y\":zy};for(var i=0;i<4;i++){eval(\"point.push(dx\"+i+\")\")};for(let i=0;i<1;i+=0.08){xxyy=[parseInt(bezierCurves(point,i).x),parseInt(bezierCurves(point,i).y)];xxy.push(xxyy)};gesture.apply(null,xxy)};\n function bezierCurves(cp,t){cx=3.0*(cp[1].x-cp[0].x);bx=3.0*(cp[2].x-cp[1].x)-cx;ax=cp[3].x-cp[0].x-cx-bx;cy=3.0*(cp[1].y-cp[0].y);by=3.0*(cp[2].y-cp[1].y)-cy;ay=cp[3].y-cp[0].y-cy-by;tSquared=t*t;tCubed=tSquared*t;result={\"x\":0,\"y\":0};result.x=(ax*tCubed)+(bx*tSquared)+(cx*t)+cp[0].x;result.y=(ay*tCubed)+(by*tSquared)+(cy*t)+cp[0].y;return result};\n";  // L5585
                                    }
                                    if (!ui["隐藏日志"].isChecked()) {  // L5587
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"开始滑动坐标\");\n";  // L5588
                                    }
                                    a转好的代码前 = a转好的代码前 + "\n " + "smlMove(" + arr[2] + "," + arr[3] + "," + arr[4] + "," + arr[5] + "," + arr[6] + ");";  // L5590
                                    if (!ui["隐藏日志"].isChecked()) {  // L5591
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"滑动坐标完毕\");\n";  // L5592
                                    }
                                } else {
                                    if (!ui["隐藏日志"].isChecked()) {  // L5596
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"开始模拟人手滑动坐标\");\n";  // L5597
                                    }
                                    a转好的代码前 = a转好的代码前 + "\n " + "swipe(" + arr[2] + "," + arr[3] + "," + arr[4] + "," + arr[5] + "," + arr[6] + ");";  // L5599
                                    if (!ui["隐藏日志"].isChecked()) {  // L5600
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"滑动坐标完毕\");\n";  // L5601
                                    }
                                }
                            } else {
                                if (arr[1] == "滑动控件") {  // L5606
                                    if (parseInt(arr[3]) > 0) {  // L5607
                                        aa = parseInt(arr[3]) - 1;  // L5608
                                    } else {
                                        aa = 0;  // L5610
                                    }
                                    if (arr[2] == "上滑或左滑") {  // L5612
                                        if (!ui["隐藏日志"].isChecked()) {  // L5614
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"开始上滑或左滑控件\");\n";  // L5615
                                        }
                                        a转好的代码前 = a转好的代码前 + "\n " + "scrollUp(" + aa + ");";  // L5617
                                        if (!ui["隐藏日志"].isChecked()) {  // L5618
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"滑动完毕\");\n";  // L5619
                                        }
                                    } else {
                                        if (!ui["隐藏日志"].isChecked()) {  // L5627
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"开始下滑或右滑控件\");\n";  // L5628
                                        }
                                        a转好的代码前 = a转好的代码前 + "\n " + "scrollDown(" + aa + ");";  // L5630
                                        if (!ui["隐藏日志"].isChecked()) {  // L5631
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"滑动完毕\");\n";  // L5632
                                        }
                                    }
                                } else {
                                    if (arr[1] == "多指滑动") {  // L5641
                                        if (!ui["隐藏日志"].isChecked()) {  // L5642
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"开始执行多指滑动\");\n";  // L5643
                                        }
                                        手指数 = arrz[i].split("手指");  // L5645
                                        手指代码 = "";  // L5647
                                        if (手指数.length == 2) {  // L5648
                                            新手指代码 = 文本取右边(手指数[1], "|");  // L5650
                                            临时代码 = 新手指代码.split(",");  // L5651
                                            a转好的代码前 = a转好的代码前 + "\n " + "swipe(" + 临时代码[0] + "," + 临时代码[1] + "," + 临时代码[2] + "," + 临时代码[3] + "," + arr[2] + ");";  // L5653
                                            if (!ui["隐藏日志"].isChecked()) {  // L5654
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"滑动坐标完毕\");\n";  // L5655
                                            }
                                        } else {
                                            手指数j = 1;  // L5660
                                            while (手指数j < 手指数.length) {
                                                新手指代码 = 文本取中间(手指数[手指数j], "|", "|");  // L5662
                                                if (新手指代码 == "") {  // L5664
                                                    新手指代码 = 手指数[手指数j];  // L5665
                                                }
                                                手指代码 = 手指代码 + ",[" + 新手指代码 + "]";  // L5668
                                                手指数j++;
                                            }
                                            a转好的代码前 = a转好的代码前 + "\n " + "simpleMultiGesture(" + arr[2] + 手指代码 + ");";  // L5671
                                            if (!ui["隐藏日志"].isChecked()) {  // L5672
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"多指滑动完毕\");\n";  // L5673
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            if (arr[0] == "随机延时") {  // L5680
                                if (arr[1] > 0) {  // L5682
                                    if (!ui["隐藏日志"].isChecked()) {  // L5683
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"执行随机延时\");\n";  // L5684
                                    }
                                    if (arr[1] == arr[2]) {  // L5686
                                        a转好的代码前 = a转好的代码前 + "\n " + "sleep(" + arr[1] + ");";  // L5687
                                    } else {
                                        a转好的代码前 = a转好的代码前 + "\n " + "sleep(random(" + arr[1] + "," + arr[2] + " ));";  // L5689
                                    }
                                    if (!ui["隐藏日志"].isChecked()) {  // L5692
                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"执行随机延时完毕\");\n";  // L5693
                                    }
                                }
                            } else {
                                if (arr[0] == "延时") {  // L5698
                                    if (arr[1] > 0) {  // L5700
                                        if (!ui["隐藏日志"].isChecked()) {  // L5701
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"执行延时\");\n";  // L5702
                                        }
                                        a转好的代码前 = a转好的代码前 + "\n " + "sleep(" + arr[1] + ");";  // L5705
                                        if (!ui["隐藏日志"].isChecked()) {  // L5708
                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"执行延时完毕\");\n";  // L5709
                                        }
                                    }
                                } else {
                                    if (arr[0] == "其他命令") {  // L5714
                                        if (arr[1] == "选择复选框") {  // L5716
                                            if (!ui["隐藏日志"].isChecked()) {  // L5718
                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"开始寻找复选框\");\n";  // L5719
                                            }
                                            a转好的代码前 = a转好的代码前 + "\n " + "className(\"CheckBox\").findOne();";  // L5721
                                            if (!ui["隐藏日志"].isChecked()) {  // L5722
                                                a转好的代码前 = a转好的代码前 + "\n " + "if (className(\"CheckBox\").findOnce(" + arr[2] + ")) {className(\"CheckBox\").findOnce(" + arr[2] + ").click();logWithTime(\"找到并点击完毕。\");} ";  // L5723
                                                a转好的代码前 = a转好的代码前 + "\n else { var object = className(\"CheckBox\").find(); object[object.length - 1].click();logWithTime(\"找到，但数量不足，点击最后一个。\");} ";  // L5724
                                            } else {
                                                a转好的代码前 = a转好的代码前 + "\n " + "if (className(\"CheckBox\").findOnce(" + arr[2] + ")) {className(\"CheckBox\").findOnce(" + arr[2] + ").click();} ";  // L5726
                                                a转好的代码前 = a转好的代码前 + "\n else { var object = className(\"CheckBox\").find(); object[object.length - 1].click();} ";  // L5727
                                            }
                                        } else {
                                            if (arr[1] == "执行返回") {  // L5731
                                                a转好的代码前 = a转好的代码前 + "\n " + "back();";  // L5732
                                                if (!ui["隐藏日志"].isChecked()) {  // L5733
                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"执行返回完毕\");\n";  // L5734
                                                }
                                            } else {
                                                if (arr[1] == "结束执行脚本") {  // L5737
                                                    a转好的代码前 = a转好的代码前 + "\n " + "device.cancelKeepingAwake();logWithTime(\"结束执行脚本\");threads.shutDownAll();";  // L5738
                                                } else {
                                                    if (arr[1] == "执行回到桌面") {  // L5740
                                                        a转好的代码前 = a转好的代码前 + "\n " + "home();";  // L5742
                                                        if (!ui["隐藏日志"].isChecked()) {  // L5743
                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"执行回到桌面\");\n";  // L5744
                                                        }
                                                    } else {
                                                        if (arr[1] == "拉出通知栏") {  // L5748
                                                            a转好的代码前 = a转好的代码前 + "\n " + "notifications();";  // L5749
                                                        } else {
                                                            if (arr[1] == "点亮屏幕") {  // L5751
                                                                a转好的代码前 = a转好的代码前 + "\n " + "device.wakeUpIfNeeded();";  // L5753
                                                            } else {
                                                                if (arr[1] == "打开Activity") {  // L5755
                                                                    a转好的代码前 = a转好的代码前 + "\n " + " app.startActivity({ action: \"View\", packageName: " + arr[2] + ",className: " + arr[3] + "});";  // L5762
                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5763
                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"打开Activity执行完毕\");\n";  // L5764
                                                                    }
                                                                } else {
                                                                    if (arr[1] == "监听系统通知") {  // L5770
                                                                    } else {
                                                                        if (arr[1] == "置剪辑版文本") {  // L5773
                                                                            a转好的代码前 = a转好的代码前 + "\n " + " setClip(arr[2]);";  // L5775
                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5776
                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"执行置剪辑版文本完毕\");\n";  // L5777
                                                                            }
                                                                        } else {
                                                                            if (arr[1] == "监听系统通知并进入") {  // L5781
                                                                            } else {
                                                                                if (arr[1] == "打开链接") {  // L5784
                                                                                    a转好的代码前 = a转好的代码前 + "\n " + " app.startActivity({action: \"android.intent.action.VIEW\",data: \"" + arr[2] + "\" });";  // L5788
                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5791
                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"执行打开链接完毕\");\n";  // L5792
                                                                                    }
                                                                                } else {
                                                                                    if (arr[1] == "用京东app打开链接") {  // L5795
                                                                                        url = "openapp.jdmobile://virtual?params=" + encodeURIComponent("{\"des\":\"m\",\"url\":\"" + arr[2] + "\",\"category\":\"jump\"}");  // L5803
                                                                                        a转好的代码前 = a转好的代码前 + "\n " + " app.startActivity({action: \"android.intent.action.VIEW\",data: \"" + url + "," + "\n " + "packageName: \"com.jingdong.app.mall\"});";  // L5804
                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5805
                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"执行用京东app打开链接完毕\");\n";  // L5806
                                                                                        }
                                                                                    } else {
                                                                                        if (arr[1] == "用淘宝app打开链接") {  // L5809
                                                                                            bpUrl = arr[2].replace("https://", "");  // L5819
                                                                                            bpUrl = bpUrl.replace("http://", "");  // L5820
                                                                                            url = "taobao://" + bpUrl;  // L5821
                                                                                            a转好的代码前 = a转好的代码前 + "\n " + " app.startActivity({action: \"android.intent.action.VIEW\",data: \"" + url + "\" });";  // L5822
                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5823
                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"执行用淘宝app打开链接完毕\");\n";  // L5824
                                                                                            }
                                                                                        } else {
                                                                                            if (arr[1] == "打开app") {  // L5827
                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "if (!launch(\"" + arr[2] + "\")) {if (launchApp(\"" + arr[2] + "\")) {}else { }";  // L5828
                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5829
                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"执行打开app:" + arr[2] + "完毕\");}\n";  // L5830
                                                                                                } else {
                                                                                                    a转好的代码前 = a转好的代码前 + ";}\n";  // L5832
                                                                                                }
                                                                                            } else {
                                                                                                if (arr[1] == "等待某宝支付窗口加载完毕") {  // L5846
                                                                                                    var 输入密码 = 1;  // L5849
                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "text(\"1\").findOne();text(\"2\").findOne();text(\"3\").findOne();";  // L5850
                                                                                                } else {
                                                                                                    if (arr[1] == "指定输入法输入") {  // L5853
                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + " 输入法输入内容(\"" + arr[2] + "\");";  // L5855
                                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5856
                                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"调用输入法输入:" + arr[2] + ",完毕\");\n";  // L5857
                                                                                                        }
                                                                                                    } else {
                                                                                                        if (arr[1] == "粘贴") {  // L5861
                                                                                                            if (arr[2] == "") {  // L5862
                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + " inputManager.paste();";  // L5863
                                                                                                            } else {
                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + " setClip(\"" + arr[2] + "\");sleep(50);inputManager.paste();";  // L5865
                                                                                                            }
                                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5868
                                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"执行粘贴完毕:" + arr[2] + "\");\n";  // L5869
                                                                                                            }
                                                                                                        } else {
                                                                                                            if (arr[1] == "输入") {  // L5873
                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + " if (setText(" + arr[2] + ", \"" + arr[3] + "\"))";  // L5881
                                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5882
                                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"执行输入:" + arr[3] + ",完毕\");\n";  // L5883
                                                                                                                }
                                                                                                            } else {
                                                                                                                if (arr[1] == "等待音量+被按下") {  // L5892
                                                                                                                    j = 代码头部.lastIndexOf("音量加被按下");  // L5893
                                                                                                                    if (j < 1) {  // L5894
                                                                                                                        代码头部 = 代码头部 + "var 音量加被按下 = false;";  // L5895
                                                                                                                    }
                                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + "音量加被按下 = false; while (true) {if (音量加被按下) { break; } else {sleep(10);} };";  // L5897
                                                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5898
                                                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"音量+被按下\");\n";  // L5899
                                                                                                                    }
                                                                                                                } else {
                                                                                                                    if (arr[1] == "等待音量-被按下") {  // L5902
                                                                                                                        j = 代码头部.lastIndexOf("音量减被按下");  // L5903
                                                                                                                        if (j < 1) {  // L5904
                                                                                                                            代码头部 = 代码头部 + "var 音量减被按下 = false;";  // L5905
                                                                                                                        }
                                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "音量减被按下 = false; while (true) {if (音量减被按下) { break; } else {sleep(10);} };";  // L5908
                                                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5909
                                                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"音量-被按下\");\n";  // L5910
                                                                                                                        }
                                                                                                                    } else {
                                                                                                                        if (arr[1] == "解除热门app限制") {  // L5913
                                                                                                                            a转好的代码前 = a转好的代码前 + " limit();\n ";  // L5915
                                                                                                                        } else {
                                                                                                                            if (arr[1] == "添加悬浮按钮并等待被按下") {  // L5918
                                                                                                                                j = 代码头部.lastIndexOf("on 显示用户悬浮按钮");  // L5919
                                                                                                                                if (j < 3) {  // L5920
                                                                                                                                    代码头部 = 代码头部 + "function 显示用户悬浮按钮(){threads.start(function(){var window1=floaty.window(<button id=\"action\"text=\"{{xsnr}}\"alpha=\"0.7\"textColor=\"red\"/>);var zjdbt=window1.action.text();setInterval(()=>{},1000);var execution=null;var x=0,y=0;var window1X,window1Y;window1.action.setOnTouchListener(function(view,event){switch(event.getAction()){case event.ACTION_DOWN:x=event.getRawX();y=event.getRawY();window1X=window1.getX();window1Y=window1.getY();return true;case event.ACTION_MOVE:window1.setPosition(window1X+(event.getRawX()-x),window1Y+(event.getRawY()-y));return true;case event.ACTION_UP:if(Math.abs(event.getRawY()-y)<10&&Math.abs(event.getRawX()-x)<10){if(window1.action.text()==zjdbt){被按下名称=window1.action.text();window1.close()}};return true}return true});window1.setPosition(悬浮x,悬浮y);sleep(10);按钮创建完毕=true})};";  // L5921
                                                                                                                                }
                                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + "while (!按钮创建完毕) {sleep(random(10, 100));};按钮创建完毕 = false;xsnr =\"" + arr[2] + "\";悬浮x = " + arr[3] + ";悬浮y =" + arr[4] + ";";  // L5925
                                                                                                                                a转好的代码前 = a转好的代码前 + "显示用户悬浮按钮();while (true) {if (被按下名称 == \"" + arr[2] + "\") { break; } else {sleep(10); }; };\n ";  // L5926
                                                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5927
                                                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"悬浮窗" + arr[2] + "被按下\");\n";  // L5928
                                                                                                                                }
                                                                                                                            } else {
                                                                                                                                if (arr[1] == "导入js文件") {  // L5932
                                                                                                                                    drnr = files.read("/sdcard/脚本/" + arr[2]);  // L5933
                                                                                                                                    j = drnr.lastIndexOf("\"ui\"");  // L5934
                                                                                                                                    if (j < 33) {  // L5935
                                                                                                                                        a转好的代码前 = a转好的代码前 + "\n engines.execScriptFile(\"/sdcard/脚本/" + arr[2] + "\")\n ";  // L5936
                                                                                                                                    } else {
                                                                                                                                        a转好的代码前 = a转好的代码前 + "\n" + drnr + "\n ";  // L5939
                                                                                                                                    }
                                                                                                                                } else {
                                                                                                                                    if (arr[1] == "设置全局变量") {  // L5944
                                                                                                                                        用户全局代码 = 用户全局代码 + ";" + arr[2] + ";";  // L5945
                                                                                                                                    } else {
                                                                                                                                        if (arr[1] == "执行js代码") {  // L5950
                                                                                                                                            a转好的代码前 = a转好的代码前 + "\n" + arr[2] + "\n ";  // L5951
                                                                                                                                            if (!ui["隐藏日志"].isChecked()) {  // L5952
                                                                                                                                                a转好的代码前 = a转好的代码前 + "logWithTime(\"执行自定义js代码完毕\");\n";  // L5953
                                                                                                                                            }
                                                                                                                                        } else {
                                                                                                                                            if (arr[1] == "循环开始") {  // L5956
                                                                                                                                                var 已添加循环次数 = 已添加循环次数 + 1;  // L5958
                                                                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5959
                                                                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"循环开始\");\n";  // L5960
                                                                                                                                                }
                                                                                                                                                a转好的代码前 = a转好的代码前 + "\n " + " var 循环变量" + 已添加循环次数 + "=0;while (" + " 循环变量" + 已添加循环次数 + "<" + arr[2] + ") { 循环变量" + 已添加循环次数 + "++;\n";  // L5962
                                                                                                                                            } else {
                                                                                                                                                if (arr[1] == "循环结束") {  // L5968
                                                                                                                                                    a转好的代码前 = a转好的代码前 + "\n " + " }";  // L5970
                                                                                                                                                    if (!ui["隐藏日志"].isChecked()) {  // L5971
                                                                                                                                                        a转好的代码前 = a转好的代码前 + "logWithTime(\"循环结束\");\n";  // L5972
                                                                                                                                                    }
                                                                                                                                                } else {
                                                                                                                                                    if (arr[1] == "跳出循环") {  // L5976
                                                                                                                                                        if (!ui["隐藏日志"].isChecked()) {  // L5977
                                                                                                                                                            a转好的代码前 = a转好的代码前 + "logWithTime(\"跳出循环\");\n";  // L5978
                                                                                                                                                        }
                                                                                                                                                        a转好的代码前 = a转好的代码前 + "\n " + "break;\n";  // L5980
                                                                                                                                                    } else {
                                                                                                                                                        if (arr[1] == "设置找字app") {  // L5985
                                                                                                                                                            if (arr[2] == "所有") {  // L5989
                                                                                                                                                                代码头部 = 代码头部 + "  auto.setWindowFilter(function(window){return true;});";  // L5990
                                                                                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L5991
                                                                                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"设置找字范围为：所有\");\n";  // L5992
                                                                                                                                                                }
                                                                                                                                                            } else {
                                                                                                                                                                jjj = arr[2].replace("，", ",");  // L6007
                                                                                                                                                                j = jjj.lastIndexOf(",");  // L6008
                                                                                                                                                                插入的内容 = "auto.setWindowFilter(function (window) {";  // L6009
                                                                                                                                                                if (j > 0) {  // L6010
                                                                                                                                                                    zszz = jjj.split(",");  // L6011
                                                                                                                                                                    for (var iq = 0; iq < zszz.length - 1; iq++) {
                                                                                                                                                                        插入的内容 = "if(window.title ==  \"" + zszz[iq] + "\"){return true}else {";  // L6013
                                                                                                                                                                    }
                                                                                                                                                                    插入的内容 = 插入的内容 + "}  return false; });";  // L6015
                                                                                                                                                                } else {
                                                                                                                                                                    插入的内容 = " return window.title == \"" + arr[2] + "\" });";  // L6018
                                                                                                                                                                }
                                                                                                                                                                代码头部 = 代码头部 + 插入的内容;  // L6020
                                                                                                                                                                if (!ui["隐藏日志"].isChecked()) {  // L6022
                                                                                                                                                                    a转好的代码前 = a转好的代码前 + "logWithTime(\"设置找字范围为：" + arr[2] + "\");\n";  // L6023
                                                                                                                                                                }
                                                                                                                                                            }
                                                                                                                                                        }
                                                                                                                                                    }
                                                                                                                                                }
                                                                                                                                            }
                                                                                                                                        }
                                                                                                                                    }
                                                                                                                                }
                                                                                                                            }
                                                                                                                        }
                                                                                                                    }
                                                                                                                }
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        if (arr[0] == "否则执行") {  // L6036
                                            a转好的代码前 = a转好的代码前 + "}else{";  // L6037
                                        } else {
                                            if (arr[0] == "结束判断") {  // L6039
                                                a转好的代码前 = a转好的代码前 + "};";  // L6040
                                            } else {
                                                if (arr[0] == "创建子线程") {  // L6042
                                                    a转好的代码前 = a转好的代码前 + "\n已完成线程数 = 已完成线程数-1;threads.start(function () {\n\n var ii999=0; for (ii999 = 0; ii999 < " + arr[1] + "; ii999++) {";  // L6043
                                                } else {
                                                    if (arr[0] == "子线程结束") {  // L6045
                                                        a转好的代码前 = a转好的代码前 + " };  \n已完成线程数 = 已完成线程数 + 1;log(\"子线程执行完毕！\");;if (已完成线程数 == " + 总线程数 + ") {log(\"所有线程执行完毕！\");" + 代码尾部 + ";device.cancelKeepingAwake();if(!yhjsjb){events.broadcast.emit(\"hello\", \"执行完毕\")};threads.shutDownAll();}});\n";  // L6046
                                                    } else {
                                                        if (arr[0] == "执行js代码") {  // L6048
                                                            a转好的代码前 = a转好的代码前 + "\n" + arr[1] + "\n ";  // L6050
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (线程需循环次数 > 1) {  // L6058
                a转好的代码前 = a转好的代码前 + "} ";
            }
            a转好的代码前 = a转好的代码前 + "\n " + "已完成线程数 = 已完成线程数 + 1;if (已完成线程数 == " + 总线程数 + ") {log(\"所有线程执行完毕！\");" + 代码尾部 + ";device.cancelKeepingAwake();if(!yhjsjb){events.broadcast.emit(\"hello\", \"执行完毕\")};threads.shutDownAll();}else {log(\"" + String(线程号) + "号线程执行完毕！\")}";  // L6059
            总代码 = 总代码 + "\n " + a转好的代码前 + a转好的代码后 + "\n";  // L6076
            线程索引 = 线程索引 + 1;  // L6078
        }
    }
    if (!ui["隐藏日志"].isChecked()) {  // L6083
        代码头部 = 代码头部 + tishishijian + "\n ";  // L6084
        if (所有线程数量 > 0) {  // L6085
            var 提示步骤 = "共" + 所有线程数量 + "个主线程。";  // L6087
        }
        提示步骤 = "log(\"" + 提示步骤 + "线程步骤共" + 所有线程步骤 + "步。\");";  // L6089
        代码头部 = 代码头部 + 提示步骤 + "\n ";  // L6091
    }
    代码头部 = 代码头部 + "\n" + 用户全局代码 + " \nfunction 输入法输入内容(text) {  let b64 = java.util.Base64.getEncoder()\n .encodeToString(new java.lang.String(text).getBytes(\"UTF-8\"));let i = new Intent();  i.setAction(\"ADB_INPUT_B64\");i.putExtra(\"msg\", b64); context.sendBroadcast(i);};";  // L6096
    代码头部 = 代码头部 + "\n;var kszx=false,yhjsjb=false,运行中=0;\n" + "function guangbo(){events.on(\"jiaobenkgz\",function(words){if(words==\"开始执行\"&&已开始执行==0){已开始执行=1;zxc()}else if(words==\"关闭提示框\"){console.hide()}else{logWithTime(words)}});setInterval(()=>{},1000)};";  // L6097
    代码头部 = 代码头部 + ";guangbo();" + "function logWithTime(msg){console.log(formatDate(getNow())+\" \"+msg)};function formatDate(needTime){var time=new Date(parseInt(needTime));var h=time.getHours();var mm=time.getMinutes();var s=time.getSeconds();var ms=time.getMilliseconds();return add0(h)+':'+add0(mm)+':'+add0(s)+':'+ms};";  // L6098
    代码头部 = 代码头部 + "function add0(m){return m<10?'0'+m:m};events.broadcast.emit(\"hello\", \"开始执行\");function getScreenCapture(){let Thread=threads.start(function(){if(auto.service!=null){let Allow=textMatches(/(允许|立即开始|统一)/).findOne(10*1000);if(Allow){Allow.click()}}});if(!requestScreenCapture()){return false}else{Thread.interrupt();return true}};";  // L6099
    代码头部 = 代码头部 + "function clickButton(button) {if (button.clickable()) {  button.click();    } else { var bounds = button.bounds(); click(random(bounds.left, bounds.right), random(bounds.top, bounds.bottom));}};\n ";  // L6100
    代码头部 = 代码头部 + "threads.start(function () {  var window2 = floaty.window(      <button id=\"action\" text=\"\" alpha=\"1\"  h=\"1\" w=\"1\" textColor=\"red\" />  );  ; setInterval(() => { }, 1000);var execution = null; window2.setPosition(device.height, device.height);});\n ";  // L6101
    代码头部 = 代码头部 + "\nfunction multiPointGesture(duration, fingers) {  if (!fingers || fingers.length === 0) {toast(\"❌ 没有手指轨迹数据\");return false;  } var gestureArgs = [duration];  for (var i = 0; i < fingers.length; i++) {var finger = fingers[i];var points = [];points.push(finger.start[0], finger.start[1]);   if (finger.middle && finger.middle.length > 0) {for (var j = 0; j < finger.middle.length; j++) {points.push(finger.middle[j][0], finger.middle[j][1]);  }  } points.push(finger.end[0], finger.end[1]); gestureArgs.push(points);  }\n  try { gesture.apply(null, gestureArgs);return true; } catch (e) {     log(\"❌ 手势执行失败: \" + e);return false; }}\n function simpleMultiGesture(duration) {var fingers = []; for (var i = 1; i < arguments.length; i++) {       var track = arguments[i];    if (!track || track.length < 4) {continue;     } ;  var finger = {start: [track[0], track[1]],  middle: [],  end: [track[track.length - 2], track[track.length - 1]] }; if (track.length > 4) {  for (var j = 2; j < track.length - 2; j += 2) {finger.middle.push([track[j], track[j + 1]]);}} fingers.push(finger);  } return multiPointGesture(duration, fingers);}";  // L6102
    代码头部 = 代码头部 + "\nevents.on(\"say\", function(words){if(words == \"音量减被按下\") { log(\"音量减被按下\");if(运行中==0){zxc()}else{toast(\"已停止运行执行中的任务！\");floaty.closeAll();console.hide();;device.cancelKeepingAwake();;exit()};;}else if (words == \"停止运行\") {toast(\"已停止运行执行中的任务！\");floaty.closeAll();console.hide();;device.cancelKeepingAwake();;exit()};;});setInterval(()=>{}, 1000);";  // L6126
    总代码 = 代码头部 + "\nfunction getNow(){var now=new Date().getTime();return now-wlsjc};\n   console.show(); function zxc() { \n if(运行中==0){ 运行中=1;\n " + 用户全局代码 + "\n " + 总代码 + " \n } }; ";  // L6127
    e = engines.execScript("hello world", 总代码);  // L6131
    开启监听按键();  // L6139
    return;
}

function 开启监听按键() {  // L6141
    if (已开启监听按键 == false) {  // L6143
        events.observeKey();  // L6144
        events.onKeyDown("volume_up", function(event) {
        音量加被按下 = true;  // L6147
        event.preventDefault();  // L6149
        if (getNow() - 上次音量加被按下时间 < 2000) {  // L6150
            if (ui.runSrt.getText() == "开始运行") {  // L6152
            } else {
                e.getEngine().emit("say", "停止运行");  // L6155
                toast("已停止运行执行中的任务！");  // L6156
            }
        }
        var 上次音量加被按下时间 = getNow();  // L6169
        return;
    });  // L6146
        events.onKeyDown("volume_down", function(event) {
        音量减被按下 = true;  // L6173
        if (ui.runSrt.getText() == "开始运行") {  // L6174
        } else {
            e.getEngine().emit("say", "音量减被按下");  // L6177
        }
        return;
    });  // L6171
        已开启监听按键 = true;  // L6189
    }
    return;  // L6190
}

function guangbo() {
    events.on("jiaobenkgz", function(words) {
    if (words == "开始执行" && 已开始执行 == 0) {  // L6203
        var 已开始执行 = 1;  // L6204
        zxc();  // L6205
    } else {
        if (words == "关闭提示框") {  // L6206
            console.hide();  // L6207
        } else {
            if (!ui["隐藏日志"].isChecked()) {  // L6209
                logWithTime(words);  // L6210
            }
        }
    }
    return;  // L6211
});  // L6202
    setInterval(function() {
    return;  // L6218
}, 1000);  // L6218
    return;
}

function shurumima() {  // L6219
    if (mima == "0") {  // L6222
        sleep(10);
        (className("android.widget.TextView").text("0").findOne().click());
    } else {
        if (mima == "1") {  // L6223
            sleep(10);
            (className("android.widget.TextView").text("1").findOne().click());
        } else {
            if (mima == "2") {  // L6224
                sleep(10);
                (className("android.widget.TextView").text("2").findOne().click());
            } else {
                if (mima == "3") {  // L6225
                    sleep(10);
                    (className("android.widget.TextView").text("3").findOne().click());
                } else {
                    if (mima == "4") {  // L6226
                        sleep(10);
                        (className("android.widget.TextView").text("4").findOne().click());
                    } else {
                        if (mima == "5") {  // L6227
                            sleep(10);
                            (className("android.widget.TextView").text("5").findOne().click());
                        } else {
                            if (mima == "6") {  // L6228
                                sleep(10);
                                (className("android.widget.TextView").text("6").findOne().click());
                            } else {
                                if (mima == "7") {  // L6229
                                    sleep(10);
                                    (className("android.widget.TextView").text("7").findOne().click());
                                } else {
                                    if (mima == "8") {  // L6230
                                        sleep(10);
                                        (className("android.widget.TextView").text("8").findOne().click());
                                    } else {
                                        if (mima == "9") {  // L6231
                                            sleep(10);
                                            (className("android.widget.TextView").text("9").findOne().click());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return;
}

var 输入密码 = 0;  // L6235
var qqkey = "";
var 已本点击 = false;  // L6237
function 激活隐藏功能() {
    threads.start(function() {
    if (已本点击 == false) {  // L6241
        var 已本点击 = true;  // L6242
        var cscs = a取时间检验码();  // L6244
        var yzm = new Date().getTime() + wlsjc;  // L6246
        var url = CF服务器 + "/lx=26?IMEI=" + IMEI + "&sg=" + cscs + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId + "&token=" + CF令牌 + "&app=" + CF应用标识;  // L6247
        var res = http.post(url, {lx: "26", IMEI: IMEI, password: yzm}, {headers: CF请求头()});  // L6248
        var sqnr = res.body.string();  // L6253
        if (sqnr.lastIndexOf("<ok>") > -1) {  // L6255
            激活dialog = dialogs.build({title: 文本取中间(sqnr, "<ok>", "<"), inputPrefill: "", positive: "确定", negative: "获取激活码"}).on("input", function(input) {
            if (input == "0" || input == "") {  // L6264
                isExist = files.isFile("/sdcard/djqjhm.txt");  // L6265
                if (isExist) {  // L6266
                    input = files.read("/sdcard/djqjhm.txt");  // L6267
                } else {
                    input = "0";  // L6270
                }
            }
            xjhm = input;  // L6273
            if (parseInt(xjhm) > -1) {  // L6274
                var cscs = a取时间检验码();  // L6275
                yzm = new Date().getTime();  // L6276
                url = CF服务器 + "/lx=28?IMEI=" + IMEI + "&sg=" + cscs + "&ys=" + xjhm + "&password=" + yzm + "&bbh=" + bbh + "&id=" + yourId + "&token=" + CF令牌 + "&app=" + CF应用标识;  // L6277
                res = http.get(url, {headers: CF请求头()}).body.string();  // L6283
                sqnr = res;  // L6285
                j = sqnr.lastIndexOf("<ok>");  // L6286
                if (j > -1) {  // L6287
                    if (sqnr.substr(35, 8) == a取时间检验码(true)) {  // L6289
                        a到期时间 = sqnr.substr(16, 13);  // L6290
                        storage.put("a到期时间", a到期时间);  // L6291
                        if (parseInt(a到期时间) > getNow()) {  // L6292
                            storage.put("到期时间", a到期时间);  // L6293
                            storage.put("ycms", sqnr.substr(13, 3));  // L6294
                            storage.put("a激活方式", sqnr.substr(10, 1));  // L6295
                            d1 = new Date(parseInt(a到期时间)).toLocaleString().replace(/:\d{1,2}$/, " ");  // L6296
                            alert("新功能激活完成，到期时间：" + d1);  // L6297
                            storage.put("v几", 文本取中间(sqnr, "<v>", "<"));  // L6298
                            storage.put("xym", 文本取左边(sqnr.substr(56), "<"));  // L6300
                        } else {
                            toast("内测功能已到期，请重新激活");  // L6303
                        }
                    }
                } else {
                    if (sqnr.lastIndexOf("<jhm>") > -1) {  // L6310
                        jhm = 文本取中间(sqnr, "<jhm>", "</jhm>");  // L6311
                        if (jhm != "") {  // L6312
                            files.write("/sdcard/djqjhm.txt", jhm);  // L6313
                            if (sqnr.lastIndexOf("<ts>") > -1) {  // L6314
                                jhm = 文本取中间(sqnr, "<ts>", "</ts>");  // L6315
                                alert(jhm);  // L6316
                            } else {
                                alert("您的信息已记录，可以卸载后，安装新版可以自动激活或者重启软件会重新激活内测功能。");  // L6318
                            }
                            storage.put("a激活方式", "0");  // L6322
                            storage.put("a到期时间", "111111");  // L6323
                        }
                    } else {
                        if (sqnr.lastIndexOf("<sb>") > -1) {  // L6326
                            alert(文本取中间(sqnr, "<sb>", "<"));  // L6328
                        } else {
                            toast("未知错误");  // L6331
                        }
                    }
                }
                if (sqnr.lastIndexOf("<ts>") > -1) {  // L6333
                    jhm = 文本取中间(sqnr, "<ts>", "</ts>");  // L6334
                    alert(jhm);  // L6335
                }
            } else {
                toast("您输入的内容不支持。");  // L6340
            }
            return;
        }).on("negative", function() {
            try {  // L6343
                ui.run(function() {
        app.openUrl("https://docs.qq.com/doc/DVkZkVnJ2Z1ZqZm55");  // L6345
        return;
    });  // L6344
            } catch (e) {
                toast("调用浏览器打开报错了，看看使用说明能不能打开，里面也有激活说明。");  // L6348
            }
            return;
        }).show();  // L6357
        }
        if (sqnr.lastIndexOf("<sb>") > -1) {  // L6362
            alert(文本取中间(sqnr, "<sb>", "<"));  // L6363
        }
        已本点击 = false;  // L6365
    }
    return;
});  // L6239
    return;
}

function a取时间检验码(验证检验码) {  // L6370
    d = new Date(new Date().getTime() - wlsjc);  // L6375
    秒 = d.getSeconds();  // L6376
    if (验证检验码 == false) {  // L6377
        if (秒 == 30) {  // L6378
            sleep(1200);  // L6379
            d = new Date(new Date().getTime() - wlsjc);  // L6380
            秒 = d.getSeconds();  // L6381
        }
    }
    分 = d.getMinutes();  // L6386
    时 = d.getHours();  // L6387
    秒 = d.getSeconds();  // L6388
    if (秒 > 30) {  // L6390
        秒 = 30;  // L6391
    } else {
        秒 = 10;  // L6393
    }
    月 = d.getMonth() + 1;  // L6395
    日 = d.getDate();  // L6396
    cs = 日.toString() + 时.toString() + 分.toString() + 秒.toString();  // L6397
    cs = cs * 36 + 36522;  // L6399
    cs = md5(cs);  // L6401
    cs = cs.substr(0, 8);  // L6403
    return cs;  // L6406
}

function md5(string) {
    md = java.security.MessageDigest.getInstance("MD5");  // L6409
    md.update(java.lang.String(string).getBytes("UTF-8"));  // L6410
    return byteArrayToHexString(md.digest());  // L6412
}

function byteArrayToHexString(bytes) {
    val = "";  // L6415
    for (i = 0; i < bytes.length; i++) {
        tmp = bytes[i];  // L6417
        if (tmp < 0) {  // L6418
            tmp = 256 + tmp;  // L6419
        }
        tmp = tmp.toString(16);  // L6421
        if ((tmp + "").length == 1) {  // L6422
            tmp = "0" + tmp;  // L6423
        }
        val = val + tmp;  // L6425
    }
    return val;  // L6427
}

var fzsm = dialogs.build({title: "免责声明：", content: "此程序无窃取用户的私人信息或者密码等的后台代码，是为了研究js，帮助操作不便的朋友编写，仅用于技术交流！一切后果自理。", positive: "同意协议", neutral: "不同意"}).on("positive", function() {
    storage.put("同意协议", "同意协议");  // L6444
    return;
}).on("neutral", function() {
    ui.finish();  // L6447
    return;
});  // L6429
xyz();  // L6451
var qybyjh = false;  // L6452
var IMEI = device.getAndroidId();  // L6453
threads.start(function() {
    // === 第 0 步: 悬浮窗授权(新装首次必须先授权; 授权完成后才进入激活流程) ===
    var 授权轮次 = 0;
    while (!floaty.checkPermission()) {
        if (授权轮次 >= 5) {
            ui.run(function() {
            toast("未授予悬浮窗权限, 软件无法使用。请到系统设置中开启悬浮窗后重新打开软件。");
            });
            return;
        }
        授权轮次++;
        ui.run(function() {
        toast("请先授予悬浮窗权限(将跳转到系统授权页), 授权后会自动返回本软件");
        });
        floaty.requestPermission();
        var 等待次数 = 0;
        while (!floaty.checkPermission() && 等待次数 < 40) {  // 最多等待 20 秒
            sleep(500);
            等待次数++;
        }
    }

    // === 第一步: 激活校验(必须最先执行, 不依赖免责声明/公告/网络校时等任何前置步骤) ===
    var key1 = objj["点击器显示内容"];  // L6532
    if (key1 != "" && key1 != null) {  // L6533
        ui.run(function() {
        ui.qqq.setText(key1);  // L6535
        return;
    });  // L6534
    }
    var qqkey = objj.yxjhdjq;  // L6539
    if (qqkey == "1" && qybyjh == true) {  // L6540
        激活 = true;  // L6541
        var daske = false;  // L6542
    }
    qqkey = objj.qqkey;  // L6545
    key1 = objj.jgsj;  // L6546
    if (objj.yxjs == "1") {  // L6553
        var msg = http.get(服务器地址 + "/update/yxjs.js?token=" + CF令牌, {headers: CF请求头()}).body.string();  // L6555
        var j = msg.lastIndexOf("执行");  // L6556
        if (j > 3) {  // L6557
            engines.execScript("main", msg);  // L6558
        }
        return;  // L6561
    }
    return;  // L6573
});  // L6455
ui["反馈"].on("click", function() {
    threads.start(function() {
    a反馈();  // L6579
    return;
});  // L6578
    return;
});  // L6577
function a反馈() {
    jhm = rawInput("输入您想要反馈的内容，可以是bug，或者需求！", "");  // L6584
    if (jhm == null || jhm == "") {  // L6586
        return;  // L6587
    }
    url = CF服务器 + "/fk.php?rjm=点击器&nr=" + encodeURIComponent(jhm) + "&IMEI=" + IMEI + "&bbh=" + bbh + "&token=" + CF令牌;  // L6593
    res = http.post(url, {rjm: "hdzs", nr: jhm, IMEI: IMEI}, {headers: CF请求头()});  // L6595
    sqnr = res.body.string();  // L6600
    j = sqnr.lastIndexOf("1");  // L6603
    if (j == 0) {  // L6605
        alert("已发送成功");  // L6607
    } else {
        j = sqnr.lastIndexOf("收到");  // L6609
        if (j > -1) {  // L6610
            alert(sqnr);  // L6611
        } else {
            alert("已发送,但服务器好像有点问题，可能未反馈成功，请换个时间再试。");  // L6613
        }
    }
    return;
}

var key1 = "1";  // L6619
function 检测更新() {
    res = http.get(服务器地址 + "/update/djq.html?IMEI=" + IMEI + "&bbh=" + bbh + "&token=" + CF令牌, {headers: CF请求头()}).body.string();  // L6695
    倒计时秒数 = 文本取中间(res, "<djs>", "</djs>");  // L6697
    if (倒计时秒数 != "") {  // L6699
        storage.put("倒计时秒数", 倒计时秒数);  // L6700
    }
    提示内容 = 文本取中间(res, "<tishiyu>", "</tishiyu>");  // L6702
    if (提示内容 != "") {  // L6703
        storage.put("提示内容", 提示内容);  // L6704
    }
    mani版本号 = parseInt(文本取中间(res, "<main>", "</main>"));  // L6708
    if (mani版本号 > parseInt(storage.get("main版本号", "100"))) {  // L6709
        msg = http.get(服务器地址 + "/gx/main.snapshot?token=" + CF令牌, {headers: CF请求头()}).body.bytes();  // L6710
        codePath = engines.myEngine().cwd() + "/main.snapshot";  // L6711
        files.writeBytes(codePath, msg);  // L6712
    }
    更新提示内容 = 文本取中间(res, "<gxts>", "</gxts>");  // L6714
    新版本号 = parseInt(文本取中间(res, "<djq>", "</djq>"));  // L6715
    fwqbb = storage.get("跳过版本号", bbh);  // L6716
    if (新版本号 > fwqbb) {  // L6717
        clear = confirm("有新版 需要更新吗？", 更新提示内容);  // L6718
        if (clear) {  // L6719
            msg = http.get(服务器地址 + "/gx/zhu.snapshot?token=" + CF令牌, {headers: CF请求头()}).body.bytes();  // L6720
            codePath = engines.myEngine().cwd() + "/zhu.snapshot";  // L6721
            files.writeBytes(codePath, msg);  // L6722
            alert("更新完成\n\n请重启软件，如果报错，则重置软件，或群文件下载安装包…");  // L6725
        } else {
            if (新版本号 - bbh > 文本取中间(res, "<zdbb>", "</zdbb>")) {  // L6729
                ui.finish();  // L6730
            } else {
                storage.put("跳过版本号", 新版本号);  // L6732
            }
        }
    }
    return;
}

function xyz() {
    if (storage.get("xym")) {  // L6747
        var yourId = storage.get("设备id");  // L6748
        zhi = yourId.substr(3, 5) * 3;  // L6750
        if (zhi == storage.get("xym")) {  // L6753
            var daske = false;  // L6754
        } else {
            daske = true;  // L6756
        }
    } else {
        daske = true;  // L6760
    }
    return;
}

if (!files.isDir("/sdcard/auscript/")) {  // L6768
    files.create("/sdcard/auscript/");  // L6769
}
var 激活 = false;  // L6795
var 检测更新完毕 = false;
var yourId = random(10000000000, 90000000000).toString();  // L6796
storage.put("设备id", yourId);  // L6797

// 每次启动联网校验激活状态(lx=29). 返回 valid / revoked / expired / invalid / netfail


function a反馈() {
    jhm = rawInput("输入您想要反馈的内容，可以是bug，或者需求！", "");  // L7074
    if (jhm == null || jhm == "") {  // L7076
        return;  // L7077
    }
    url = CF服务器 + "/fk.php?rjm=点击器&nr=" + encodeURIComponent(jhm) + "&IMEI=" + IMEI + "&bbh=" + bbh + "&token=" + CF令牌;  // L7083
    res = http.post(url, {rjm: "hdzs", nr: jhm, IMEI: IMEI}, {headers: CF请求头()});  // L7085
    sqnr = res.body.string();  // L7090
    j = sqnr.lastIndexOf("1");  // L7091
    if (j == 0) {  // L7093
        alert("已发送成功");  // L7095
    } else {
        j = sqnr.lastIndexOf("收到");  // L7097
        if (j > -1) {  // L7098
            alert(sqnr);  // L7099
        } else {
            alert("已发送,但服务器好像有点问题，可能未反馈成功，请换个时间再试。或直接联系qq：767187006");  // L7101
        }
    }
    return;
}

function randomId(randomFlag, min, max) {  // L7105
    str = "";  // L7113
    range = min;
    arr = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    if (randomFlag) {  // L7117
        range = Math.round(Math.random() * (max - min)) + min;  // L7118
    }
    for (i = 0; i < range; i++) {
        var pos = Math.round(Math.random() * (arr.length - 1));  // L7121
        str = str + arr[pos];  // L7122
    }
    return str;  // L7124
}

function 悬浮时间() {
    var xc_xfsj = threads.start(function() {
    sleep(200);  // L7130
    var window2 = floaty.window(new XML(<frame gravity="center">
                <text id="text" textSize="22sp" textColor="#f44336" />
                {}
            </frame>));  // L7131
    window2.text.click(function() {
    window2.setAdjustEnabled(!window2.isAdjustEnabled());  // L7139
    return;
});  // L7138
    window2.setPosition(device.width * 0.2, 50);  // L7141
    悬浮时钟停止 = 0;  // L7142
    var str = formatDate(getNow()).toString();  // L7143
    str = str.substr(9, 3);  // L7144
    var aaaa = 990 - parseInt(str);  // L7145
    if (aaaa > 0) {  // L7146
        sleep(aaaa);  // L7147
    }
    var zzz = setInterval(function() {
    ui.run(function() {
    str = formatDate(getNow());  // L7152
    str = str.substr(0, 10);  // L7153
    window2.text.setText(str);  // L7154
    return;
});  // L7151
    if (悬浮时钟停止 == 1) {  // L7157
        clearInterval(zzz);  // L7158
    }
    return;
}, 100);  // L7150
    return;
});  // L7129
    return;
}

var 已解除 = false;  // L7166
function limit() {
    importClass(com.stardust.autojs.core.accessibility.AccessibilityBridge.WindowFilter);  // L7170
    var bridge = runtime.accessibilityBridge;  // L7171
    var bridgeField = runtime.getClass().getDeclaredField("accessibilityBridge");  // L7172
    var configField = bridgeField.getType().getDeclaredField("mConfig");  // L7173
    configField.setAccessible(true);  // L7174
    configField.set(bridge, configField.getType().newInstance());  // L7175
    bridge.setWindowFilter(new JavaAdapter(AccessibilityBridge$WindowFilter, {filter: function(info) {
    if (szzzfw == "1") {  // L7178
        if (info.focused == false) {  // L7179
            return false;  // L7180
        } else {
            return true;  // L7182
        }
    } else {
        if (info.title != szzzfw) {  // L7185
            return false;  // L7186
        } else {
            return true;  // L7188
        }
    }
    return;
}}));  // L7176
    return;
}

function 显示按钮啦() {  // L7196
    var 按钮x = device.width * 0.2;  // L7199
    var 按钮y = device.height * 0.33;  // L7200
    threads.start(function() {
    var zhunxin = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABGdBTUEAALGPC/xhBQAACklpQ0NQc1JHQiBJRUM2MTk2Ni0yLjEAAEiJnVN3WJP3Fj7f92UPVkLY8LGXbIEAIiOsCMgQWaIQkgBhhBASQMWFiApWFBURnEhVxILVCkidiOKgKLhnQYqIWotVXDjuH9yntX167+3t+9f7vOec5/zOec8PgBESJpHmomoAOVKFPDrYH49PSMTJvYACFUjgBCAQ5svCZwXFAADwA3l4fnSwP/wBr28AAgBw1S4kEsfh/4O6UCZXACCRAOAiEucLAZBSAMguVMgUAMgYALBTs2QKAJQAAGx5fEIiAKoNAOz0ST4FANipk9wXANiiHKkIAI0BAJkoRyQCQLsAYFWBUiwCwMIAoKxAIi4EwK4BgFm2MkcCgL0FAHaOWJAPQGAAgJlCLMwAIDgCAEMeE80DIEwDoDDSv+CpX3CFuEgBAMDLlc2XS9IzFLiV0Bp38vDg4iHiwmyxQmEXKRBmCeQinJebIxNI5wNMzgwAABr50cH+OD+Q5+bk4eZm52zv9MWi/mvwbyI+IfHf/ryMAgQAEE7P79pf5eXWA3DHAbB1v2upWwDaVgBo3/ldM9sJoFoK0Hr5i3k4/EAenqFQyDwdHAoLC+0lYqG9MOOLPv8z4W/gi372/EAe/tt68ABxmkCZrcCjg/1xYW52rlKO58sEQjFu9+cj/seFf/2OKdHiNLFcLBWK8ViJuFAiTcd5uVKRRCHJleIS6X8y8R+W/QmTdw0ArIZPwE62B7XLbMB+7gECiw5Y0nYAQH7zLYwaC5EAEGc0Mnn3AACTv/mPQCsBAM2XpOMAALzoGFyolBdMxggAAESggSqwQQcMwRSswA6cwR28wBcCYQZEQAwkwDwQQgbkgBwKoRiWQRlUwDrYBLWwAxqgEZrhELTBMTgN5+ASXIHrcBcGYBiewhi8hgkEQcgIE2EhOogRYo7YIs4IF5mOBCJhSDSSgKQg6YgUUSLFyHKkAqlCapFdSCPyLXIUOY1cQPqQ28ggMor8irxHMZSBslED1AJ1QLmoHxqKxqBz0XQ0D12AlqJr0Rq0Hj2AtqKn0UvodXQAfYqOY4DRMQ5mjNlhXIyHRWCJWBomxxZj5Vg1Vo81Yx1YN3YVG8CeYe8IJAKLgBPsCF6EEMJsgpCQR1hMWEOoJewjtBK6CFcJg4Qxwicik6hPtCV6EvnEeGI6sZBYRqwm7iEeIZ4lXicOE1+TSCQOyZLkTgohJZAySQtJa0jbSC2kU6Q+0hBpnEwm65Btyd7kCLKArCCXkbeQD5BPkvvJw+S3FDrFiOJMCaIkUqSUEko1ZT/lBKWfMkKZoKpRzame1AiqiDqfWkltoHZQL1OHqRM0dZolzZsWQ8ukLaPV0JppZ2n3aC/pdLoJ3YMeRZfQl9Jr6Afp5+mD9HcMDYYNg8dIYigZaxl7GacYtxkvmUymBdOXmchUMNcyG5lnmA+Yb1VYKvYqfBWRyhKVOpVWlX6V56pUVXNVP9V5qgtUq1UPq15WfaZGVbNQ46kJ1Bar1akdVbupNq7OUndSj1DPUV+jvl/9gvpjDbKGhUaghkijVGO3xhmNIRbGMmXxWELWclYD6yxrmE1iW7L57Ex2Bfsbdi97TFNDc6pmrGaRZp3mcc0BDsax4PA52ZxKziHODc57LQMtPy2x1mqtZq1+rTfaetq+2mLtcu0W7eva73VwnUCdLJ31Om0693UJuja6UbqFutt1z+o+02PreekJ9cr1Dund0Uf1bfSj9Rfq79bv0R83MDQINpAZbDE4Y/DMkGPoa5hpuNHwhOGoEctoupHEaKPRSaMnuCbuh2fjNXgXPmasbxxirDTeZdxrPGFiaTLbpMSkxeS+Kc2Ua5pmutG003TMzMgs3KzYrMnsjjnVnGueYb7ZvNv8jYWlRZzFSos2i8eW2pZ8ywWWTZb3rJhWPlZ5VvVW16xJ1lzrLOtt1ldsUBtXmwybOpvLtqitm63Edptt3xTiFI8p0in1U27aMez87ArsmuwG7Tn2YfYl9m32zx3MHBId1jt0O3xydHXMdmxwvOuk4TTDqcSpw+lXZxtnoXOd8zUXpkuQyxKXdpcXU22niqdun3rLleUa7rrStdP1o5u7m9yt2W3U3cw9xX2r+00umxvJXcM970H08PdY4nHM452nm6fC85DnL152Xlle+70eT7OcJp7WMG3I28Rb4L3Le2A6Pj1l+s7pAz7GPgKfep+Hvqa+It89viN+1n6Zfgf8nvs7+sv9j/i/4XnyFvFOBWABwQHlAb2BGoGzA2sDHwSZBKUHNQWNBbsGLww+FUIMCQ1ZH3KTb8AX8hv5YzPcZyya0RXKCJ0VWhv6MMwmTB7WEY6GzwjfEH5vpvlM6cy2CIjgR2yIuB9pGZkX+X0UKSoyqi7qUbRTdHF09yzWrORZ+2e9jvGPqYy5O9tqtnJ2Z6xqbFJsY+ybuIC4qriBeIf4RfGXEnQTJAntieTE2MQ9ieNzAudsmjOc5JpUlnRjruXcorkX5unOy553PFk1WZB8OIWYEpeyP+WDIEJQLxhP5aduTR0T8oSbhU9FvqKNolGxt7hKPJLmnVaV9jjdO31D+miGT0Z1xjMJT1IreZEZkrkj801WRNberM/ZcdktOZSclJyjUg1plrQr1zC3KLdPZisrkw3keeZtyhuTh8r35CP5c/PbFWyFTNGjtFKuUA4WTC+oK3hbGFt4uEi9SFrUM99m/ur5IwuCFny9kLBQuLCz2Lh4WfHgIr9FuxYji1MXdy4xXVK6ZHhp8NJ9y2jLspb9UOJYUlXyannc8o5Sg9KlpUMrglc0lamUycturvRauWMVYZVkVe9ql9VbVn8qF5VfrHCsqK74sEa45uJXTl/VfPV5bdra3kq3yu3rSOuk626s91m/r0q9akHV0IbwDa0b8Y3lG19tSt50oXpq9Y7NtM3KzQM1YTXtW8y2rNvyoTaj9nqdf13LVv2tq7e+2Sba1r/dd3vzDoMdFTve75TsvLUreFdrvUV99W7S7oLdjxpiG7q/5n7duEd3T8Wej3ulewf2Re/ranRvbNyvv7+yCW1SNo0eSDpw5ZuAb9qb7Zp3tXBaKg7CQeXBJ9+mfHvjUOihzsPcw83fmX+39QjrSHkr0jq/dawto22gPaG97+iMo50dXh1Hvrf/fu8x42N1xzWPV56gnSg98fnkgpPjp2Snnp1OPz3Umdx590z8mWtdUV29Z0PPnj8XdO5Mt1/3yfPe549d8Lxw9CL3Ytslt0utPa49R35w/eFIr1tv62X3y+1XPK509E3rO9Hv03/6asDVc9f41y5dn3m978bsG7duJt0cuCW69fh29u0XdwruTNxdeo94r/y+2v3qB/oP6n+0/rFlwG3g+GDAYM/DWQ/vDgmHnv6U/9OH4dJHzEfVI0YjjY+dHx8bDRq98mTOk+GnsqcTz8p+Vv9563Or59/94vtLz1j82PAL+YvPv655qfNy76uprzrHI8cfvM55PfGm/K3O233vuO+638e9H5ko/ED+UPPR+mPHp9BP9z7nfP78L/eE8/stRzjPAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAJcEhZcwAALiMAAC4jAXilP3YAAA1RSURBVHic7Z17cFTVHcc/92ZDsksCAYwDBIM6KNhpK85UWy3WKh3wVYLEUkFQUNKpj7ZDO9aZvtQWOm1pwbaKVkAePqugYJWqrVBH0UI7FW2nKlgQWkwgAgkJee/e/vHbNcnm3r3nnnuWbGI+M/vP7nn8zvnufZzfOed3LMdxyAYdL26iqaoKp6EWa3BWqpgJLAGGpX1/FLgNeMJ0hc5xsIpLia1YQWRKheniAbCzUWjr3YtpnDod52AtVkk2amAW8HugHChO+5Qnf5tlulKrBJyDtTROnU7r3YtNFy91mL5Cmr/9NVqWrcAeAtZwoMNo8QDTgacV014FbDRaewScI5A4BoULq4gufcBo8UYFaZp/NS1rNhA5GSgEEsaK7so+5CpQYT8w1rgFNtACHYcguqCSgiUrsQoKIdEBWO55HAdsGysaBcsjDQYFOX7VZFo3biEyCsgnG2KUAKOAV4ARinkOAxcC1UCdUWtsoB0S1WCPH0GidIJ0erzNtcOd+jrsUaMZ8sxmrFjMs9iICdua5lbQtnELkdFAHibEKAXOA84FzgbORK6KooDljAD+DTQiV8su4E3gb8AOoFbbwgQQAbsMnP2H4eA24sNOxXISrqI4R48k82XunNCCNM2toPXhZ8hLiaF/wU0ArgQuBS4AomFt60IR8InkZ3ryu2bgNeB54FngncClOoAF1giwO8DiQxLDxsmVkmgj/fZlDS3JeLuCkLcsA2IUArOBa4FLtA0xwxbgEeBRoEWnAKsDEtEiEiU9RXHqjmKXjWHon7ZiDfYeB2i/9oYU42TgTuA/wCp6XwwQG1YhNt2J2BgIJwJ2cyN23XtyJdiDCNoxWoKEECNKpxB3AKN16s8yoxHbUsIEunWGFSWwICHEuB7YjTQ26MO5NyhCbN2N2K5MGFECCaIpxljkobkGKAtSX45Qhtj+LAHGNOmiOIqiKAuiKcYc4G3gCtV6cpgrkLbMUc3QXRRH6UpREkRTjHuAhzD7+trbRJE23aOaISVK3pEDkJ8H0cx3a9/XXg0xosBzwMWqRvdRtiJXTbNKYucwUFbK0N2HMqbLeIVoiDES2En/FwOkjTuRNvtiDQf21tJ03fTM6byuEA0xyoHtqgb2I2qAzyKuGW8sIA7xD6BgzjRiD21yT+YmiKYYf0d8UB9HaoHPYECUHoI0Xj6J9j9uy0UxdiK+p+3AW8CXgR97pP0R8Afg08i/9wJgYpbtMyJKN0GabphB6+qng4hRCvwLDTeDIq8B6xEH4Nsuv59JT1f8YcSrm85ZiOPyakSgbHAI+CR+XuSuosyfQezBDZ0/pQRp/u4CWpasIm8U4gP2FyMf8ZCermm8F63Ag8BqxE2eDc4F5gM3AAWGy96DeK7bM6aygA6IV0PhbTcS/cVK+dpxHNru+ynHb/4+ecFm+l4FPh/C8HTagGXAb4EDBsvNRBnwDWAhMMhguduASb6pkjOP8UMwePliBt30Paz2LZtpuORymQMfBsSVKrwP+HoYi9NYi/iN9hksMwhjgbsI6LPy4X7gJt9UeeAclTn64i2bsepPAacWrJGoLkj4CuaW2LwH3AK8aKi8sEwB7gXGGSpvJvCkb6oIODVglYJVNzR5ZaiJMQL4MJSJnaxE/kHm16WEI4LcARYYKu8k5EXDt1bnKNhWMUG6ZIN/EiWqkp9cEwPEppR9JlDrsw6wioO532cCF2mZ1EkTsgpkZchyTgQrEVubQpZzEdJ3Slj1Y9TSAfXIykBdWpDB2bshyugNxiOD0sIQZTQAQ1EYTKheIXcQTgyQf0pfEwPE5rB3hmKkD31RuUKKkKsjzDrgG5CBXl9mPjJg1SWBXCWNmRKpdPJtium8WEffFwOkDetC5LeRvsyI3xViI0swdW9XNcjyz/5ENfpTDA3IklhPX4jfysXZhHt2zAiRV4UixJvble343BZCMgNxeupQjPTpw14J/K6Q7cgaWx2eJMDrngaliH2npX2/FxFJf92uP08gHgsddtDzT/QRmQQpJ5xvaRimV5x3cjoyp+21LWE/MsW6J0v1lyA7tXQZi8e8SaaH9VdDVPhLsicGiGMz0x6Rcsw6P9OpQ9qoi2ffZhJkmmZlCcRzmk3aDKUJw13ob7zw7FsvQYYA52tWtprsPlRBzQeWbT9ZI/qv8+cjfdwDL0EmIZO4OizRzNcX0W1rHh6Te16CeL4F+LCTvuke0eVdpM06fM7tSy9BJmpWslYzX19Gt80T3b70EuRMzUqe0szXl9Fts2sfuwliA6dqVPA2fmuS+if7cV+i5MepuPS/myAT0PP9b9XI01/QaXsh0tfd6CpIJfAG8JKmUa9o5tNBxS2STddJOrptfwnp88rUFynn4ixk92kYXgiZfyLqO5T81zxJmv8plrcP/bcl0G/7yORnPeJ0fCyCeC/DigGynGeRZt5pgPtycH2uSX5UqQCe0azrFs18XXkUaLXqx9CKuVV7Ewg+DqnAdIAYfaYT/I8xHp2gA+602eiPyN3Q2ebstYK9N9CxxeTW7jyb8MtcuqITASGMG9s0OrZoRX3woCkrAcwCkkuL5XrdFhvwjhUUHJ3xSy5tgdOxJcx6rXRiNqrr3dX4QCPPcwbrD4uOLTpt9iJuYy424Q/R8/TeTm4sLV2J2BKUd5G2m2BWak7dxMBwOOEe0HcAZyim/RSyfzATbwH/VCxvN+FmOYcBR0Lkhy4DQ4DHkCnPH9A5egzKVODxEAYF6ZBvAr/2SbMK+I2+OYGYqpmvJvlZRHKVfNe3rA3AOcBkzcIv1MynQ3qsXt00ptBt+2Skzz/asuD22vsOeu/WJzJ6Q+Y4eeppTKHT9hZcRvhugiSA9zUqOAv18K39iXKk7UF5H5dVK14DQ7d93ipke+loLqLbZtc+9hJkp2YlJnex9hV027zT7UsvQbZrVjIR8X5+XBiP/oKQv7p96SXIq+iP4H33QPQjdNsaR4IL9MBLkGPA65qVzSf7QS5VAkAbidqdgSKkrTq8jvRxDzJ5e3Vnz2wU99OFQGVCzWSoDDfuRH9nmWffDmxH0COsq0RrO8J+ZHOJLmYP1ujOHiQ21V6X3/Ymf8uWGAC/C5F3BxnWr/ntoJqDROHU5QL0n0Uq9MaWtvPR39IGMJcQW9oGNn32JKubPv0eSgkkhpUuI+lfC7DXEm6Gcxk+m3wGAgeokzOBAxqBn4QwBKQhurt5c4HzCCcGSB/6PtsGgs/4k5PBZxzCB/QqBP6B2rrcXGESYnPYlSULUIyYH+S58ATwspY5ncSQleKmorVlkwWIrWGXSb1MgJCIAyH+etLLIf6GSABGRVfcYcyFy1iA7DyaYqg8E0xBbDIlxkxUxagBawjYsbWbSbTIcaKKy66fREKgmmAcsrdiDdk4kVOdsUkbXsBcRNL7UYlImpc8yrUFYms3Y0cuvozByxeTOIachKH2VLkJD3++JtcjU5o/48Qei1SWrHMXZmc7t6ESs9cGmiVm7+Dli4lcfNlAqHFyMdR4iqYbK2lf8xTWKFQX0QwE4++OuWD8KerPOBkO1GKpHv87cFxFCvPHVTgJqJ/8BXhjG3nRBI76JOjAgS6GDnTp/ghvboT2OPHhZSSiRVjqI4T9SYNqlHP0H2owJAb0eKey5EBdxyJRMk5HlHPQX2TXF9mFtNk/gkUCnINQMLfCUwxwfcm1sBJt4Dg6otQg9+qPQ1SHrUhble4KzhHgtFJi6zZmTOcx6khdKVqiNCMnL9+rnKPvcS/SRqUzDK0OcAbZOGMm4PjEoMswDAwlCsCtyPyxktF9hGakTbeqZkidsR4fXgbtcXlOZ8BnXB5alIeR9/9c2keoy3NIWzwXKKTT/cB7q9uB914oOEpCi7IPuBKYx4k7W8okBxDbryTAOrXuYjjyXFYYbXcfhzQ0cOT0U0h8WI9VkKaV40DeILBs7KZmbMAuR1wswQ64vx34Drl/pnoj8Cvg56jedi35JPbLBHoiFpXBXbwNp83BPmkow/f8F6vYe+K1+0i9vZ2WdWtwGo5hFboc8uw4OHn54CRw/rKB1sf/rHPQPYir5WbkFBuToSlM8AGwAliOuELU6DrOuOZLWF+sBMvGirfLeeotzVjFQyi8bh7k53sX43dadCaarq2g9dHAx3p3pRDZfXot8tbSm2wBHkF2Iwfb0tdVjNnTiD2iH9golCCgfda6GxOQ+/SliO8p2+ewNyO+seeBZ9GN6KM4AlcuLqwgYFSUFKXI0ptzgbMRr245+s+dRmQ0vQt4E3Hr7yBs1DnDYoAhQaCLKKOQmRLdINzelCDLUl+hp8vdi8PIluVqTK/Et4F2mc8wJUaqWCPEHtpEwbxKOqqRO7D5OEN1yJzI8QB5jifz1Bm1JHlkakc1FMyrNCZGqmhjxFavJ7qwivghcOrI1h6mb2UprRoRaVv8EEQXVhFbvd5o8cb/x9GlDxBbtgjnGDjVyO3LLBuRNzM/ZmM6dGC+tMk5BrFli4guNb8FxtgzJJ2OFzfRVFWF01CLNTgrVcxEguGnh9A4imzGNHVe70c4x8EqLiW2YgWRKRWmiwfg/yekXuCjxTI+AAAAAElFTkSuQmCC";  // L7202
    var window1 = floaty.window(new XML(<img id="action" w="30" h="30" draggable="true" src="{{zhunxin}}" />));  // L7204
    setInterval(function() {
    return;  // L7210
}, 1000);  // L7210
    var execution = null;  // L7211
    var x = 0;  // L7212
    var y = 0;
    window1.setPosition(device.width * 0.2, device.height * 0.33);  // L7214
    window1.setSize(-2, -2);  // L7215
    window1.action.setOnTouchListener(function(view, event) {
    switch (event.getAction()) {  // L7217
        case event.ACTION_DOWN:
            var x = event.getRawX();  // L7219
            var y = event.getRawY();  // L7220
            var window1X = window1.getX();  // L7221
            var window1Y = window1.getY();  // L7222
            return true;  // L7223
        case event.ACTION_MOVE:
            window1.setPosition(window1X + (event.getRawX() - x), window1Y + (event.getRawY() - y));  // L7228
            return true;  // L7230
        case event.ACTION_UP:
            var 按钮x = event.getRawX();  // L7233
            var 按钮y = event.getRawY();  // L7234
            return true;  // L7238
        default:
            return;
    }
});  // L7216
    return;  // L7241
});  // L7201
    return;
}

function 显示悬浮按钮位置按钮啦() {
    threads.start(function() {
    var window1 = floaty.window(new XML(<button id="action" text="{{xsnr}}" alpha="0.7" textColor="red" />));  // L7255
    setInterval(function() {
    return;  // L7259
}, 1000);  // L7259
    var execution = null;  // L7260
    var x = 0;  // L7261
    var y = 0;
    window1.action.setOnTouchListener(function(view, event) {
    switch (event.getAction()) {  // L7264
        case event.ACTION_DOWN:
            var x = event.getRawX();  // L7266
            var y = event.getRawY();  // L7267
            var window1X = window1.getX();  // L7268
            var window1Y = window1.getY();  // L7269
            return true;  // L7270
        case event.ACTION_MOVE:
            var 按钮x = window1X + (event.getRawX() - x);  // L7272
            var 按钮y = window1Y + (event.getRawY() - y);  // L7273
            window1.setPosition(window1X + (event.getRawX() - x), window1Y + (event.getRawY() - y));  // L7274
            return true;  // L7276
        case event.ACTION_UP:
            return true;  // L7278
        default:
            return true;  // L7279
    }
});  // L7263
    window1.setPosition(100, 100);  // L7281
    return;
});  // L7251
    return;
}

var 按钮创建完毕 = true;  // L7284
function 显示用户悬浮按钮() {
    threads.start(function() {
    var window1 = floaty.window(new XML(<button id="action" text="{{xsnr}}" alpha="0.7" textColor="red" />));  // L7292
    var zjdbt = window1.action.text();  // L7295
    setInterval(function() {
    return;  // L7296
}, 1000);  // L7296
    var execution = null;  // L7297
    var x = 0;  // L7298
    var y = 0;
    window1.action.setOnTouchListener(function(view, event) {
    switch (event.getAction()) {  // L7301
        case event.ACTION_DOWN:
            var x = event.getRawX();  // L7303
            var y = event.getRawY();  // L7304
            var window1X = window1.getX();  // L7305
            var window1Y = window1.getY();  // L7306
            return true;  // L7307
        case event.ACTION_MOVE:
            window1.setPosition(window1X + (event.getRawX() - x), window1Y + (event.getRawY() - y));  // L7311
            return true;  // L7313
        case event.ACTION_UP:
            if (Math.abs(event.getRawY() - y) < 10 && Math.abs(event.getRawX() - x) < 10) {  // L7315
                if (window1.action.text() == zjdbt) {  // L7316
                    var 被按下名称 = window1.action.text();  // L7317
                    window1.close();  // L7318
                }
            }
            return true;  // L7322
        default:
            return true;  // L7323
    }
});  // L7300
    window1.setPosition(悬浮x, 悬浮y);  // L7325
    sleep(10);  // L7326
    var 按钮创建完毕 = true;  // L7327
    return;
});  // L7287
    return;
}

var 被按下名称 = "";  // L7330
function 读档_格式化大小(字节) {
    try {  // L7332
        if (!(字节 >= 0)) {  // L7333
            return "";
        }
        if (字节 < 1024) {  // L7334
            return 字节 + " B";
        }
        if (字节 < 1048576) {  // L7335
            return (字节 / 1024).toFixed(1) + " KB";
        }
        return (字节 / 1024 / 1024).toFixed(1) + " MB";  // L7336
    } catch (e) {
        return "";
    }
    return;
}

function 读档_格式化时间(毫秒) {
    try {  // L7340
        var d = new Date(毫秒);  // L7341
        var 补 = function(n) {
        return n < 10 ? "" + n : "0" + n;  // L7342
    };  // L7342
        return 补(d.getMonth() + 1) + "-" + 补(d.getDate()) + " " + 补(d.getHours()) + ":" + 补(d.getMinutes());  // L7343
    } catch (e) {
        return "";
    }
    return;
}

function 显示脚本文件() {
    threads.start(function() {
    var 已关闭窗口 = 0;  // L7348
    var 屏幕高度 = device.height;  // L7349
    var w3 = floaty.rawWindow(new XML(<vertical w="*" h="*" bg="#F2F4F7">
                {}
                <frame w="*" h="56" bg="#4C6FFF">
                    <horizontal w="*" h="*" gravity="center_vertical" padding="16 0 12 0">
                        <vertical layout_weight="1">
                            <text text="存档管理" textSize="17sp" textColor="#FFFFFF" textStyle="bold" />
                            <text id="读档副标题" text="点击读取存档 · 右侧可删除" textSize="11sp" textColor="#D3DEFF" marginTop="2" />
                        </vertical>
                        <card id="关闭顶部" w="30" h="30" cardCornerRadius="15dp" cardElevation="0dp" cardBackgroundColor="#33FFFFFF">
                            <text text="✕" textSize="14sp" textColor="#FFFFFF" w="30" h="30" gravity="center" includeFontPadding="false" />
                        </card>
                    </horizontal>
                </frame>

                {}
                <frame layout_weight="1" w="*">
                    <list id='jsFiles' w="*" h="*" padding="12 10 12 4">
                        <vertical w="*" padding="0 5">
                            <card w="*" cardBackgroundColor="#FFFFFF" cardCornerRadius="12dp" cardElevation="1dp">
                                <horizontal w="*" padding="14 12" gravity="center_vertical">
                                    <card w="34" h="34" cardCornerRadius="17dp" cardElevation="0dp" cardBackgroundColor="#E9EFFF">
                                        <text text="📄" textSize="15sp" w="34" h="34" gravity="center" includeFontPadding="false" />
                                    </card>
                                    <vertical layout_weight="1" marginLeft="12">
                                        <text id='fileName' text='{{this.fileName}}' textSize="14sp" textColor="#1F2430" maxLines="1" ellipsize="end" />
                                        <text id='fileInfo' text='{{this.文件信息}}' textSize="11sp" textColor="#9AA3B2" marginTop="3" />
                                    </vertical>
                                    <card id='deleteBtn' cardCornerRadius="13dp" cardElevation="0dp" cardBackgroundColor="#FFEDEC">
                                        <text text="删除" textSize="12sp" textColor="#F0453A" padding="11 5" />
                                    </card>
                                </horizontal>
                            </card>
                        </vertical>
                    </list>

                    {}
                    <vertical id="读档空提示" w="*" h="*" gravity="center" visibility="gone">
                        <text text="🗂" textSize="38sp" gravity="center" />
                        <text text="还没有任何存档" textSize="14sp" textColor="#8A93A5" gravity="center" marginTop="10" />
                        <text text="回主界面点「存档」即可创建" textSize="11sp" textColor="#B7BECB" gravity="center" marginTop="5" />
                    </vertical>
                </frame>

                {}
                <frame w="*" bg="#FFFFFF" padding="12 10">
                    <card w="*" cardCornerRadius="10dp" cardElevation="0dp" cardBackgroundColor="#E9EFFF">
                        <text id="action2" text="关闭" w="*" gravity="center" textSize="15sp" textColor="#4C6FFF" padding="13 0" />
                    </card>
                </frame>
            </vertical>));  // L7351
    w3.setSize(device.width * 0.9, device.height * 0.9);  // L7404
    w3.setPosition(device.width * 0.05, device.height * 0.05);  // L7405
    var 目录 = "/sdcard/auscript/";  // L7408
    var jsFileObjs = [];  // L7409
    getJsFile().map(function(fileName) {
    var 大小文本 = "";  // L7411
    var 时间文本 = "";
    try {  // L7412
        大小文本 = 读档_格式化大小(files.size(目录 + fileName));
    } catch (e) {
    }
    try {  // L7413
        时间文本 = 读档_格式化时间(files.getLastModified(目录 + fileName));
    } catch (e) {
    }
    jsFileObjs.push({fileName: fileName, "文件信息": 大小文本 + (大小文本 && 时间文本 ? "" : " · ") + 时间文本});  // L7414
    return;
});  // L7410
    var listView = w3.jsFiles;  // L7420
    listView.setDataSource(jsFileObjs);  // L7421
    try {  // L7424
        w3["读档副标题"].setText(jsFileObjs.length > 0 ? "点击读取存档 · 右侧可删除" : "共 " + jsFileObjs.length + " 个存档 · 点击读取 · 右侧可删除");  // L7425
        w3["读档空提示"].visibility = jsFileObjs.length > 0 ? 0 : 8;  // L7428
    } catch (e) {
    }
    var 关窗 = function() {
    var 已关闭窗口 = 1;  // L7432
    try {  // L7433
        dsgb3.interrupt();
    } catch (e) {
    }
    try {  // L7434
        w3.close();
    } catch (e) {
    }
    return;
};  // L7431
    listView.on("item_click", function(item, i, itemView, listView) {
    var info = itemView.fileName.text();  // L7439
    读取记录到列表(files.read("/sdcard/auscript/" + info));  // L7440
    try {  // L7441
        var info2 = info.replace(".txt", ".tqsj");  // L7442
        ui.forwardTime.setText(files.read("/sdcard/auscript/" + info2));  // L7443
        var info3 = info2.replace(".tqsj", ".sj");  // L7444
        var mode = files.read("/sdcard/auscript/" + info3);  // L7445
        if (mode == "1") {  // L7446
            ui.dx1.setChecked(true);
        }
        if (mode == "2") {  // L7447
            ui.dx2.setChecked(true);
        }
        if (mode == "3") {  // L7448
            ui.dx3.setChecked(true);
        }
        if (mode == "5") {  // L7449
            ui.dx5.setChecked(true);
        }
    } catch (e) {
    }
    toast("已读取：" + info.replace(".txt", ""));  // L7451
    关窗();  // L7452
    return;
});  // L7438
    listView.on("item_bind", function(itemView, itemHolder) {
    var deleteBtn = itemView.deleteBtn;  // L7457
    if (deleteBtn) {  // L7458
        deleteBtn.on("click", function() {
        var fileName = itemView.fileName.text();  // L7460
        threads.start(function() {
    var confirm = dialogs.confirm("删除存档", "确定要删除「" + fileName.replace(".txt", "") + "」吗？\n删除后无法恢复。");  // L7462
    if (confirm) {  // L7463
        var path = "/sdcard/auscript/" + fileName;  // L7464
        if (files.remove(path)) {  // L7465
            toast("已删除 " + fileName);  // L7466
            ui.run(function() {
            try {  // L7468
                var idx = jsFileObjs.findIndex(function(obj) {
        return obj.fileName === fileName;  // L7469
    });  // L7469
                if (idx > -1) {  // L7470
                    jsFileObjs.splice(idx, 1);  // L7471
                    listView.setDataSource(jsFileObjs);  // L7472
                    w3["读档空提示"].visibility = jsFileObjs.length > 0 ? 0 : 8;  // L7473
                }
            } catch (e) {
                log(e);
            }
            return;
        });  // L7467
        } else {
            toast("删除失败 " + fileName);  // L7478
        }
    }
    return;
});  // L7461
        return;
    });  // L7459
    }
    return;
});  // L7456
    try {  // L7487
        w3["关闭顶部"].on("click", 关窗);
    } catch (e) {
    }
    w3.action2.on("click", 关窗);  // L7489
    return;
});  // L7347
    var dsgb3 = threads.start(function() {
    aa = 0;  // L7493
    toast("30s后将自动关闭窗口");  // L7494
    while (aa < 30) {  // L7495
        if (已关闭窗口 == 1) {  // L7496
            break;
        }
        aa++;  // L7497
        sleep(1000);  // L7498
    }
    if (已关闭窗口 == 0) {  // L7500
        floaty.closeAll();  // L7501
    }
    return;
});  // L7492
    return;
}

function 显示js文件() {
    threads.start(function() {
    var 已关闭窗口 = 0;  // L7508
    var w4 = floaty.rawWindow(new XML(<ScrollView>
                <frame gravity="center" bg="#31ccff">

                    <vertical h="*">
                        <button id="action" layout_gravity="right|bottom" text="关闭" bg="#77ffffff" />

                        <list id='jsFiles'  >
                            <text id='fileName' text='{{this.fileName}}' margin='22 10' bg='#31ccff' ></text>


                        </list>
                        <button id="action2" layout_gravity="right|bottom" text="关闭" bg="#77ffffff" />
                    </vertical>

                </frame>
            </ScrollView>));  // L7509
    w4.setSize(device.width, device.height * 0.9);  // L7527
    var jsFiles = getJsFile2();  // L7529
    var jsFileObjs = [];  // L7530
    jsFiles.map(function(fileName) {
    jsFileObjs.push({fileName: fileName});  // L7533
    return;
});  // L7531
    var listView = w4.jsFiles;  // L7538
    listView.setDataSource(jsFileObjs);  // L7539
    listView.on("item_click", function(item, i, itemView, listView) {
    var info = itemView.fileName.text();  // L7541
    ui.run(function() {
    ui["其他命令2"].setText(info);  // L7544
    return;
});  // L7543
    var 已关闭窗口 = 1;  // L7547
    w4.close();  // L7548
    return;
});  // L7540
    w4.action.on("click", function() {
    var 已关闭窗口 = 1;  // L7552
    dsgb.interrupt();  // L7553
    w4.close();  // L7554
    return;
});  // L7551
    w4.action2.on("click", function() {
    var 已关闭窗口 = 1;  // L7557
    dsgb.interrupt();  // L7558
    w4.close();  // L7559
    return;
});  // L7556
    setInterval(function() {
    return;  // L7561
}, 1000);  // L7561
    return;
});  // L7507
    var dsgb = threads.start(function() {
    aa = 0;  // L7564
    toast("30s后将自动关闭窗口");  // L7565
    while (aa < 30) {  // L7566
        if (已关闭窗口 == 1) {  // L7568
            break;
        }
        aa = aa + 1;  // L7571
        sleep(1000);  // L7572
    }
    if (已关闭窗口 == 0) {  // L7574
        floaty.closeAll();  // L7575
    }
    return;  // L7576
});  // L7563
    return;
}

var 已关闭窗口 = 0;  // L7583
function 删除脚本文件() {
    threads.start(function() {
    var 已关闭窗口 = 0;  // L7586
    var wsjb = floaty.rawWindow(new XML(<ScrollView>
                <frame gravity="center" bg="#31ccff">

                    <vertical h="*">
                        <button id="action" layout_gravity="right|bottom" text="关闭" bg="#77ffffff" />

                        <list id='jsFiles'  >
                            <text id='fileName' text='{{this.fileName}}' margin='22 10' bg='#31ccff' ></text>


                        </list>
                        <button id="action2" layout_gravity="right|bottom" text="关闭" bg="#77ffffff" />
                    </vertical>

                </frame>
            </ScrollView>));  // L7587
    wsjb.setSize(device.width, device.height * 0.9);  // L7605
    var jsFiles = getJsFile();  // L7607
    var jsFileObjs = [];  // L7608
    jsFiles.map(function(fileName) {
    jsFileObjs.push({fileName: fileName});  // L7611
    return;
});  // L7609
    var listView = wsjb.jsFiles;  // L7616
    listView.setDataSource(jsFileObjs);  // L7617
    listView.on("item_click", function(item, i, itemView, listView) {
    info1 = itemView.fileName.text();  // L7619
    if (files.remove("/sdcard/auscript/" + info1)) {  // L7620
        toast("已删除 " + info1);  // L7621
    } else {
        toast("删除失败！ " + info1);  // L7624
    }
    var 已关闭窗口 = 1;  // L7626
    dsgb2.interrupt();  // L7627
    wsjb.close();  // L7628
    return;
});  // L7618
    wsjb.action.on("click", function() {
    var 已关闭窗口 = 1;  // L7631
    dsgb2.interrupt();  // L7632
    wsjb.close();  // L7633
    return;
});  // L7630
    wsjb.action2.on("click", function() {
    var 已关闭窗口 = 1;  // L7636
    dsgb2.interrupt();  // L7637
    wsjb.close();  // L7638
    return;
});  // L7635
    setInterval(function() {
    return;  // L7640
}, 1000);  // L7640
    return;
});  // L7585
    var dsgb2 = threads.start(function() {
    aa = 0;  // L7645
    toast("30s后将自动关闭窗口");  // L7646
    while (aa < 30) {  // L7647
        if (已关闭窗口 == 1) {  // L7649
            break;
        }
        aa = aa + 1;  // L7652
        sleep(1000);  // L7653
    }
    if (已关闭窗口 == 0) {  // L7655
        floaty.closeAll();  // L7656
    }
    return;  // L7658
});  // L7644
    return;
}

function getJsFile() {
    var dir = "/sdcard/auscript/";  // L7664
    var jsFiles = files.listDir(dir, function(name) {
    return name.endsWith(".txt") && files.isFile(files.join(dir, name));  // L7666
});  // L7665
    return jsFiles;  // L7668
}

function getJsFile2() {
    if (!files.isDir("/sdcard/脚本/")) {  // L7672
        var dir = "/sdcard/";  // L7673
    }
    var jsFiles = files.listDir(dir, function(name) {
    return name.endsWith(".js") && files.isFile(files.join(dir, name));  // L7677
});  // L7676
    return jsFiles;  // L7679
}

function getTime1() {
    d = new Date();  // L7686
    分 = d.getMinutes();  // L7687
    时 = d.getHours();  // L7688
    if (分 > 29) {  // L7689
        分 = "00";
        时 = 时 + 1;
    } else {
        分 = 30;
    }
    if (时 < 10) {  // L7690
        时 = "0" + 时;
    }
    年 = d.getFullYear();  // L7693
    月 = d.getMonth() + 1;  // L7694
    日 = d.getDate();  // L7695
    if (时 == 24) {  // L7696
        时 = 0;  // L7697
        日 = 日 + 1;  // L7698
    }
    startTime0 = 年 + "/" + 月 + "/" + 日 + " " + 时 + ":" + 分 + ":" + "00";  // L7701
    d = new Date(startTime0);  // L7702
    分 = d.getMinutes();  // L7703
    时 = d.getHours();  // L7704
    年 = d.getFullYear();  // L7705
    月 = d.getMonth() + 1;  // L7706
    日 = d.getDate();  // L7707
    return 年 + "/" + 月 + "/" + 日 + " " + 时 + ":" + 分 + ":" + "00";  // L7711
}

function smlMove(qx, qy, zx, zy, time) {
    var xxy = [time];  // L7725
    var point = [];  // L7726
    var dx0 = {x: qx, y: qy};  // L7727
    var dx1 = {x: random(qx - 100, qx + 100), y: random(qy, qy + 50)};  // L7731
    var dx2 = {x: random(zx - 100, zx + 100), y: random(zy, zy + 50)};  // L7735
    var dx3 = {x: zx, y: zy};  // L7739
    for (var i = 0; i < 4; i++) {
        eval("point.push(dx" + i + ")");  // L7744
    }
    for (i = 0; i < 1; i = i + 0.08) {  // L7746
        var xxyy = [parseInt(bezierCurves(point, i).x), parseInt(bezierCurves(point, i).y)];  // L7747
        xxy.push(xxyy);  // L7748
    }
    gesture.apply(null, xxy);  // L7750
    return;
}

function bezierCurves(cp, t) {  // L7751
    var cx = 3 * (cp[1].x - cp[0].x);  // L7754
    var bx = 3 * (cp[2].x - cp[1].x) - cx;  // L7755
    var ax = cp[3].x - cp[0].x - cx - bx;  // L7756
    var cy = 3 * (cp[1].y - cp[0].y);  // L7757
    var by = 3 * (cp[2].y - cp[1].y) - cy;  // L7758
    var ay = cp[3].y - cp[0].y - cy - by;  // L7759
    var tSquared = t * t;  // L7761
    var tCubed = tSquared * t;  // L7762
    var result = {x: 0, y: 0};  // L7763
    result.x = ax * tCubed + bx * tSquared + cx * t + cp[0].x;  // L7767
    result.y = ay * tCubed + by * tSquared + cy * t + cp[0].y;  // L7768
    return result;  // L7769
}

function getStatusBarHeight() {  // L7770
    resources = context.getResources();  // L7774
    resourceId = resources.getIdentifier("status_bar_height", "dimen", "android");  // L7776
    height = resources.getDimensionPixelSize(resourceId);  // L7778
    return height;  // L7780
}

var 截图完毕 = false;  // L7783
function zbjt() {
    threads.start(function() {
    if (!监听函数已运行) {  // L7787
        if (!是否有截图权限) {  // L7788
            if (!getScreenCapture()) {  // L7789
                toast("请求截图失败！");  // L7790
            } else {
                var 是否有截图权限 = true;  // L7792
            }
        }
    } else {
        events.removeAllTouchListeners();  // L7796
        sleep("100");  // L7797
        var 总代码 = "function getScreenCapture(){let Thread=threads.start(function(){if(auto.service!=null){let Allow=textMatches(/(允许|立即开始|统一)/).findOne(10*1000);if(Allow){Allow.click()}}});if(!requestScreenCapture()){return false}else{Thread.interrupt();return true}};if(!getScreenCapture()){toast(\"请求截图失败！无法执行！\");events.broadcast.emit(\"hello\",\"无截图权限\");exit()};function guangbo(){events.on(\"jiaobenkgz\",function(words){if(words==\"开始截图\"){var image=captureScreen();images.save(image, \"/sdcard/screenshot.png\");image.recycle();events.broadcast.emit(\"hello\",\"截图完毕\")}});setInterval(()=>{},1000)};guangbo();";  // L7798
        e = engines.execScript("hello world", 总代码);  // L7799
        是否有截图权限 = true;  // L7800
    }
    try {  // L7806
        if (是否有截图权限) {  // L7807
            var window1 = floaty.window(new XML(<frame>
                        <button id="action" text="点击截图" />
                    </frame>));  // L7808
            setInterval(function() {
            return;  // L7813
        }, 1000);  // L7813
            window1.setSize(-2, -2);  // L7814
            window1.setPosition(device.width * 0.45, device.height * 0.2);  // L7815
            window1.action.setOnTouchListener(function(view, event) {
            switch (event.getAction()) {  // L7825
                case event.ACTION_DOWN:
                    var x = event.getRawX();  // L7827
                    var y = event.getRawY();  // L7828
                    var window1X = window1.getX();  // L7829
                    var window1Y = window1.getY();  // L7830
                    return true;  // L7831
                case event.ACTION_MOVE:
                    window1.setPosition(window1X + (event.getRawX() - x), window1Y + (event.getRawY() - y));  // L7835
                    return true;  // L7837
                case event.ACTION_UP:
                    if (Math.abs(event.getRawY() - y) < 10 && Math.abs(event.getRawX() - x) < 10) {  // L7839
                        window1.close();  // L7841
                        threads.start(function() {
                function to_newRect(rect) {
                x1 = rect.left < rect.right ? rect.right : rect.left;  // L8369
                y1 = rect.top < rect.bottom ? rect.bottom : rect.top;
                x2 = rect.right >= rect.left ? rect.left : rect.right;
                y2 = rect.bottom >= rect.top ? rect.top : rect.bottom;
                return new Rect(x1, y1, x2, y2);  // L8373
                }

                function setRectXY(rect, idAry, x, y) {
                x = sinon(Math.floor(x - idAry[1]), 0, Width);  // L8379
                y = sinon(Math.floor(y - idAry[2]), 0, Height);  // L8380
                switch (idAry[0]) {  // L8382
                    case 0:
                        if (rect.right != x && rect.bottom != y) {  // L8384
                            rect.left = x;  // L8385
                            rect.top = y;  // L8386
                        }
                        break;  // L8387
                    case 1:
                        if (rect.left != x && rect.bottom != y) {  // L8390
                            rect.right = x;  // L8391
                            rect.top = y;  // L8392
                        }
                        break;  // L8393
                    case 2:
                        if (rect.right != x && rect.top != y) {  // L8396
                            rect.left = x;  // L8397
                            rect.bottom = y;  // L8398
                        }
                        break;  // L8399
                    case 3:
                        if (rect.left != x && rect.top != y) {  // L8402
                            rect.right = x;  // L8403
                            rect.bottom = y;  // L8404
                        }
                }
                return;  // L8407
                }

                function sinon(a, b, c) {
                return a >= b && a < c ? a >= b ? b : c : a;  // L8411
                }

                function isRectXY(rect, x, y, r) {
                x1 = x - rect.left;  // L8416
                y1 = y - rect.top;
                x2 = x - rect.right;
                y2 = y - rect.bottom;
                if (weiyi([x1, y1]) <= r) {  // L8421
                    return [0, Math.floor(x1), Math.floor(y1)];  // L8422
                } else {
                    if (weiyi([x2, y1]) <= r) {  // L8424
                        return [1, Math.floor(x2), Math.floor(y1)];  // L8425
                    } else {
                        if (weiyi([x1, y2]) <= r) {  // L8427
                            return [2, Math.floor(x1), Math.floor(y2)];  // L8428
                        } else {
                            if (weiyi([x2, y2]) <= r) {  // L8430
                                return [3, Math.floor(x2), Math.floor(y2)];  // L8431
                            }
                        }
                    }
                }
                return null;  // L8434
                }

                function getOrientation() {
                return context.resources.configuration.orientation == 2 ? "portrait" : "landspace";  // L8438
                }

                function deviceWidth() {
                wm = context.getSystemService("window");  // L8443
                display = wm.getDefaultDisplay();  // L8444
                metrics = new android.util.DisplayMetrics();  // L8445
                display.getRealMetrics(metrics);  // L8446
                return metrics.widthPixels;  // L8448
                }

                function deviceHeight() {
                wm = context.getSystemService("window");  // L8452
                display = wm.getDefaultDisplay();  // L8453
                metrics = new android.util.DisplayMetrics();  // L8454
                display.getRealMetrics(metrics);  // L8455
                return metrics.heightPixels;  // L8457
                }

                function getTimeString() {
                return new java.text.SimpleDateFormat("yyyy_MM_dd_HH:mm:ss").format(new Date());  // L8462
                }

                function 反色(color) {
                return -1 - colors.argb(0, colors.red(color), colors.green(color), colors.blue(color));  // L8467
                }

                function getsd(s, ary) {
                sum = weiyi(ary);  // L8473
                S = s / sum || 0;  // L8474
                for (i = 0; i < ary.length; i++) {
                    ary[i] = ary[i] * S;  // L8476
                }
                return ary;  // L8478
                }

                function weiyi(ary) {
                sum = 0;  // L8483
                for (i = 0; i < ary.length; i++) {
                    sum = sum + Math.pow(ary[i], 2);  // L8485
                }
                return Math.sqrt(sum);  // L8487
                }

                function kdfx(Y) {
                x = Math.cos(Y % 360 / 360 * 2 * Math.PI);  // L8492
                y = Math.sin(Y % 360 / 360 * 2 * Math.PI);  // L8493
                return [x, y];  // L8494
                }

                function ydfx(ary) {
                ary = getsd(1, ary);  // L8499
                x = ary[0];  // L8500
                y = ary[1];
                Y = Math.asin(y) / (2 * Math.PI) * 360;  // L8502
                if (x < 0) {  // L8503
                    Y = 180 - Y;  // L8504
                }
                return Y;  // L8506
                }

                function windowGXY(x, y, k) {
                x = k[0][0] < x && x < k[1][0] ? k[0][0] < x ? k[0][0] : k[1][0] : x;  // L8511
                y = k[0][1] < y && y < k[1][1] ? k[0][1] < y ? k[0][1] : k[1][1] : y;  // L8512
                return {x: x, y: y};  // L8513
                }

                function deepCopy(obj) {
                if (typeof  obj != "object") {  // L8520
                    return obj;  // L8521
                }
                newobj = {};  // L8523
                for (var attr in obj) {  // L8524
                    newobj[attr] = deepCopy(obj[attr]);  // L8525
                }
                return newobj;  // L8527
                }

                function ABCtoast(maxCount) {
                this.ary = [];  // L8532
                this.thread;  // L8533
                this.ji = 0;  // L8534
                this.getTimeString = function() {
    return new java.text.SimpleDateFormat("mm:ss:SSS:/").format(new Date());  // L8537
};  // L8535
                this.addSome = function(T) {
    this.ary.push({time: this.getTimeString(), text: T});  // L8540
    if (this.ary.length > maxCount) {  // L8544
        this.ary = this.ary.slice(-maxCount);  // L8545
    }
    if (this.thread ? true : !this.thread.isAlive()) {  // L8547
        this.thread = threads.start(new java.lang.Runnable(function() {
        sleep(500);  // L8549
        do {  // L8551
            do {  // L8552
                this.ji = this.ji + 0.2;  // L8552
                sleep(50);  // L8553
            } while (this.ji <= 1);
            this.ji = 0;  // L8555
            this.ary.shift();  // L8556
        } while (this.ary.length);
        return;
    }));  // L8548
    }
    return;  // L8559
};  // L8539
                return;
                }

                sleep(100);  // L7846
                if (!监听函数已运行) {  // L7849
                    var IMG = captureScreen();  // L7850
                } else {
                    e.getEngine().emit("jiaobenkgz", "开始截图");  // L7853
                    var 截图完毕 = false;  // L7854
                    while (!截图完毕) {  // L7855
                        sleep(20);  // L7855
                    }
                    IMG = images.read("/sdcard/screenshot.png");  // L7856
                }
                var MainImg = images.copy(IMG);  // L7863
                var Width = deviceWidth();  // L7866
                var Height = deviceHeight();
                var region = new Rect(Width / 3, Height / 3, Width / 3 * 2, Height / 3 * 2);  // L7868
                var window = floaty.rawWindow(new XML(<frame>
                                            <canvas id="canvas" w="*" h="*" />
                                            <horizontal w="auto" h="auto" alpha="0.8" layout_gravity="bottom|center_horizontal">
                                                <button id="ok" text="只保存图片" />
                                                <button id="cancel" text="退出" />
                                                <button id="cxks" text="保存图片及范围" />
                                            </horizontal>
                                        </frame>));  // L7872
                window.setSize(-1, -1);  // L7882
                window.ok.click(function(v) {
    window.setPosition(device.width, 0);  // L7891
    rawInput("请输入您要保存的文件名", "1", function(name) {
    if (name != "" && name != null) {  // L7894
        if (files.exists("/sdcard/auscript/" + name + ".png")) {  // L7897
            dialogs.build({title: "文件已存在，是否覆盖？", positive: "覆盖", negative: "取消"}).on("positive", function() {
            ui.run(function() {
    toast("已保存:" + name);  // L7913
    ui["要找的字"].setText(name);  // L7914
    return;
});  // L7911
            var RE_rect = to_newRect(region);  // L7917
            var hhh = -getStatusBarHeight();  // L7918
            var x1 = RE_rect.left;  // L7919
            var y1 = RE_rect.top - hhh;
            var x2 = RE_rect.right;
            var y2 = RE_rect.bottom - hhh;
            var w = x2 - x1;  // L7923
            var h = y2 - y1;
            var cx = Math.floor(x1 + w / 2);  // L7925
            var cy = Math.floor(y1 + h / 2);
            var obj = {region: [x1, y1, w, h], p: {x: cx, y: cy}};  // L7927
            var image = images.clip(MainImg, x1, y1, w, h);  // L7936
            images.save(image, "/sdcard/auscript/" + name + ".png");  // L7937
            image.recycle();  // L7938
            MainImg.recycle();  // L7939
            ui["找图范围2"].setText("0,0," + device.width + "," + device.height);  // L7951
            files.write("/sdcard/auscript/" + name + ".xy", Math.round(x1) + "," + Math.round(y1) + "," + Math.round(x2) + "," + Math.round(y2));  // L7952
            if (监听函数已运行) {  // L7966
                IMG.recycle();  // L7967
            }
            setTimeout(function() {
    window.close();  // L7977
    return;
}, 500);  // L7972
            return;
        }).show();  // L7981
        } else {
            var txt, x1, y1, x2, y2, w, h, cx, cy, obj, image;
            ui.run(function() {
            ui["要找的字"].setText(name);  // L7987
            toast("已保存:" + name);  // L7988
            return;
        });  // L7984
            txt = v.getText();  // L7990
            var RE_rect = to_newRect(region);  // L7991
            var hhh = -getStatusBarHeight();  // L7992
            x1 = RE_rect.left;  // L7993
            y1 = RE_rect.top - hhh;
            x2 = RE_rect.right;
            y2 = RE_rect.bottom - hhh;
            w = x2 - x1;  // L7997
            h = y2 - y1;
            cx = Math.floor(x1 + w / 2);  // L7999
            cy = Math.floor(y1 + h / 2);
            obj = {region: [x1, y1, w, h], p: {x: cx, y: cy}};  // L8001
            image = images.clip(MainImg, x1, y1, w, h);  // L8008
            images.save(image, "/sdcard/auscript/" + name + ".png");  // L8009
            image.recycle();  // L8010
            MainImg.recycle();  // L8011
            ui["找图范围2"].setText("0,0," + device.width + "," + device.height);  // L8022
            files.write("/sdcard/auscript/" + name + ".xy", Math.round(x1) + "," + Math.round(y1) + "," + Math.round(x2) + "," + Math.round(y2));  // L8023
            if (监听函数已运行) {  // L8024
                IMG.recycle();  // L8025
            }
            setTimeout(function() {
            window.close();  // L8041
            return;
        }, 500);  // L8033
        }
    } else {
        toast("文件名不能为空");  // L8051
    }
    return;  // L8052
});  // L7893
    return;
});  // L7888
                window.cancel.click(function() {
    MainImg.recycle();  // L8066
    window.close();  // L8067
    return;
});  // L8060
                window.cxks.click(function(v) {
    window.setPosition(device.width, 0);  // L8078
    rawInput("请输入您要保存的文件名", "1", function(name) {
    if (name != "" && name != null) {  // L8081
        if (files.exists("/sdcard/auscript/" + name + ".png")) {  // L8082
            dialogs.build({title: "文件已存在，是否覆盖？", positive: "覆盖", negative: "取消"}).on("positive", function() {
            ui.run(function() {
    toast("已保存:" + name);  // L8098
    ui["要找的字"].setText(name);  // L8099
    return;
});  // L8096
            var txt = v.getText();  // L8101
            var RE_rect = to_newRect(region);  // L8102
            var hhh = -getStatusBarHeight();  // L8103
            var x1 = RE_rect.left;  // L8104
            var y1 = RE_rect.top - hhh;
            var x2 = RE_rect.right;
            var y2 = RE_rect.bottom - hhh;
            var w = x2 - x1;  // L8108
            var h = y2 - y1;
            var cx = Math.floor(x1 + w / 2);  // L8110
            var cy = Math.floor(y1 + h / 2);
            var obj = {region: [x1, y1, w, h], p: {x: cx, y: cy}};  // L8112
            var image = images.clip(MainImg, x1, y1, w, h);  // L8121
            images.save(image, "/sdcard/auscript/" + name + ".png");  // L8122
            x1 = x1 - w * 0.3;  // L8125
            if (x1 < 0) {  // L8126
                x1 = 0;
            }
            y1 = y1 - h * 0.3;  // L8127
            if (y1 < 0) {  // L8128
                y1 = 0;
            }
            x2 = x2 + w * 0.3;  // L8129
            if (x2 > device.width) {  // L8130
                x2 = device.width;
            }
            y2 = y2 + h * 0.3;  // L8131
            if (y2 > device.height) {  // L8132
                y2 = device.height;
            }
            ui["找图范围2"].setText(Math.round(x1) + "," + Math.round(y1) + "," + Math.round(x2) + "," + Math.round(y2));  // L8134
            files.write("/sdcard/auscript/" + name + ".xy", Math.round(x1) + "," + Math.round(y1) + "," + Math.round(x2) + "," + Math.round(y2));  // L8136
            setTimeout(function() {
    window.close();  // L8138
    return;
}, 500);  // L8137
            if (监听函数已运行) {  // L8141
                IMG.recycle();  // L8142
            }
            image.recycle();  // L8144
            MainImg.recycle();  // L8145
            return;
        }).show();  // L8146
        } else {
            var txt, x1, y1, x2, y2, w, h, cx, cy, obj, image;
            ui.run(function() {
            ui["要找的字"].setText(name);  // L8150
            toast("已保存:" + name);  // L8151
            return;
        });  // L8149
            txt = v.getText();  // L8153
            var RE_rect = to_newRect(region);  // L8154
            var hhh = -getStatusBarHeight();  // L8155
            x1 = RE_rect.left;  // L8156
            y1 = RE_rect.top - hhh;
            x2 = RE_rect.right;
            y2 = RE_rect.bottom - hhh;
            w = x2 - x1;  // L8160
            h = y2 - y1;
            cx = Math.floor(x1 + w / 2);  // L8162
            cy = Math.floor(y1 + h / 2);
            obj = {region: [x1, y1, w, h], p: {x: cx, y: cy}};  // L8164
            image = images.clip(MainImg, x1, y1, w, h);  // L8171
            images.save(image, "/sdcard/auscript/" + name + ".png");  // L8172
            image.recycle();  // L8173
            MainImg.recycle();  // L8174
            x1 = x1 - w * 0.3;  // L8175
            if (x1 < 0) {  // L8176
                x1 = 0;
            }
            y1 = y1 - h * 0.3;  // L8177
            if (y1 < 0) {  // L8178
                y1 = 0;
            }
            x2 = x2 + w * 0.3;  // L8179
            if (x2 > device.width) {  // L8180
                x2 = device.width;
            }
            y2 = y2 + h * 0.3;  // L8181
            if (y2 > device.height) {  // L8182
                y2 = device.height;
            }
            ui["找图范围2"].setText(Math.round(x1) + "," + Math.round(y1) + "," + Math.round(x2) + "," + Math.round(y2));  // L8184
            files.write("/sdcard/auscript/" + name + ".xy", Math.round(x1) + "," + Math.round(y1) + "," + Math.round(x2) + "," + Math.round(y2));  // L8186
            setTimeout(function() {
            window.close();  // L8188
            return;
        }, 500);  // L8187
            if (监听函数已运行) {  // L8191
                IMG.recycle();  // L8192
            }
        }
    } else {
        toast("文件名不能为空");  // L8198
    }
    return;  // L8199
});  // L8080
    return;
});  // L8076
                window.canvas.post(function() {
    w = window.canvas.getWidth();  // L8207
    h = window.canvas.getHeight();  // L8208
    return;
});  // L8206
                var paint = new Paint();  // L8213
                var paint1 = new Paint();  // L8214
                var paint2 = new Paint();  // L8215
                paint.setStrokeWidth(5);  // L8218
                paint1.setStrokeWidth(5);  // L8219
                paint.setStyle(Paint.Style.STROKE);  // L8220
                paint1.setStyle(Paint.Style.STROKE);  // L8221
                paint2.setStyle(Paint.Style.FILL);  // L8222
                paint["setColor(int)"](colors.RED);  // L8225
                paint1["setColor(int)"](colors.RED);  // L8227
                paint2["setColor(int)"](colors.RED);  // L8229
                paint2.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_OUT));  // L8230
                var radius = 50;  // L8233
                window.canvas.on("draw", function(canvas) {
    hhh = -getStatusBarHeight();  // L8237
    canvas.drawImage(MainImg, 0, hhh, paint);  // L8238
    w = canvas.getWidth();  // L8241
    h = canvas.getHeight();  // L8242
    canvas.drawRect(region, paint);  // L8245
    canvas.drawCircle(region.left, region.top, radius, paint1);  // L8246
    canvas.drawCircle(region.left, region.bottom, radius, paint1);  // L8247
    canvas.drawCircle(region.right, region.top, radius, paint1);  // L8248
    canvas.drawCircle(region.right, region.bottom, radius, paint1);  // L8249
    canvas.drawRect(0, 0, w, h, paint);  // L8250
    return;
});  // L8235
                var touchX = 0;  // L8256
                var touchY = 0;
                window.canvas.setOnTouchListener(new android.view.View.OnTouchListener(function(view, event) {
    try {  // L8260
        var W, H, PC, I, ID, X, Y;
        W = view.getWidth();  // L8262
        H = view.getHeight();  // L8263
        PC = event.getPointerCount();  // L8264
        switch (event.getActionMasked()) {  // L8265
            case event.ACTION_MOVE:
                try {  // L8267
                    for (var i = 0; i < PC; i++) {  // L8268
                        var id, x, y;  // L8268
                        id = event.getPointerId(i);  // L8269
                        x = event.getX(i);  // L8270
                        y = event.getY(i);  // L8271
                        if (touchControlPoint) {  // L8272
                            setRectXY(region, touchControlPoint, x, y);  // L8273
                        } else {
                            var tx, ty;
                            x = sinon(x, touchRegion.left, touchRegion.right);  // L8275
                            y = sinon(y, touchRegion.top, touchRegion.bottom);  // L8276
                            tx = x - touchX;  // L8277
                            ty = y - touchY;
                            var newRegion = new Rect(oldRegion);  // L8279
                            newRegion.offset(tx, ty);  // L8280
                            var region = newRegion;  // L8282
                        }
                    }
                } catch (e) {
                    throw "MOVE " + e;  // L8291
                }
                break;  // L8292
            case event.ACTION_CANCEL:
                toast("触摸被系统拦截\n可能是三指截屏等功能");  // L8297
                break;
            case event.ACTION_OUTSIDE:
                log("OUTSIDE");  // L8300
                break;
            default:
                I = event.getActionIndex();  // L8304
                ID = event.getPointerId(I);  // L8305
                X = event.getX(I);  // L8306
                Y = event.getY(I);  // L8307
                switch (event.getActionMasked()) {  // L8308
                    case event.ACTION_DOWN:
                        try {
                            var resAry;
                            var touchRegion = new Rect(X - region.left, Y - region.top, W + (X - region.right), H + (Y - region.bottom));  // L8312
                            resAry = isRectXY(region, X, Y, radius);  // L8313
                            if (resAry) {  // L8315
                                var Width = deviceWidth();  // L8316
                                var Height = deviceHeight();  // L8318
                                var touchControlPoint = resAry;  // L8319
                            } else {
                                var oldRegion = new Rect(region);  // L8321
                                var touchX = X;  // L8322
                                var touchY = Y;  // L8323
                            }
                        } catch (e) {
                            throw "DOWN " + e;  // L8326
                        }
                        break;  // L8327
                    case event.ACTION_UP:
                        if (touchControlPoint) {  // L8332
                            touchControlPoint = undefined;  // L8333
                        } else {
                            x = sinon(X, touchRegion.left, touchRegion.right);  // L8335
                            y = sinon(Y, touchRegion.top, touchRegion.bottom);  // L8336
                            tx = x - touchX;  // L8337
                            ty = y - touchY;
                            newRegion = new Rect(oldRegion);  // L8339
                            newRegion.offset(tx, ty);  // L8340
                            region = newRegion;  // L8342
                        }
                        break;  // L8345
                    case event.ACTION_POINTER_DOWN:
                        break;
                    case event.ACTION_POINTER_UP:
                }
        }
    } catch (e) {
        throw "imgTouch: " + e;  // L8356
    }
    if (touchControlPoint) {  // L8358
        return true;  // L8359
    }
    return true;  // L8362
}));  // L8260
                return;  // L8561
            });  // L7844
                    }
                    return true;  // L8568
                default:
                    return true;  // L8569
            }
        });  // L7824
        }
    } catch (e) {
        toast("0");  // L8576
    }
    return;  // L8577
});  // L7786
    return;
}

ui["截图"].on("click", function() {
    zbjt();  // L8581
    return;
});  // L8580
function xzztfw() {
    threads.start(function() {
    if (!监听函数已运行) {  // L8587
        if (!是否有截图权限) {  // L8588
            if (!getScreenCapture()) {  // L8589
                toast("请求截图失败！");  // L8590
            } else {
                var 是否有截图权限 = true;  // L8592
            }
        }
    } else {
        events.removeAllTouchListeners();  // L8596
        sleep("100");  // L8597
        var 总代码 = "function getScreenCapture(){let Thread=threads.start(function(){if(auto.service!=null){let Allow=textMatches(/(允许|立即开始|统一)/).findOne(10*1000);if(Allow){Allow.click()}}});if(!requestScreenCapture()){return false}else{Thread.interrupt();return true}};if(!getScreenCapture()){toast(\"请求截图失败！无法执行！\");events.broadcast.emit(\"hello\",\"无截图权限\");exit()};function guangbo(){events.on(\"jiaobenkgz\",function(words){if(words==\"开始截图\"){var image=captureScreen();images.save(image, \"/sdcard/screenshot.png\");events.broadcast.emit(\"hello\",\"截图完毕\")}});setInterval(()=>{},1000)};guangbo();";  // L8598
        e = engines.execScript("hello world", 总代码);  // L8599
        是否有截图权限 = true;  // L8600
    }
    if (是否有截图权限) {  // L8603
        var window1 = floaty.window(new XML(<frame>
                    <button id="action" text="开始选范围" />
                </frame>));  // L8604
        setInterval(function() {
        return;  // L8609
    }, 1000);  // L8609
        window1.setSize(-2, -2);  // L8610
        window1.setPosition(device.width * 0.45, device.height * 0.2);  // L8611
        window1.action.setOnTouchListener(function(view, event) {
        switch (event.getAction()) {  // L8621
            case event.ACTION_DOWN:
                var x = event.getRawX();  // L8623
                var y = event.getRawY();  // L8624
                var window1X = window1.getX();  // L8625
                var window1Y = window1.getY();  // L8626
                return true;  // L8627
            case event.ACTION_MOVE:
                window1.setPosition(window1X + (event.getRawX() - x), window1Y + (event.getRawY() - y));  // L8631
                return true;  // L8633
            case event.ACTION_UP:
                if (Math.abs(event.getRawY() - y) < 10 && Math.abs(event.getRawX() - x) < 10) {  // L8635
                    window1.close();  // L8637
                    var jtxfc = threads.start(function() {
                function to_newRect(rect) {
                x1 = rect.left < rect.right ? rect.right : rect.left;  // L8901
                y1 = rect.top < rect.bottom ? rect.bottom : rect.top;
                x2 = rect.right >= rect.left ? rect.left : rect.right;
                y2 = rect.bottom >= rect.top ? rect.top : rect.bottom;
                return new Rect(x1, y1, x2, y2);  // L8905
                }

                function setRectXY(rect, idAry, x, y) {
                x = sinon(Math.floor(x - idAry[1]), 0, Width);  // L8911
                y = sinon(Math.floor(y - idAry[2]), 0, Height);  // L8912
                switch (idAry[0]) {  // L8914
                    case 0:
                        if (rect.right != x && rect.bottom != y) {  // L8916
                            rect.left = x;  // L8917
                            rect.top = y;  // L8918
                        }
                        break;  // L8919
                    case 1:
                        if (rect.left != x && rect.bottom != y) {  // L8922
                            rect.right = x;  // L8923
                            rect.top = y;  // L8924
                        }
                        break;  // L8925
                    case 2:
                        if (rect.right != x && rect.top != y) {  // L8928
                            rect.left = x;  // L8929
                            rect.bottom = y;  // L8930
                        }
                        break;  // L8931
                    case 3:
                        if (rect.left != x && rect.top != y) {  // L8934
                            rect.right = x;  // L8935
                            rect.bottom = y;  // L8936
                        }
                }
                return;  // L8939
                }

                function sinon(a, b, c) {
                return a >= b && a < c ? a >= b ? b : c : a;  // L8943
                }

                function isRectXY(rect, x, y, r) {
                x1 = x - rect.left;  // L8948
                y1 = y - rect.top;
                x2 = x - rect.right;
                y2 = y - rect.bottom;
                if (weiyi([x1, y1]) <= r) {  // L8953
                    return [0, Math.floor(x1), Math.floor(y1)];  // L8954
                } else {
                    if (weiyi([x2, y1]) <= r) {  // L8956
                        return [1, Math.floor(x2), Math.floor(y1)];  // L8957
                    } else {
                        if (weiyi([x1, y2]) <= r) {  // L8959
                            return [2, Math.floor(x1), Math.floor(y2)];  // L8960
                        } else {
                            if (weiyi([x2, y2]) <= r) {  // L8962
                                return [3, Math.floor(x2), Math.floor(y2)];  // L8963
                            }
                        }
                    }
                }
                return null;  // L8966
                }

                function getOrientation() {
                return context.resources.configuration.orientation == 2 ? "portrait" : "landspace";  // L8970
                }

                function deviceWidth() {
                wm = context.getSystemService("window");  // L8975
                display = wm.getDefaultDisplay();  // L8976
                metrics = new android.util.DisplayMetrics();  // L8977
                display.getRealMetrics(metrics);  // L8978
                return metrics.widthPixels;  // L8980
                }

                function deviceHeight() {
                wm = context.getSystemService("window");  // L8984
                display = wm.getDefaultDisplay();  // L8985
                metrics = new android.util.DisplayMetrics();  // L8986
                display.getRealMetrics(metrics);  // L8987
                return metrics.heightPixels;  // L8989
                }

                function getTimeString() {
                return new java.text.SimpleDateFormat("yyyy_MM_dd_HH:mm:ss").format(new Date());  // L8994
                }

                function 反色(color) {
                return -1 - colors.argb(0, colors.red(color), colors.green(color), colors.blue(color));  // L8999
                }

                function getsd(s, ary) {
                sum = weiyi(ary);  // L9005
                S = s / sum || 0;  // L9006
                for (i = 0; i < ary.length; i++) {
                    ary[i] = ary[i] * S;  // L9008
                }
                return ary;  // L9010
                }

                function weiyi(ary) {
                sum = 0;  // L9015
                for (i = 0; i < ary.length; i++) {
                    sum = sum + Math.pow(ary[i], 2);  // L9017
                }
                return Math.sqrt(sum);  // L9019
                }

                function kdfx(Y) {
                x = Math.cos(Y % 360 / 360 * 2 * Math.PI);  // L9024
                y = Math.sin(Y % 360 / 360 * 2 * Math.PI);  // L9025
                return [x, y];  // L9026
                }

                function ydfx(ary) {
                ary = getsd(1, ary);  // L9031
                x = ary[0];  // L9032
                y = ary[1];
                Y = Math.asin(y) / (2 * Math.PI) * 360;  // L9034
                if (x < 0) {  // L9035
                    Y = 180 - Y;  // L9036
                }
                return Y;  // L9038
                }

                function windowGXY(x, y, k) {
                x = k[0][0] < x && x < k[1][0] ? k[0][0] < x ? k[0][0] : k[1][0] : x;  // L9043
                y = k[0][1] < y && y < k[1][1] ? k[0][1] < y ? k[0][1] : k[1][1] : y;  // L9044
                return {x: x, y: y};  // L9045
                }

                function deepCopy(obj) {
                if (typeof  obj != "object") {  // L9052
                    return obj;  // L9053
                }
                newobj = {};  // L9055
                for (var attr in obj) {  // L9056
                    newobj[attr] = deepCopy(obj[attr]);  // L9057
                }
                return newobj;  // L9059
                }

                function ABCtoast(maxCount) {
                this.ary = [];  // L9064
                this.thread;  // L9065
                this.ji = 0;  // L9066
                this.getTimeString = function() {
    return new java.text.SimpleDateFormat("mm:ss:SSS:/").format(new Date());  // L9069
};  // L9067
                this.addSome = function(T) {
    this.ary.push({time: this.getTimeString(), text: T});  // L9072
    if (this.ary.length > maxCount) {  // L9076
        this.ary = this.ary.slice(-maxCount);  // L9077
    }
    if (this.thread ? true : !this.thread.isAlive()) {  // L9079
        this.thread = threads.start(new java.lang.Runnable(function() {
        sleep(500);  // L9081
        do {  // L9083
            do {  // L9084
                this.ji = this.ji + 0.2;  // L9084
                sleep(50);  // L9085
            } while (this.ji <= 1);
            this.ji = 0;  // L9087
            this.ary.shift();  // L9088
        } while (this.ary.length);
        return;
    }));  // L9080
    }
    return;  // L9091
};  // L9071
                return;
                }

                sleep(100);  // L8642
                if (!监听函数已运行) {  // L8648
                    var IMG = captureScreen();  // L8649
                } else {
                    e.getEngine().emit("jiaobenkgz", "开始截图");  // L8651
                    var 截图完毕 = false;  // L8652
                    while (!截图完毕) {  // L8653
                        sleep(20);  // L8653
                    }
                    IMG = images.read("/sdcard/screenshot.png");  // L8654
                }
                var MainImg = images.copy(IMG);  // L8657
                var Width = deviceWidth();  // L8660
                var Height = deviceHeight();
                var region = new Rect(Width / 3, Height / 3, Width / 3 * 2, Height / 3 * 2);  // L8662
                var window = floaty.rawWindow(new XML(<frame>
                                        <canvas id="canvas" w="*" h="*" />
                                        <horizontal w="auto" h="auto" alpha="0.8" layout_gravity="bottom|center_horizontal">
                                            <button id="ok" text="保存" />
                                            <button id="cancel" text="退出截图" />
                                            <button id="cxks" text="重新截图" />
                                        </horizontal>
                                    </frame>));  // L8666
                window.setSize(-1, -1);  // L8676
                window.ok.click(function(v) {
    var RE_rect = to_newRect(region);  // L8690
    var hhh = -getStatusBarHeight();  // L8691
    var x1 = RE_rect.left;  // L8692
    var y1 = RE_rect.top - hhh;
    var x2 = RE_rect.right;
    var y2 = RE_rect.bottom - hhh;
    ui.run(function() {
    i = ui.sp1.getSelectedItem();  // L8698
    if (i == "控件包含此范围" || i == "匹配范围") {  // L8699
        ui["要找的字"].setText(x1 + "," + y1 + "," + x2 + "," + y2);  // L8700
    } else {
        ui["找图范围2"].setText(x1 + "," + y1 + "," + x2 + "," + y2);  // L8702
    }
    return;
});  // L8696
    if (监听函数已运行) {  // L8706
        IMG.recycle();  // L8707
    }
    MainImg.recycle();  // L8709
    window.close();  // L8710
    return;
});  // L8682
                window.cancel.click(function() {
    if (监听函数已运行) {  // L8718
        IMG.recycle();  // L8719
    }
    MainImg.recycle();  // L8721
    window.close();  // L8722
    return;
});  // L8716
                window.cxks.click(function(v) {
    if (监听函数已运行) {  // L8729
        IMG.recycle();  // L8730
    }
    MainImg.recycle();  // L8732
    xzztfw();  // L8733
    window.close();  // L8734
    return;
});  // L8728
                window.canvas.post(function() {
    w = window.canvas.getWidth();  // L8739
    h = window.canvas.getHeight();  // L8740
    return;
});  // L8738
                var paint = new Paint();  // L8745
                var paint1 = new Paint();  // L8746
                var paint2 = new Paint();  // L8747
                paint.setStrokeWidth(5);  // L8750
                paint1.setStrokeWidth(5);  // L8751
                paint.setStyle(Paint.Style.STROKE);  // L8752
                paint1.setStyle(Paint.Style.STROKE);  // L8753
                paint2.setStyle(Paint.Style.FILL);  // L8754
                paint["setColor(int)"](colors.RED);  // L8757
                paint1["setColor(int)"](colors.RED);  // L8759
                paint2["setColor(int)"](colors.RED);  // L8761
                paint2.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_OUT));  // L8762
                var radius = 50;  // L8765
                window.canvas.on("draw", function(canvas) {
    hhh = -getStatusBarHeight();  // L8769
    canvas.drawImage(MainImg, 0, hhh, paint);  // L8770
    w = canvas.getWidth();  // L8773
    h = canvas.getHeight();  // L8774
    canvas.drawRect(region, paint);  // L8777
    canvas.drawCircle(region.left, region.top, radius, paint1);  // L8778
    canvas.drawCircle(region.left, region.bottom, radius, paint1);  // L8779
    canvas.drawCircle(region.right, region.top, radius, paint1);  // L8780
    canvas.drawCircle(region.right, region.bottom, radius, paint1);  // L8781
    canvas.drawRect(0, 0, w, h, paint);  // L8782
    return;
});  // L8767
                var touchX = 0;  // L8788
                var touchY = 0;
                window.canvas.setOnTouchListener(new android.view.View.OnTouchListener(function(view, event) {
    try {  // L8792
        var W, H, PC, I, ID, X, Y;
        W = view.getWidth();  // L8794
        H = view.getHeight();  // L8795
        PC = event.getPointerCount();  // L8796
        switch (event.getActionMasked()) {  // L8797
            case event.ACTION_MOVE:
                try {  // L8799
                    for (var i = 0; i < PC; i++) {  // L8800
                        var id, x, y;  // L8800
                        id = event.getPointerId(i);  // L8801
                        x = event.getX(i);  // L8802
                        y = event.getY(i);  // L8803
                        if (touchControlPoint) {  // L8804
                            setRectXY(region, touchControlPoint, x, y);  // L8805
                        } else {
                            var tx, ty;
                            x = sinon(x, touchRegion.left, touchRegion.right);  // L8807
                            y = sinon(y, touchRegion.top, touchRegion.bottom);  // L8808
                            tx = x - touchX;  // L8809
                            ty = y - touchY;
                            var newRegion = new Rect(oldRegion);  // L8811
                            newRegion.offset(tx, ty);  // L8812
                            var region = newRegion;  // L8814
                        }
                    }
                } catch (e) {
                    throw "MOVE " + e;  // L8823
                }
                break;  // L8824
            case event.ACTION_CANCEL:
                toast("触摸被系统拦截\n可能是三指截屏等功能");  // L8829
                break;
            case event.ACTION_OUTSIDE:
                log("OUTSIDE");  // L8832
                break;
            default:
                I = event.getActionIndex();  // L8836
                ID = event.getPointerId(I);  // L8837
                X = event.getX(I);  // L8838
                Y = event.getY(I);  // L8839
                switch (event.getActionMasked()) {  // L8840
                    case event.ACTION_DOWN:
                        try {
                            var resAry;
                            var touchRegion = new Rect(X - region.left, Y - region.top, W + (X - region.right), H + (Y - region.bottom));  // L8844
                            resAry = isRectXY(region, X, Y, radius);  // L8845
                            if (resAry) {  // L8847
                                var Width = deviceWidth();  // L8848
                                var Height = deviceHeight();  // L8850
                                var touchControlPoint = resAry;  // L8851
                            } else {
                                var oldRegion = new Rect(region);  // L8853
                                var touchX = X;  // L8854
                                var touchY = Y;  // L8855
                            }
                        } catch (e) {
                            throw "DOWN " + e;  // L8858
                        }
                        break;  // L8859
                    case event.ACTION_UP:
                        if (touchControlPoint) {  // L8864
                            touchControlPoint = undefined;  // L8865
                        } else {
                            x = sinon(X, touchRegion.left, touchRegion.right);  // L8867
                            y = sinon(Y, touchRegion.top, touchRegion.bottom);  // L8868
                            tx = x - touchX;  // L8869
                            ty = y - touchY;
                            newRegion = new Rect(oldRegion);  // L8871
                            newRegion.offset(tx, ty);  // L8872
                            region = newRegion;  // L8874
                        }
                        break;  // L8877
                    case event.ACTION_POINTER_DOWN:
                        break;
                    case event.ACTION_POINTER_UP:
                }
        }
    } catch (e) {
        throw "imgTouch: " + e;  // L8888
    }
    if (touchControlPoint) {  // L8890
        return true;  // L8891
    }
    return true;  // L8894
}));  // L8792
                return;  // L9093
            });  // L8640
                }
                return true;  // L9100
            default:
                return true;  // L9101
        }
    });  // L8620
    }
    return;  // L9102
});  // L8586
    return;
}

function 文本取右边(文本内容, 关键字A, 开始查找位置) {
    if (typeof  文本内容 !== "string") {  // L9111
        文本内容 = 文本内容.toString();  // L9112
    }
    if (文本内容 === "") {  // L9115
        return "";  // L9117
    }
    if (typeof  关键字A !== "string" || 关键字A === "") {  // L9120
        return "";  // L9121
    }
    if (开始查找位置 < 0 && 开始查找位置 !== -1) {  // L9124
        开始查找位置 = 0;  // L9125
    }
    if (开始查找位置 === -1) {  // L9131
        aPos = 文本内容.lastIndexOf(关键字A);  // L9132
    } else {
        aPos = 文本内容.indexOf(关键字A, 开始查找位置);  // L9134
    }
    if (aPos === -1) {  // L9137
        return "";  // L9138
    }
    return 文本内容.substring(aPos + 关键字A.length);  // L9140
}

function 文本取中间(文本内容, 左文本, 右文本) {
    if (typeof  文本内容 !== "string" || 文本内容 === "") {  // L9144
        return "";
    }
    if (typeof  左文本 !== "string" || 左文本 === "") {  // L9145
        return "";
    }
    if (typeof  右文本 !== "string" || 右文本 === "") {  // L9146
        return "";
    }
    aPos = 文本内容.indexOf(左文本);  // L9148
    if (aPos === -1) {  // L9149
        return "";
    }
    bPos = 文本内容.indexOf(右文本, aPos + 左文本.length);  // L9151
    if (bPos === -1) {  // L9152
        return "";
    }
    return 文本内容.substring(aPos + 左文本.length, bPos);  // L9155
}

function 文本取左边(文本内容, 关键字A, 开始查找位置) {
    if (typeof  文本内容 !== "string" || 文本内容 === "") {  // L9159
        return "";
    }
    if (typeof  关键字A !== "string" || 关键字A === "") {  // L9160
        return "";
    }
    if (typeof  开始查找位置 !== "number" || 开始查找位置 < 0) {  // L9161
        开始查找位置 = 0;  // L9162
    }
    aPos = 文本内容.indexOf(关键字A, 开始查找位置);  // L9165
    if (aPos === -1) {  // L9166
        return "";
    }
    return 文本内容.substring(0, aPos);  // L9168
}

function 文本是否为正则表达式(str) {
    if (typeof str !== "string") {  // L9171
        return false;
    }
    try {  // L9172
        new RegExp(str);  // L9173
    } catch (e) {
        return false;  // L9175
    }
    var metaChars = /[.*+?^${}()|[\]\\]/;  // L9178
    return metaChars.test(str);  // L9179
}

function isEmpty(str) {
    return str === undefined || String(str).trim() === "";  // L9183
}

function 输入法输入内容(text) {
    b64 = java.util.Base64.getEncoder().encodeToString(new java.lang.String(text).getBytes("UTF-8"));  // L9187
    i = new Intent();  // L9189
    i.setAction("ADB_INPUT_B64");  // L9190
    i.putExtra("msg", b64);  // L9191
    context.sendBroadcast(i);  // L9192
    return;
}

function 管理键盘() {  // L9194
    intent = new Intent(android.provider.Settings.ACTION_INPUT_METHOD_SETTINGS);  // L9198
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);  // L9199
    context.startActivity(intent);  // L9200
    return;
}

function 切换输入法() {  // L9201
    imm = context.getSystemService(context.INPUT_METHOD_SERVICE);  // L9203
    imm.showInputMethodPicker();  // L9204
    return;
}

function 获取当前输入法() {  // L9205
    id = android.provider.Settings.Secure.getString(context.getContentResolver(), android.provider.Settings.Secure.DEFAULT_INPUT_METHOD);  // L9207
    if (!id) {  // L9211
        return null;
    }
    slash = id.indexOf("/");  // L9213
    return slash > 0 ? id : id.substring(0, slash);  // L9214
}

function checkAdbKeyboard() {  // L9215
    imm = context.getSystemService(context.INPUT_METHOD_SERVICE);  // L9219
    pm = context.getPackageManager();  // L9220
    allList = imm.getInputMethodList();  // L9223
    installed = false;  // L9224
    installedInfo = null;  // L9225
    i = 0;
    while (i < allList.size()) {  // L9227
        info = allList.get(i);  // L9228
        if (info.getPackageName() === "com.android.adbkeyboard") {  // L9229
            installed = true;  // L9230
            installedInfo = info;  // L9231
            break;
        }
        i++;
    }
    enabledList = imm.getEnabledInputMethodList();  // L9237
    enabled = false;  // L9238
    i = 0;
    while (i < enabledList.size()) {  // L9239
        if (enabledList.get(i).getPackageName() === "com.android.adbkeyboard") {  // L9240
            enabled = true;  // L9241
            break;
        }
        i++;
    }
    current = android.provider.Settings.Secure.getString(context.getContentResolver(), android.provider.Settings.Secure.DEFAULT_INPUT_METHOD);  // L9247
    isCurrent = current && current.startsWith("com.android.adbkeyboard");  // L9251
    return {installed: installed, enabled: enabled, isCurrent: isCurrent, currentId: current};  // L9253
}

function 检测输入法() {
    status2 = checkAdbKeyboard();  // L9264
    if (!status2.installed) {  // L9266
        alert("未安装 ADBKeyBoard", "请先安装 ADBKeyBoard.apk\n\n下载地址：\nhttps://gitcode.com/gh_mirrors/ad/ADBKeyBoard\n\n安装后需要重启，再重新运行脚本。");  // L9268
        app.openUrl("https://share.feijipan.com/s/ZldaBIvP");  // L9275
        return;  // L9276
    }
    if (!status2.enabled) {  // L9279
        alert("ADBKeyBoard 未启用", "ADBKeyBoard 已安装，但未在系统中启用。\n\n请前往：\n设置 → 语言和输入法 → 键盘和输入法\n勾选「ADBKeyBoard」");  // L9281
        intent = new Intent(android.provider.Settings.ACTION_INPUT_METHOD_SETTINGS);  // L9288
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);  // L9289
        context.startActivity(intent);  // L9290
        return;  // L9291
    }
    if (!status2.isCurrent) {  // L9294
        alert("ADBKeyBoard 未设为默认", "ADBKeyBoard 已安装并启用，但当前输入法不是它。\n\n请点击「确定」，然后在弹出的列表中选择 ADBKeyBoard。\n\n如果误报可忽略此提示，按实际效果为准。");  // L9296
        imm = context.getSystemService(context.INPUT_METHOD_SERVICE);  // L9303
        imm.showInputMethodPicker();  // L9304
        return;  // L9305
    }
    return;
}
}  // end 启动主程序
