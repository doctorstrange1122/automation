# -*- coding: utf-8 -*-
"""统计 snapshot 中出现的指令/跳转模式，指导反编译器设计"""
import json
from collections import Counter
from icode_disasm import disassemble, bytecode_span, opname

snap = json.load(open('../snapshot.json'))

op_counter = Counter()
jump_kinds = Counter()
exc_funcs = []
line_minmax = []


def walk(node):
    ic = bytes.fromhex(node['icode'])
    strs = node['strings']
    instrs = disassemble(ic, strs)
    targets = set()
    for ins in instrs:
        op_counter[ins['name']] += 1
        if 'target' in ins:
            targets.add(ins['target'])
    for ins in instrs:
        n = ins['name']
        if n in ('GOTO', 'IFEQ', 'IFNE', 'IFEQ_POP', 'GOSUB', 'LEAVEDQ'):
            t = ins.get('target', ins.get('sub'))
            direction = 'fwd' if t > ins['pc'] else ('back' if t < ins['pc'] else 'self')
            jump_kinds[(n, direction)] += 1
    if node.get('exceptionTable'):
        exc_funcs.append((node['name'], len(node['icode']) // 2,
                          len(node['exceptionTable']), node['exceptionTable'][:2]))
    lines = [ins.get('line') for ins in instrs if ins['name'] == 'LINE']
    if lines:
        line_minmax.append((min(lines), max(lines), len(lines)))
    for ch in node.get('nested', []):
        walk(ch)


walk(snap)
print('== opcode 频次 ==')
for name, c in op_counter.most_common():
    print('  %-24s %d' % (name, c))
print()
print('== 跳转类型 ==')
for (n, d), c in sorted(jump_kinds.items()):
    print('  %-10s %-5s %d' % (n, d, c))
print()
print('== 带异常表的函数 (%d 个) ==' % len(exc_funcs))
for name, il, n, sample in exc_funcs[:20]:
    print('  %-20s icode=%dB entries=%d %s' % (name or '<anon>', il, n, json.dumps(sample)[:160]))
print()
if line_minmax:
    mn = min(x[0] for x in line_minmax)
    mx = max(x[1] for x in line_minmax)
    print('== LINE 行号范围: %d .. %d, 共 %d 个函数含 LINE ==' % (mn, mx, len(line_minmax)))
    # 行号分布密度
    alllines = Counter()
    def walk2(node):
        instrs = disassemble(bytes.fromhex(node['icode']), node['strings'])
        for ins in instrs:
            if ins['name'] == 'LINE':
                alllines[ins['line']] += 1
        for ch in node.get('nested', []):
            walk2(ch)
    walk2(snap)
    top = sorted(alllines.items())
    print('行号出现次数前20:', top[:20])
    print('行号出现次数后20:', top[-20:])
