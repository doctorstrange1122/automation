# -*- coding: utf-8 -*-
import json

d = json.load(open('../snapshot.json'))
print('name', d['name'], 'sourceFile', d['sourceFile'], 'funcType', d['functionType'],
      'argCount', d['argCount'], 'argNames', d['argNames'])
print('maxLocals', d['maxLocals'], 'maxStack', d['maxStack'], 'maxFrameArray', d['maxFrameArray'])
print('icode len', len(d['icode']) // 2, 'strings', len(d['strings']),
      'literalIds', d['literalIds'], 'doubles', len(d['doubles']))
print('exceptions', json.dumps(d['exceptionTable'], indent=1)[:1500])
print('nested count', len(d['nested']))


def count(node):
    c = 1
    for ch in node.get('nested', []):
        c += count(ch)
    return c


print('total functions', count(d))


def names(node, depth=0, out=None):
    if out is None:
        out = []
    out.append((depth, node['name'], len(node['icode']) // 2, len(node.get('nested', []))))
    for ch in node.get('nested', []):
        names(ch, depth + 1, out)
    return out


ns = names(d)
for depth, name, il, nc in ns[:70]:
    print(' ' * depth + '{} icode={}B nested={}'.format(name or '<anon>', il, nc))
print('...')
print('total', len(ns))
