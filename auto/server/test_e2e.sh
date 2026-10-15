#!/usr/bin/env bash
# 端到端验证: 激活(lx=28) -> 启动校验(lx=29) -> 后台作废 -> 立即失效
# 用 curl 直连 (urllib 在本沙箱易被 Cloudflare 边缘 403 挑战)
set -u
CF="https://automation-activation.pages.dev"
TOKEN="362521f0335bce2cf2e0a12318705366f97e9e9717769d06"
ADMIN_PWD=$(grep -E '^ADMI' /tmp/secrets.txt | cut -d= -f2)
IMEI="abcdef1234567890"; IMEI2="deadbeef00000000"
ID="2601010001234567890"; XIM=$(( ${ID:3:5} * 3 )); SG="12345678"
ok=0; fail=0
ck(){ if [ "$2" = "1" ]; then ok=$((ok+1)); echo "  [✓] $1"; else fail=$((fail+1)); echo "  [✗] $1  $3"; fi; }
slp(){ sleep 0.6; }

echo "== 1. lx=26 激活提示(关闭试用) =="
R=$(curl -s "$CF/lx=26?IMEI=$IMEI&sg=$SG&bbh=305&id=$ID&token=$TOKEN"); echo "   $R"
echo "$R" | grep -q "<ok>" && ck "含<ok>提示" 1 || ck "含<ok>提示" 0 "$R"
( echo "$R" | grep -qE "体验|试用" ) && ck "不再发放试用" 0 "$R" || ck "不再发放试用" 1

echo "== 2. 管理后台登录鉴权 =="
R=$(curl -s -X POST "$CF/api/key/admin/login" -H "X-Admin-Pwd: $ADMIN_PWD")
echo "   正确密码: $R"; echo "$R" | grep -q '"ok":true' && ck "正确密码登录成功" 1 || ck "正确密码登录成功" 0 "$R"
R=$(curl -s -X POST "$CF/api/key/admin/login" -H "X-Admin-Pwd: wrong")
echo "   错误密码: $R"; echo "$R" | grep -q '"ok":false' && ck "错误密码被拒" 1 || ck "错误密码被拒" 0 "$R"
slp

echo "== 3. 生成激活码 (count=2, days=30) =="
R=$(curl -s -X POST "$CF/api/key/admin/generate" -H "X-Admin-Pwd: $ADMIN_PWD" --data "count=2&days=30"); echo "   $R"
CODE=$(echo "$R" | sed -E 's/.*"codes":\["([^"]+)".*/\1/')
echo "   取到码: $CODE"
[ -n "$CODE" ] && ck "生成返回码" 1 || ck "生成返回码" 0 "$R"
slp

echo "== 4. lx=28 首次激活(绑定本机) =="
R=$(curl -s "$CF/lx=28?IMEI=$IMEI&sg=$SG&ys=$CODE&bbh=305&id=$ID&token=$TOKEN"); echo "   ${R:0:80}..."
echo "$R" | grep -q "<ok>" && ck "返回<ok>" 1 || ck "返回<ok>" 0 "$R"
if echo "$R" | grep -q "<ok>"; then
  EXP=${R:16:13}; SGB=${R:35:8}; XYM=${R:56}; XYM=${XYM%%<*}
  echo "$EXP" | grep -qE '^[0-9]{13}$' && [ "$EXP" -gt "$(date +%s)000" ] && ck "到期13位且未来" 1 || ck "到期13位且未来" 0 "exp=$EXP"
  [ "$SGB" = "$SG" ] && ck "sg原样回显" 1 || ck "sg原样回显" 0 "$SGB!=$SG"
  [ "$XYM" = "$XIM" ] && ck "xym正确" 1 || ck "xym正确" 0 "$XYM!=$XIM"
fi
slp

echo "== 5. lx=29 启动校验(同机) =="
R=$(curl -s "$CF/lx=29?IMEI=$IMEI&sg=$SG&code=$CODE&bbh=305&id=$ID&token=$TOKEN")
echo "$R" | grep -q "<ok>" && ck "同机校验通过<ok>" 1 || ck "同机校验通过<ok>" 0 "$R"
slp

echo "== 6. lx=29 换机(不同IMEI) =="
R=$(curl -s "$CF/lx=29?IMEI=$IMEI2&sg=$SG&code=$CODE&bbh=305&id=$ID&token=$TOKEN")
echo "$R" | grep -q "<sb>" && ck "换机被锁<sb>" 1 || ck "换机被锁<sb>" 0 "$R"
slp

echo "== 7. 后台作废 =="
R=$(curl -s -X POST "$CF/api/key/admin/revoke" -H "X-Admin-Pwd: $ADMIN_PWD" --data "code=$CODE"); echo "   $R"
echo "$R" | grep -q '"ok":true' && ck "作废成功" 1 || ck "作废成功" 0 "$R"
slp

echo "== 8. 作废后 lx=29 立即失效 =="
R=$(curl -s "$CF/lx=29?IMEI=$IMEI&sg=$SG&code=$CODE&bbh=305&id=$ID&token=$TOKEN")
( echo "$R" | grep -q "<sb>" ) && ck "作废后拒绝<sb>" 1 || ck "作废后拒绝<sb>" 0 "$R"
( echo "$R" | grep -q "作废" ) && ck "提示含'作废'" 1 || ck "提示含'作废'" 0 "$R"
slp

echo "== 9. 后台列表统计 =="
R=$(curl -s -X POST "$CF/api/key/admin/list" -H "X-Admin-Pwd: $ADMIN_PWD"); echo "   $R"
echo "$R" | grep -qE '"revoked":[1-9]' && ck "列表含已作废统计" 1 || ck "列表含已作废统计" 0 "$R"

echo ""; echo "结果: 通过 $ok / 失败 $fail"
