#!/bin/bash
# 一键重新打包「定时点击器」APK
# 用法:
#   ./build.sh <新main.js> <输出.apk> [keystore.jks] [alias] [storepass]
# 示例:
#   ./build.sh ../main_cloudflare.js 定时点击器_v3.0.5_cf.apk my.jks djq 123456
#   ./build.sh ../main_cloudflare.js 定时点击器_v3.0.5_cf_unsigned.apk   # 不签名
set -e
cd "$(dirname "$0")"

SRC_JS="${1:?用法: ./build.sh <新main.js> <输出.apk> [keystore] [alias] [storepass]}"
OUT_APK="${2:?缺少输出APK路径}"
KEYSTORE="${3:-}"
ALIAS="${4:-djq}"
STOREPASS="${5:-}"

# 原 APK 路径(默认取仓库根目录的定时点击器_v3.0.5.apk, 也可用环境变量 ORIG_APK 指定)
ORIG_APK="${ORIG_APK:-/root/.codebuddy/artifact/2f8a7d30-9c21-4f0b-1d48-f00687158000/apk_work/定时点击器_v3.0.5.apk}"
[ -f "$ORIG_APK" ] || { echo "找不到原 APK: $ORIG_APK (可用 ORIG_APK= 指定)"; exit 1; }

if [ -n "$KEYSTORE" ]; then
    python3 repack.py "$ORIG_APK" "$SRC_JS" "$OUT_APK" --keystore "$KEYSTORE" --alias "$ALIAS" --storepass "$STOREPASS"
else
    python3 repack.py "$ORIG_APK" "$SRC_JS" "$OUT_APK"
fi
echo
echo "完成: $OUT_APK"
echo "提示: 安装前如已装旧版且签名不同, 需先卸载旧版"
