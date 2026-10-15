# -*- coding: utf-8 -*-
"""反汇编指定函数（按名字）"""
import json
import sys
from icode_disasm import disassemble

snap = json.load(open('../snapshot.json'))


def find(node, name, out):
    if node['name'] == name:
        out.append(node)
    for ch in node.get('nested', []):
        find(ch, name, out)


targets = sys.argv[1:]
out = []
for t in targets:
    find(snap, t, out)
for node in out:
    ic = bytes.fromhex(node['icode'])
    instrs = disassemble(ic, node['strings'])
    print('=' * 70)
    print('函数 [%s] icode=%dB argCount=%d argNames=%s' % (
        node['name'], len(ic), node['argCount'], node['argNames']))
    print('strings:', json.dumps(node['strings'], ensure_ascii=False)[:600])
    if node.get('exceptionTable'):
        print('excTable:', json.dumps(node['exceptionTable']))
    for ins in instrs:
        extra = {k: v for k, v in ins.items() if k not in ('op', 'name', 'pc')}
        print('  [%4d] %-22s %s' % (ins['pc'], ins['name'],
                                    json.dumps(extra, ensure_ascii=False) if extra else ''))
