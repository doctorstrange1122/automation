import struct, json

data = open("decrypted2.bin","rb").read()

class R:
    def __init__(self, d):
        self.d = d; self.p = 0
    def u1(self):
        v = self.d[self.p]; self.p += 1; return v
    def u2(self):
        v = struct.unpack_from(">H", self.d, self.p)[0]; self.p += 2; return v
    def u4(self):
        v = struct.unpack_from(">I", self.d, self.p)[0]; self.p += 4; return v
    def u8(self):
        v = struct.unpack_from(">Q", self.d, self.p)[0]; self.p += 8; return v
    def utf(self):
        ln = self.u2()
        s = self.d[self.p:self.p+ln].decode("utf-8", "replace"); self.p += ln
        return s

    def classdesc(self):
        tc = self.u1()
        assert tc == 0x72, "expect 0x72 got %x @ %d" % (tc, self.p-1)
        name = self.utf()
        suid = self.u8()
        self.p += 1  # flags
        nf = self.u2()
        fields = []
        for _ in range(nf):
            ft = chr(self.u1())
            cn = None
            if ft == 'L':
                cn = self.utf(); fn = self.utf()
            elif ft == '[':
                et = chr(self.u1())
                if et in 'L[':
                    cn = self.utf()
                fn = self.utf()
            else:
                fn = self.utf()
            fields.append((ft, fn, cn))
        assert self.d[self.p] == 0x78, "expect ENDBLOCKDATA got %x @ %d" % (self.d[self.p], self.p)
        self.p += 1
        sup = None
        if self.d[self.p] == 0x72:
            sup = self.classdesc()
        elif self.d[self.p] == 0x70:
            self.p += 1
        return {"cls": name, "suid": suid, "fields": fields, "sup": sup}

    def value(self, ft, fn):
        if ft == 'I': return self.u4()
        if ft == 'J': return self.u8()
        if ft in 'ZB': return self.u1()
        if ft in 'CS': return self.u2()
        if ft == 'F': self.p += 4; return None
        if ft == 'D': self.p += 8; return None
        if ft == 'L': return self.obj()
        return None

    def obj(self):
        tc = self.d[self.p]
        if tc == 0x70:
            self.p += 1; return None
        if tc == 0x74:
            self.p += 1; return {"str": self.utf()}
        if tc == 0x75:  # TC_ARRAY
            self.p += 1
            cd = self.classdesc()
            # 收集类链
            chain = []
            c = cd
            while c:
                chain.append(c); c = c["sup"]
            # 数组元素类型: 类链最顶层
            leaf = chain[-1]
            etype = leaf["fields"][0][0] if leaf["fields"] else None
            n = self.u4()
            arr = []
            if etype == 'I':
                arr = [self.u4() for _ in range(n)]
            elif etype in 'ZBC':
                arr = [self.u1() for _ in range(n)]
            elif etype == 'S':
                arr = [self.u2() for _ in range(n)]
            elif etype == 'J':
                arr = [self.u8() for _ in range(n)]
            elif etype == 'D':
                self.p += 8*n
            elif etype == 'F':
                self.p += 4*n
            elif etype == 'L':
                arr = [self.obj() for _ in range(n)]
            return {"arr": etype, "len": n, "items": arr, "cd": cd}
        if tc != 0x73:
            return {"unk": hex(tc), "at": self.p}
        self.p += 1
        cd = self.classdesc()
        chain = []
        c = cd
        while c:
            chain.append(c); c = c["sup"]
        vals = {}
        for cls in reversed(chain):  # 从最顶层父类开始
            for ft, fn, cn in cls["fields"]:
                vals[fn] = self.value(ft, fn)
        return {"cls": cd["cls"], "suid": cd["suid"], "vals": vals}

r = R(data)
r.p = 4
top = r.obj()
print("顶层:", top["cls"], "SUID=%016x" % top["suid"])
print("字段:", list(top["vals"].keys()))
idata = top["vals"].get("idata")
if idata:
    print("idata 类:", idata["cls"], "SUID=%016x" % idata["suid"])
    print("idata 字段:", {k: (type(v).__name__ if not isinstance(v, dict) else v.get("cls", v.get("str", "?")[:40])) for k, v in idata["vals"].items()})
