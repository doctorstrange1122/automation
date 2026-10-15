# -*- coding: utf-8 -*-
"""
定时点击器 APK 重打包器
流程: 修改后的 main.js 源码 -> level18 加密 -> 替换 APK 内 assets/project/main.js
      -> project.json encryptLevel 同步为 2 -> 删除旧签名 -> jarsigner 重签名(v1)

用法:
  python3 repack.py <原APK> <新main.js> <输出APK> [--keystore ks.jks] [--alias djq] [--storepass xxx]
"""
import zipfile, json, hashlib, shutil, os, sys, subprocess, tempfile
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from encrypt_main import derive, scription_e

def build_new_mainjs(src_bytes, mKey, iv):
    """按 Auto.js Pro 格式加密源码(level 18 = ENCRYPTED_SOURCE)"""
    ed = scription_e(src_bytes, mKey)
    ct = AES.new(mKey, AES.MODE_CBC, iv.encode()).encrypt(pad(ed, 16))
    header = bytes([0x77, 0x01, 0x17, 0x7f, 0x12, 18, 0x00, 0x01])
    return header + ct

def repack(src_apk, new_mainjs_bytes, out_apk, keystore=None, alias="djq", storepass=None, keypass=None):
    config, key1, iv, mKey = derive(src_apk)
    # 1. 生成新加密 main.js
    enc_main = build_new_mainjs(new_mainjs_bytes, mKey, iv)
    print("[1] 新 main.js 加密完成: %d 字节 (level 18)" % len(enc_main))

    # 2. 更新 project.json (encryptLevel 3 -> 2, 与文件头一致)
    zf = zipfile.ZipFile(src_apk)
    pj = json.loads(zf.read("assets/project/project.json").decode("utf-8"))
    pj["encryptLevel"] = 2
    pj_bytes = json.dumps(pj, ensure_ascii=False, indent=2).encode("utf-8")

    # 3. 重写 zip: 替换两个条目, 删除旧签名(SF/RSA/MANIFEST.MF)
    tmp_apk = out_apk + ".unsigned"
    drop = {"META-INF/AUTO_JS_.SF", "META-INF/AUTO_JS_.RSA", "META-INF/MANIFEST.MF"}
    with zipfile.ZipFile(tmp_apk, "w", zipfile.ZIP_DEFLATED) as zo:
        for item in zf.infolist():
            if item.filename in drop:
                continue
            data = zf.read(item.filename)
            if item.filename == "assets/project/main.js":
                data = enc_main
            elif item.filename == "assets/project/project.json":
                data = pj_bytes
            zo.writestr(item, data)
    zf.close()
    print("[2] APK 重写完成(已删旧签名): %s" % tmp_apk)

    # 4. jarsigner 重签名 (v1)
    if keystore:
        cmd = ["jarsigner", "-keystore", keystore, "-sigalg", "SHA256withRSA",
               "-digestalg", "SHA-256", "-signedjar", out_apk, tmp_apk, alias]
        if storepass:
            cmd += ["-storepass", storepass]
        if keypass:
            cmd += ["-keypass", keypass]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print("jarsigner 失败:", r.stderr)
            raise SystemExit(1)
        os.remove(tmp_apk)
        print("[3] 签名完成: %s" % out_apk)
    else:
        shutil.move(tmp_apk, out_apk)
        print("[3] 未提供 keystore, 输出未签名包: %s" % out_apk)
    return out_apk

if __name__ == "__main__":
    src_apk, src_js, out_apk = sys.argv[1], sys.argv[2], sys.argv[3]
    kw = {}
    args = sys.argv[4:]
    for i in range(0, len(args) - 1, 2):
        kw[args[i].lstrip("-")] = args[i + 1]
    repack(src_apk, open(src_js, "rb").read(), out_apk, **kw)
