# -*- coding: utf-8 -*-
"""
按 Auto.js Pro 原格式重新加密 main.js
格式: 8 字节头(77 01 17 7f 12 | level | 00 01) + AES-CBC(mKey, iv).encrypt(Scription.e(明文))
  level 18 = ENCRYPTED_SOURCE(源码), 19 = ENCRYPTED_SNAPSHOT(序列化快照)
密钥派生(与 ScriptEncryption.initFingerprint 一致):
  key1 = md5(packageName + versionName + mainScriptFile + versionCode)
  iv   = md5(buildId + name)[:16]
  mKey = AES-CBC(key1, iv).encrypt(PKCS7pad("9a1132118990c3db"))   # 32 字节
"""
import zipfile, json, hashlib, sys
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

def derive(apk_path):
    zf = zipfile.ZipFile(apk_path)
    config = json.loads(zf.read("assets/project/project.json").decode("utf-8"))
    key1 = hashlib.md5(f"{config['packageName']}{config['versionName']}{config['main']}{config['versionCode']}".encode()).hexdigest()
    iv = hashlib.md5(f"{config['build']['build_id']}{config['name']}".encode()).hexdigest()[:16]
    mKey = AES.new(key1.encode(), AES.MODE_CBC, iv.encode()).encrypt(pad(b"9a1132118990c3db", 16))
    return config, key1, iv, mKey

def scription_e(data, ks):
    return bytes((b + ks[i % len(ks)]) & 0xFF for i, b in enumerate(data))

def scription_d(data, ks):
    return bytes((b - ks[i % len(ks)]) & 0xFF for i, b in enumerate(data))

def encrypt_source(src_bytes, mKey, iv, level=18):
    ed = scription_e(src_bytes, mKey)
    ct = AES.new(mKey, AES.MODE_CBC, iv.encode()).encrypt(pad(ed, 16))
    header = bytes([0x77, 0x01, 0x17, 0x7f, 0x12, level, 0x00, 0x01])
    return header + ct

def decrypt_file(enc_bytes, mKey, iv):
    pt = AES.new(mKey, AES.MODE_CBC, iv.encode()).decrypt(enc_bytes[8:])
    return scription_d(pt, mKey)

if __name__ == "__main__":
    apk = sys.argv[1] if len(sys.argv) > 1 else "定时点击器_v3.0.5.apk"
    config, key1, iv, mKey = derive(apk)
    print("packageName:", config["packageName"], "versionName:", config["versionName"], "versionCode:", config["versionCode"])
    print("main:", config["main"], "build_id:", config["build"]["build_id"], "name:", config["name"])
    print("iv:", iv)
    print("mKey(32B):", mKey.hex())
    zf = zipfile.ZipFile(apk)
    enc = zf.read("assets/project/main.js")
    print("原始头:", enc[:8].hex(), "level =", enc[5])
    # 往返验证: 解密 -> 加密(level 18) -> 再解密 -> 比对
    pt = decrypt_file(enc, mKey, iv)
    print("解密长度:", len(pt), "序列化魔数:", pt[:4] == b"\xac\xed\x00\x05")
    # 注意: 原文件是 level19 快照(序列化流), 这里仅验证加解密往返一致性:
    # 用解密出的字节当作"明文"再加密, 应能还原
    enc2 = encrypt_source(pt, mKey, iv, level=19)
    pt2 = decrypt_file(enc2, mKey, iv)
    print("往返一致:", pt == pt2, "| 新密文长度:", len(enc2))
