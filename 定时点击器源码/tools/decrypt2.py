# -*- coding: utf-8 -*-
import zipfile, json, hashlib
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

APK = "定时点击器_v3.0.5.apk"
zf = zipfile.ZipFile(APK)
config = json.loads(zf.read("assets/project/project.json").decode("utf-8"))
data = zf.read("assets/project/main.js")

key1 = hashlib.md5(f"{config['packageName']}{config['versionName']}{config['main']}{config['versionCode']}".encode()).hexdigest()
iv = hashlib.md5(f"{config['build']['build_id']}{config['name']}".encode()).hexdigest()[:16]

# PKCS7 填充后 mKey 为 32 字节
mKey = AES.new(key1.encode(), AES.MODE_CBC, iv.encode()).encrypt(pad(b"9a1132118990c3db", 16))
print("mKey(32B):", mKey.hex())

pt = AES.new(mKey, AES.MODE_CBC, iv.encode()).decrypt(data[8:])
result = bytes((b - mKey[i % len(mKey)]) & 0xFF for i, b in enumerate(pt))
open("decrypted2.bin", "wb").write(result)
print("长度:", len(result))
print("前16字节:", result[:16].hex())
print("Java序列化魔数:", result[:4] == b"\xac\xed\x00\x05")
