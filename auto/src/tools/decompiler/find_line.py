# -*- coding: utf-8 -*-
"""查找包含指定源码行的函数并反汇编"""
import json
import sys
sys.path.insert(0, '.')
from icode_disasm import disassemble

snap = json.load(open('../snapshot.json'))
target_line = int(sys.argv[1])
ctx = int(sys.argv[2]) if len(sys.argv) > 2 else 25

out = []


def walk(node):
    ic = bytes.fromhex(node['icode'])
    instrs = disassemble(ic, node['strings'])
    for k, ins in enumerate(instrs):
        if ins['name'] == 'LINE' and ins.get('line') == target_line:
            out.append((node, instrs, k))
    for ch in node.get('nested', []):
        walk(ch)


walk(snap)
for node, instrs, k in out:
    print('=' * 70)
    print('函数 [%s] icode=%dB argCount=%d' % (node['name'], len(node['icode']) // 2, node['argCount']))
    if node.get('exceptionTable'):
        print('excTable:', json.dumps(node['exceptionTable']))
    lo = max(0, k - ctx)
    hi = min(len(instrs), k + ctx)
    for idx in range(lo, hi):
        ins = instrs[idx]
        extra = {kk: vv for kk, vv in ins.items() if kk not in ('name',)}
        print('%5d %s %s' % (idx, ins['name'], json.dumps(extra, ensure_ascii=False) if extra else ''))
