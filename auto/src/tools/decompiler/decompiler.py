# -*- coding: utf-8 -*-
"""
Rhino ICode -> JavaScript 反编译器
输入: DumpJson.java 导出的 snapshot.json (AutoJs Pro encryptLevel 3 快照)
输出: 近似的 JS 源码

依据 Rhino 1.7.14 Interpreter/CodeGenerator 语义实现:
  IFEQ(6)  弹条件, 为真跳转      IFNE(7) 为假跳转      GOTO(5) 无条件
  CALL f,this,a0..aN -> r       PROP_AND_THIS: obj -> [obj.m 函数, obj]
  字面量: LITERAL_NEW n / LITERAL_SET / OBJECTLIT id / ARRAYLIT
  try/catch: exceptionTable 6 项/条 [tryStart,tryEnd,handler,type(0=catch,1=finally),excLocal,scopeLocal]
"""
import json
import re
from icode_disasm import disassemble

# ---------------------------------------------------------------- 表达式优先级
P_ATOM = 100
P_CALL = 95
P_MEMBER = 94
P_UNARY = 14
P_EXP = 13
P_MUL = 12
P_ADD = 11
P_SHIFT = 10
P_REL = 9
P_EQ = 8
P_BITAND = 7
P_BITXOR = 6
P_BITOR = 5
P_LOGAND = 4
P_LOGOR = 3
P_COND = 2
P_ASSIGN = 1

IDENT_RE = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')
# 简单字面量: 数字 / 字符串 / true / false / null / undefined
LITERAL_RE = re.compile(
    r"""^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$   # 数字
        |^'[^']*'$                            # 单引号字符串
        |^"[^"]*"$                            # 双引号字符串
        |^(true|false|null|undefined)$        # 关键字
    """, re.X)


def is_ident(s):
    return bool(IDENT_RE.match(s))


class E:
    """表达式: 文本 + 顶层运算符优先级 (+ 可选字符串字面量值 + 可选 XML 片段表)"""
    __slots__ = ('t', 'p', 's', 'xp', 'uo', 'solo')

    def __init__(self, t, p=P_ATOM, s=None, xp=None, uo=None, solo=None):
        self.t = t
        self.p = p
        self.s = s  # 若为字符串字面量, 保存其未转义值
        self.xp = xp  # XML 字面量片段: [('s', 静态文本) | ('e', 插值表达式文本)]
        self.uo = uo  # 纯 undefined 属性对象(变量提升): 属性名列表
        self.solo = solo  # 单标识符属性对象(循环变量提升): (属性名, 值表达式E)

    def __repr__(self):
        return self.t


def wrap(e, need):
    """按需要的优先级包裹子表达式"""
    if e.p < need:
        return '(' + e.t + ')'
    return e.t


def num_lit(d):
    if d == int(d) and abs(d) < 1e15:
        return str(int(d))
    return repr(d)


def js_string(s):
    return json.dumps(s, ensure_ascii=False)


# ---------------------------------------------------------------- 函数封装
class Func:
    def __init__(self, node, parent=None):
        self.node = node
        self.parent = parent
        self.name = node['name']
        self.arg_count = node['argCount']
        self.arg_names = node['argNames']
        self.strings = node['strings']
        self.doubles = node['doubles']
        self.literal_ids = node['literalIds']
        self.regexps = node['regexps']
        self.exc_raw = node['exceptionTable']
        self.instrs = disassemble(bytes.fromhex(node['icode']), self.strings)
        self.pc2idx = {}
        for i, ins in enumerate(self.instrs):
            self.pc2idx[ins['pc']] = i
        self.n = len(self.instrs)
        # 跳转目标集合(pc)
        self.targets = set()
        for ins in self.instrs:
            if 'target' in ins:
                self.targets.add(ins['target'])
            if 'sub' in ins:
                self.targets.add(ins['sub'])
        # 异常表 -> 条目
        self.exc = []
        t = self.exc_raw
        for i in range(0, len(t) - 5, 6):
            self.exc.append({
                'tryStart': t[i], 'tryEnd': t[i + 1], 'handler': t[i + 2],
                'type': t[i + 3], 'excLocal': t[i + 4], 'scopeLocal': t[i + 5],
            })
        # try 区域起点(pc) -> 异常条目
        self.try_at = {}
        for e in self.exc:
            if e['type'] == 0 and e['tryStart'] not in self.try_at:
                self.try_at[e['tryStart']] = e
        # do-while 回边: 反向 IFEQ(真跳转)且 [bodyStart, ifeq) 内无跳出范围的跳转
        # 且 bodyStart 之前没有 GOTO 跳到该区域(否则是 for/while 的 cond 回边)
        self.dowhile_at = {}
        for idx, ins in enumerate(self.instrs):
            if ins['name'] != 'IFEQ' or 'target' not in ins:
                continue
            bs = self.tidx(ins['target'])
            if bs is None or bs >= idx or bs == 0:
                continue
            is_for = False
            for k in range(bs):
                s = self.instrs[k]
                if s['name'] == 'GOTO' and 'target' in s:
                    t = self.tidx(s['target'])
                    if t is not None and bs <= t < idx:
                        is_for = True
                        break
            if is_for:
                continue
            ok = True
            for s in self.instrs[bs:idx]:
                if 'target' in s:
                    t = self.tidx(s['target'])
                    if t is None or t < bs or t > idx:
                        ok = False
                        break
            if ok:
                self.dowhile_at[bs] = idx
        # 嵌套函数
        self.nested = [Func(ch, self) for ch in node.get('nested', [])]
        # CLOSURE_EXPR/CLOSURE_STMT 引用
        self.closure_refs = set()
        for ins in self.instrs:
            if ins['name'] in ('CLOSURE_EXPR', 'CLOSURE_STMT') and 'nestedIdx' in ins:
                self.closure_refs.add(ins['nestedIdx'])

    def tidx(self, pc):
        """pc -> 指令下标; 越界返回边界值"""
        if pc in self.pc2idx:
            return self.pc2idx[pc]
        return None

    def var_name(self, idx):
        if 0 <= idx < len(self.arg_names):
            return self.arg_names[idx]
        return 'v%d' % idx


# ---------------------------------------------------------------- 反编译器
class Decompiler:
    def __init__(self, func):
        self.f = func
        self.out = []            # 输出行 (已缩进)
        self.stack = []          # 符号栈: E 或 ('CALLEE', E_fn, E_this) 或 ('LIT', kind, [E...], litId)
        self.logic = {}          # target_idx -> ('or'|'and', E)
        self.cur_line = None
        self.line_hint = None
        self.seen_names = set()  # 已出现的全局名(用于 var 声明推断)
        self.loop_stack = []     # (body_start_idx, cond_idx, end_idx)
        self.switch_end = []     # switch 结束 idx 栈
        self.with_objs = {}      # local slot -> with 对象表达式
        self.catch_names = {}    # local slot -> catch 参数名
        self.pending_lit = None
        self.try_done = set()      # 已处理的 try 起点下标
        self.dowhile_done = set()  # 已处理的 do-while 起点下标
        # let (x = v) 提升: ENTERWITH 处发射的 "var x = v;" 语句
        # (完整行文本, 去分号文本), 供紧随的 for 循环头部承载
        self.pending_init = None
        # with 嵌套栈: True=变量提升假 with(不发射 }), False=真实 with(需发射 })
        # 必须用栈而非计数器: 函数级 uo with 横跨整个函数体, 其中嵌套的
        # 真实 with 的 LEAVEWITH 会被待处理的 fake 计数误吞
        self.with_stack = []

    # ---------------- 输出助手
    def emit(self, indent, text):
        self.out.append('    ' * indent + text)

    def stmt(self, indent, text, line=None):
        """发射一条语句, 附带源码行号注释"""
        if line is not None and line != self.cur_line:
            self.cur_line = line
            self.emit(indent, text + '  // L%d' % line)
        else:
            self.emit(indent, text)

    def note(self, indent, text):
        self.emit(indent, '// [反编译] ' + text)

    # ---------------- 栈操作
    def push(self, e):
        self.stack.append(e)

    def pop(self):
        return self.stack.pop()

    def popE(self):
        e = self.stack.pop()
        if not isinstance(e, E):
            return E(str(e))
        return e

    # ---------------- 主循环: 处理 [lo, hi) 范围的指令
    def run(self, lo, hi, indent):
        f = self.f
        i = lo
        while i < hi:
            ins = f.instrs[i]
            name = ins['name']
            pc = ins['pc']

            if name == 'LINE':
                self.line_hint = ins['line']
                # try 区域起点可能正落在 LINE 上(Rhino 在 try 前发射 LINE),
                # 必须在此分支也检查异常表, 否则 try 不会被结构化
                if pc in self.f.try_at and i not in self.try_done:
                    r = self._emit_try(self.f.try_at[pc], i, hi, indent)
                    if r is not None:
                        i = r
                        continue
                    self.try_done.add(i)  # 失败不再重试
                # do-while 回边起点同理可能落在 LINE 上
                if i in self.f.dowhile_at and i not in self.dowhile_done:
                    r = self._emit_dowhile(i, self.f.dowhile_at[i], hi, indent)
                    if r is not None:
                        i = r
                        continue
                    self.dowhile_done.add(i)  # 失败不再重试
                i += 1
                continue

            # ---------- 逻辑或/与 收尾
            if i in self.logic:
                kind, left = self.logic.pop(i)
                right = self.popE()
                sym = '||' if kind == 'or' else '&&'
                self.push(E('%s %s %s' % (wrap(left, P_LOGOR if kind == 'or' else P_LOGAND),
                                          sym, wrap(right, P_LOGOR if kind == 'or' else P_LOGAND)),
                            P_LOGOR if kind == 'or' else P_LOGAND))

            # ---------- try 区域起点(异常表驱动)
            if pc in self.f.try_at and i not in self.try_done:
                r = self._emit_try(self.f.try_at[pc], i, hi, indent)
                if r is not None:
                    i = r
                    continue
                self.try_done.add(i)  # 失败不再重试, 按普通指令继续

            # ---------- do-while 回边起点
            if i in self.f.dowhile_at and i not in self.dowhile_done:
                r = self._emit_dowhile(i, self.f.dowhile_at[i], hi, indent)
                if r is not None:
                    i = r
                    continue
                self.dowhile_done.add(i)  # 失败不再重试, 按普通指令继续

            # ---------- switch case 链: DUP; <test>; SHEQ; IFEQ_POP ...
            if name == 'DUP':
                sw = self._switch_chain_at(i, hi)
                if sw is not None:
                    r = self._emit_switch(sw, i, hi, indent)
                    if r is not None:
                        i = r
                        continue

            handler = getattr(self, 'op_' + name, None)
            if handler is not None:
                res = handler(ins, i, hi, indent)
                if res is not None:
                    i = res
                    continue
            else:
                self.unhandled(ins, i, indent)
            i += 1

    def unhandled(self, ins, i, indent):
        self.note(indent, '未处理指令 %s @pc%d' % (ins['name'], ins['pc']))

    # ================================================================ 指令实现
    # ---- 常量
    def op_ZERO(self, ins, i, hi, ind):
        self.push(E('0'))
    def op_ONE(self, ins, i, hi, ind):
        self.push(E('1'))
    def op_TRUE(self, ins, i, hi, ind):
        self.push(E('true'))
    def op_FALSE(self, ins, i, hi, ind):
        self.push(E('false'))
    def op_NULL(self, ins, i, hi, ind):
        self.push(E('null'))
    def op_UNDEF(self, ins, i, hi, ind):
        self.push(E('undefined'))
    def op_THIS(self, ins, i, hi, ind):
        self.push(E('this'))
    def op_THISFN(self, ins, i, hi, ind):
        # 命名函数表达式的自绑定: BINDNAME x; THISFN; SETNAME x; POP
        # 这是编译器把函数名绑定到函数自身, 不对应源码语句, 整段跳过
        f = self.f
        if i >= 1 and f.instrs[i - 1]['name'] == 'BINDNAME' \
                and f.instrs[i - 1].get('stringReg') == self.f.name:
            j = i + 1
            while j < hi and f.instrs[j]['name'].startswith('REG_'):
                j += 1
            if j < hi and f.instrs[j]['name'] == 'SETNAME' \
                    and f.instrs[j].get('stringReg') == self.f.name:
                j += 1
                while j < hi and f.instrs[j]['name'].startswith('REG_'):
                    j += 1
                if j < hi and f.instrs[j]['name'] in ('POP', 'POP_RESULT'):
                    if self.stack:  # 弹出 BINDNAME 的绑定
                        self.stack.pop()
                    return j + 1
        self.push(E('this' if not self.f.name else '/*thisFn*/ %s' % self.f.name))

    def op_SHORTNUMBER(self, ins, i, hi, ind):
        self.push(E(str(ins['value'])))
    def op_INTNUMBER(self, ins, i, hi, ind):
        self.push(E(str(ins['value'])))
    def op_NUMBER(self, ins, i, hi, ind):
        idx = ins['doubleIdx']
        d = self.f.doubles[idx] if idx < len(self.f.doubles) else 0
        self.push(E(num_lit(d)))
    def op_STRING(self, ins, i, hi, ind):
        s = ins['stringReg']
        self.push(E(js_string(s), P_ATOM, s))
    def op_BIGINT(self, ins, i, hi, ind):
        self.push(E('0n'))

    def op_REGEXP(self, ins, i, hi, ind):
        idx = ins.get('regexpIdx', 0)
        if idx < len(self.f.regexps) and self.f.regexps[idx]:
            src, flags = self.f.regexps[idx]
            fl = ''
            if flags & 1:
                fl += 'i'
            if flags & 2:
                fl += 'g'
            if flags & 4:
                fl += 'm'
            self.push(E('/%s/%s' % (src, fl)))
        else:
            self.push(E('/?/'))

    # ---- 名字/变量
    def op_NAME(self, ins, i, hi, ind):
        self.push(E(ins['stringReg']))
    def op_BINDNAME(self, ins, i, hi, ind):
        self.push(E(ins['stringReg']))
    def op_TYPEOFNAME(self, ins, i, hi, ind):
        self.push(E('typeof %s' % ins['stringReg'], P_UNARY))
    def op_DELNAME(self, ins, i, hi, ind):
        self.push(E('delete %s' % ins['stringReg'], P_UNARY))

    def _var(self, idx):
        return E(self.f.var_name(idx))

    def op_GETVAR1(self, ins, i, hi, ind):
        self.push(self._var(ins['varIdx']))
    def op_GETVAR(self, ins, i, hi, ind):
        self.push(self._var(ins['varIdx']))
    def op_SETVAR1(self, ins, i, hi, ind):
        v = self.popE()
        self.push(E('%s = %s' % (self.f.var_name(ins['varIdx']), wrap(v, P_ASSIGN)), P_ASSIGN))
    def op_SETVAR(self, ins, i, hi, ind):
        v = self.popE()
        self.push(E('%s = %s' % (self.f.var_name(ins['varIdx']), wrap(v, P_ASSIGN)), P_ASSIGN))
    def op_SETCONSTVAR1(self, ins, i, hi, ind):
        v = self.popE()
        self.push(E('%s = %s' % (self.f.var_name(ins['varIdx']), wrap(v, P_ASSIGN)), P_ASSIGN))
    def op_SETCONST(self, ins, i, hi, ind):
        v = self.popE()
        self.push(E('%s = %s' % (ins['stringReg'], wrap(v, P_ASSIGN)), P_ASSIGN))

    # ---- 属性/元素
    def _member(self, obj, key):
        if is_ident(key):
            return E('%s.%s' % (wrap(obj, P_MEMBER), key), P_MEMBER)
        return E('%s[%s]' % (wrap(obj, P_MEMBER), js_string(key)), P_MEMBER)

    def op_GETPROP(self, ins, i, hi, ind):
        obj = self.popE()
        self.push(self._member(obj, ins['stringReg']))
    def op_GETPROPNOWARN(self, ins, i, hi, ind):
        obj = self.popE()
        self.push(self._member(obj, ins['stringReg']))
    def op_SETPROP(self, ins, i, hi, ind):
        v = self.popE()
        obj = self.popE()
        self.push(E('%s = %s' % (self._member(obj, ins['stringReg']).t, wrap(v, P_ASSIGN)), P_ASSIGN))
    def op_GETELEM(self, ins, i, hi, ind):
        idv = self.popE()
        obj = self.popE()
        self.push(E('%s[%s]' % (wrap(obj, P_MEMBER), wrap(idv, P_ATOM)), P_MEMBER))
    def op_SETELEM(self, ins, i, hi, ind):
        v = self.popE()
        idv = self.popE()
        obj = self.popE()
        self.push(E('%s[%s] = %s' % (wrap(obj, P_MEMBER), wrap(idv, P_ATOM), wrap(v, P_ASSIGN)), P_ASSIGN))
    def op_DELPROP(self, ins, i, hi, ind):
        idv = self.popE()
        obj = self.popE()
        self.push(E('delete %s[%s]' % (wrap(obj, P_MEMBER), wrap(idv, P_ATOM)), P_UNARY))

    # ---- 二元运算
    BIN = {
        'ADD': ('+', P_ADD), 'SUB': ('-', P_ADD), 'MUL': ('*', P_MUL),
        'DIV': ('/', P_MUL), 'MOD': ('%', P_MUL), 'EXP': ('**', P_EXP),
        'BITOR': ('|', P_BITOR), 'BITXOR': ('^', P_BITXOR), 'BITAND': ('&', P_BITAND),
        'LSH': ('<<', P_SHIFT), 'RSH': ('>>', P_SHIFT), 'URSH': ('>>>', P_SHIFT),
        'EQ': ('==', P_EQ), 'NE': ('!=', P_EQ), 'SHEQ': ('===', P_EQ), 'SHNE': ('!==', P_EQ),
        'LT': ('<', P_REL), 'LE': ('<=', P_REL), 'GT': ('>', P_REL), 'GE': ('>=', P_REL),
        'IN': ('in', P_REL), 'INSTANCEOF': ('instanceof', P_REL),
    }

    def _bin(self, name):
        sym, prec = self.BIN[name]
        b = self.popE()
        a = self.popE()
        if name == 'ADD' and a.s is not None and b.s is not None:
            # 相邻字符串字面量合并
            self.push(E(js_string(a.s + b.s), P_ADD, a.s + b.s))
            return
        text = '%s %s %s' % (wrap(a, prec), sym, wrap(b, prec + 1))
        xp = None
        if a.xp is not None or b.xp is not None:
            xp = self._merge_xml_parts(a, b)
        self.push(E(text, prec, xp=xp))

    # ---- XML 字面量片段跟踪
    # Rhino 把 E4X 字面量 <a b="{x}">c{y}</a> 编译为:
    #   new XML("<a b=\"" + ESCXMLATTR(x) + "\">c" + ESCXMLTEXT(y) + "</a>")
    # 逆向: STRING -> ('s', 文本); ESCXML* -> ('e', 插值); ADD 合并;
    # 编译器为属性插值加的包裹引号 '"' 在合并时剔除。
    @staticmethod
    def _xml_parts_of(e):
        if e.xp is not None:
            return list(e.xp)
        if e.s is not None:
            return [('s', e.s)]
        return [('e', e.t)]

    @classmethod
    def _merge_xml_parts(cls, a, b):
        parts = cls._xml_parts_of(a) + cls._xml_parts_of(b)
        out = []
        for idx, (kind, val) in enumerate(parts):
            if kind == 's' and val == '"':
                prev_e = idx > 0 and parts[idx - 1][0] == 'e'
                next_e = idx + 1 < len(parts) and parts[idx + 1][0] == 'e'
                if prev_e or next_e:
                    continue  # 编译器为属性插值添加的包裹引号
            out.append((kind, val))
        return out

    @staticmethod
    def _e4x_literal(xp):
        """XML 片段表 -> E4X XML 字面量文本(不含 new XML(...) 外壳)"""
        buf = []
        for kind, val in xp:
            if kind == 's':
                buf.append(val)
            else:
                buf.append('{%s}' % val if val else '{}')
        return ''.join(buf)

    def op_ADD(self, ins, i, hi, ind): self._bin('ADD')
    def op_SUB(self, ins, i, hi, ind): self._bin('SUB')
    def op_MUL(self, ins, i, hi, ind): self._bin('MUL')
    def op_DIV(self, ins, i, hi, ind): self._bin('DIV')
    def op_MOD(self, ins, i, hi, ind): self._bin('MOD')
    def op_EXP(self, ins, i, hi, ind): self._bin('EXP')
    def op_BITOR(self, ins, i, hi, ind): self._bin('BITOR')
    def op_BITXOR(self, ins, i, hi, ind): self._bin('BITXOR')
    def op_BITAND(self, ins, i, hi, ind): self._bin('BITAND')
    def op_LSH(self, ins, i, hi, ind): self._bin('LSH')
    def op_RSH(self, ins, i, hi, ind): self._bin('RSH')
    def op_URSH(self, ins, i, hi, ind): self._bin('URSH')
    def op_EQ(self, ins, i, hi, ind): self._bin('EQ')
    def op_NE(self, ins, i, hi, ind): self._bin('NE')
    def op_SHEQ(self, ins, i, hi, ind): self._bin('SHEQ')
    def op_SHNE(self, ins, i, hi, ind): self._bin('SHNE')
    def op_LT(self, ins, i, hi, ind): self._bin('LT')
    def op_LE(self, ins, i, hi, ind): self._bin('LE')
    def op_GT(self, ins, i, hi, ind): self._bin('GT')
    def op_GE(self, ins, i, hi, ind): self._bin('GE')
    def op_IN(self, ins, i, hi, ind): self._bin('IN')
    def op_INSTANCEOF(self, ins, i, hi, ind): self._bin('INSTANCEOF')

    # ---- 一元运算
    def _un(self, sym, prec=P_UNARY, space=''):
        a = self.popE()
        self.push(E('%s%s%s' % (sym, space, wrap(a, P_UNARY)), prec))

    def op_NOT(self, ins, i, hi, ind): self._un('!')
    def op_BITNOT(self, ins, i, hi, ind): self._un('~')
    def op_NEG(self, ins, i, hi, ind): self._un('-')
    def op_POS(self, ins, i, hi, ind): self._un('+')
    def op_TYPEOF(self, ins, i, hi, ind): self._un('typeof ', space=' ')

    # ---- 调用
    def op_PROP_AND_THIS(self, ins, i, hi, ind):
        obj = self.popE()
        self.stack.append(('CALLEE', self._member(obj, ins['stringReg']), obj))

    def op_NAME_AND_THIS(self, ins, i, hi, ind):
        self.stack.append(('CALLEE', E(ins['stringReg']), None))

    def op_ELEM_AND_THIS(self, ins, i, hi, ind):
        idv = self.popE()
        obj = self.popE()
        self.stack.append(('CALLEE', E('%s[%s]' % (wrap(obj, P_MEMBER), wrap(idv, P_ATOM)), P_MEMBER), obj))

    def op_VALUE_AND_THIS(self, ins, i, hi, ind):
        v = self.popE()
        self.stack.append(('CALLEE', E('(%s)' % v.t, P_ATOM), v))

    def _do_call(self, n, new=False):
        args = []
        for _ in range(n):
            args.append(self.popE())
        args.reverse()
        top = self.stack.pop()
        if isinstance(top, tuple) and top[0] == 'CALLEE':
            fn = top[1]
        else:
            fn = top
        argstr = ', '.join(wrap(a, P_ASSIGN) for a in args)
        if new:
            # XML 字面量: new XML(<...>) -> 还原为 E4X 字面量形式
            if fn.t in ('XML', 'XMLList') and len(args) == 1:
                xp = self._xml_literal_parts(args[0])
                if xp is not None:
                    self.push(E('new %s(%s)' % (fn.t, self._e4x_literal(xp)), P_CALL))
                    return
            self.push(E('new %s(%s)' % (wrap(fn, P_MEMBER), argstr), P_CALL))
        else:
            # 被调用表达式须为 MemberExpression: 标识符/成员访问不必加括号
            self.push(E('%s(%s)' % (wrap(fn, P_MEMBER), argstr), P_CALL))

    @classmethod
    def _xml_literal_parts(cls, arg):
        """判断参数是否为 XML 字面量, 返回片段表或 None"""
        if arg.xp is not None:
            return arg.xp
        if arg.s is not None:
            s = arg.s
            st = s.lstrip()
            if st.startswith('<') and s.rstrip().endswith('>'):
                return [('s', s)]
        return None

    def op_CALL(self, ins, i, hi, ind):
        self._do_call(ins['indexReg'])
    def op_TAIL_CALL(self, ins, i, hi, ind):
        self._do_call(ins['indexReg'])
    def op_REF_CALL(self, ins, i, hi, ind):
        self._do_call(ins['indexReg'])
    def op_CALLSPECIAL(self, ins, i, hi, ind):
        # 特殊调用: callType 1 = eval(语义同普通调用);
        # 参数个数从前置 REG_IND_* 前缀指令读取
        n = 0
        j = i - 1
        while j >= 0 and self.f.instrs[j]['name'].startswith('REG_'):
            if 'indexReg' in self.f.instrs[j]:
                n = self.f.instrs[j]['indexReg']
            j -= 1
        self._do_call(n, new=bool(ins.get('isNew')))
    def op_NEW(self, ins, i, hi, ind):
        self._do_call(ins['indexReg'], new=True)

    # ---- 增量
    def _incdec(self, ins, is_post):
        mask = ins['incDec']
        inc = (mask & 1) == 0  # 1=DEC? Rhino: incrDecrMask |= 1 for DEC
        sym = '++' if inc else '--'
        self.push(E('%s%s' % (sym, ''), P_UNARY))  # placeholder, 下面覆盖

    def op_VAR_INC_DEC(self, ins, i, hi, ind):
        mask = ins['incDec']
        inc = (mask & 1) == 0
        sym = '++' if inc else '--'
        nm = self.f.var_name(ins.get('varIdx', 0))
        if mask & 2:
            self.push(E('%s%s' % (nm, sym), P_ATOM))
        else:
            self.push(E('%s%s' % (sym, nm), P_UNARY))
    op_SETVAR_INC_DEC = op_VAR_INC_DEC

    def op_NAME_INC_DEC(self, ins, i, hi, ind):
        mask = ins['incDec']
        inc = (mask & 1) == 0
        sym = '++' if inc else '--'
        nm = ins['stringReg']
        if mask & 2:
            self.push(E('%s%s' % (nm, sym), P_ATOM))
        else:
            self.push(E('%s%s' % (sym, nm), P_UNARY))

    def op_PROP_INC_DEC(self, ins, i, hi, ind):
        mask = ins['incDec']
        inc = (mask & 1) == 0
        sym = '++' if inc else '--'
        obj = self.popE()
        m = self._member(obj, ins['stringReg'])
        if mask & 2:
            self.push(E('%s%s' % (m.t, sym), P_ATOM))
        else:
            self.push(E('%s%s' % (sym, m.t), P_UNARY))

    def op_ELEM_INC_DEC(self, ins, i, hi, ind):
        mask = ins['incDec']
        inc = (mask & 1) == 0
        sym = '++' if inc else '--'
        idv = self.popE()
        obj = self.popE()
        m = '%s[%s]' % (wrap(obj, P_MEMBER), wrap(idv, P_ATOM))
        if mask & 2:
            self.push(E('%s%s' % (m, sym), P_ATOM))
        else:
            self.push(E('%s%s' % (sym, m), P_UNARY))

    def op_REF_INC_DEC(self, ins, i, hi, ind):
        mask = ins['incDec']
        inc = (mask & 1) == 0
        sym = '++' if inc else '--'
        if mask & 2:
            self.push(E('%s%s' % (sym, ''), P_ATOM))
        else:
            self.push(E('%s%s' % (sym, ''), P_UNARY))

    # ---- 栈操作
    def op_DUP(self, ins, i, hi, ind):
        top = self.stack[-1]
        if isinstance(top, tuple) and top[0] == 'CALLEE':
            self.stack.append(top)
        else:
            self.stack.append(E(top.t, top.p))
        self.dup_for_logic = i + 1  # 下一条若是 IFEQ/IFNE 则记录逻辑运算

    def op_SWAP(self, ins, i, hi, ind):
        a = self.stack.pop()
        b = self.stack.pop()
        self.stack.append(a)
        self.stack.append(b)

    # ---- 字面量
    def op_LITERAL_NEW(self, ins, i, hi, ind):
        self.stack.append(('LIT', 'pending', [], ins.get('litCount')))

    def op_LITERAL_SET(self, ins, i, hi, ind):
        v = self.popE()
        # 值在栈顶, LIT 标记在其下
        lit = None
        for k in range(len(self.stack) - 1, -1, -1):
            if isinstance(self.stack[k], tuple) and self.stack[k][0] == 'LIT':
                lit = self.stack[k]
                break
        if lit is not None:
            lit[2].append(v)

    def op_LITERAL_GETTER(self, ins, i, hi, ind):
        v = self.popE()
        for k in range(len(self.stack) - 1, -1, -1):
            if isinstance(self.stack[k], tuple) and self.stack[k][0] == 'LIT':
                self.stack[k][2].append(('get', v))
                break

    def op_LITERAL_SETTER(self, ins, i, hi, ind):
        v = self.popE()
        for k in range(len(self.stack) - 1, -1, -1):
            if isinstance(self.stack[k], tuple) and self.stack[k][0] == 'LIT':
                self.stack[k][2].append(('set', v))
                break

    def op_ARRAYLIT(self, ins, i, hi, ind):
        lit = self._pop_lit()
        if lit is None:
            self.push(E('[]', P_ATOM))
            return
        vals = lit[2]
        skip = None
        lid = ins.get('literalId')
        if lid is not None and lid < len(self.f.literal_ids):
            entry = self.f.literal_ids[lid]
            if isinstance(entry, list) and entry and isinstance(entry[0], int):
                skip = entry
        parts = []
        vi = 0
        total = len(vals) + (len(skip) if skip else 0)
        for k in range(total):
            if skip and k in skip:
                parts.append('')
            elif vi < len(vals):
                parts.append(wrap(vals[vi], P_ASSIGN))
                vi += 1
        self.push(E('[%s]' % ', '.join(parts), P_ATOM))

    def op_SPARE_ARRAYLIT(self, ins, i, hi, ind):
        self.op_ARRAYLIT(ins, i, hi, ind)

    def _pop_lit(self):
        for k in range(len(self.stack) - 1, -1, -1):
            if isinstance(self.stack[k], tuple) and self.stack[k][0] == 'LIT':
                return self.stack.pop(k)
        return None

    def op_OBJECTLIT(self, ins, i, hi, ind):
        lit = self._pop_lit()
        if lit is None:
            self.push(E('{}', P_ATOM))
            return
        vals = lit[2]
        lid = ins.get('literalId')
        keys = None
        if lid is not None and lid < len(self.f.literal_ids):
            entry = self.f.literal_ids[lid]
            if isinstance(entry, list) and (not entry or isinstance(entry[0], str)):
                keys = entry
        parts = []
        undef_names = []
        all_undef = True
        for k, v in enumerate(vals):
            if isinstance(v, tuple):
                kind, val = v
                key = keys[k] if keys and k < len(keys) else 'p%d' % k
                parts.append('%s %s(%s) { /* %s */ }' % (
                    kind, js_string(key) if not is_ident(key) else key,
                    '/*arg*/', kind))
                all_undef = False
            else:
                key = keys[k] if keys and k < len(keys) else 'p%d' % k
                keytxt = key if is_ident(key) else js_string(key)
                parts.append('%s: %s' % (keytxt, wrap(v, P_ASSIGN)))
                if all_undef and key and is_ident(key) and v.t == 'undefined':
                    undef_names.append(key)
                else:
                    all_undef = False
        e = E('{%s}' % ', '.join(parts), P_ATOM)
        if all_undef and undef_names:
            e.uo = undef_names  # 纯 undefined 属性对象(变量提升模式)
        elif len(vals) == 1 and not isinstance(vals[0], tuple) and keys \
                and len(keys) == 1 and is_ident(keys[0]) \
                and LITERAL_RE.match(vals[0].t):
            # 单标识符属性 + 字面量值: Auto.js 分支的循环变量提升模式
            # with ({i: 0}) { while (i < ...) {...} } -> var i = 0; while (...)
            e.solo = (keys[0], vals[0])
        self.push(e)

    # ---- 语句级: 弹出栈顶作为语句
    def _stmt(self, indent, e, semi=True):
        if isinstance(e, tuple):
            if e[0] == 'CALLEE':
                e = e[1]
            elif e[0] == 'LIT':
                e = E('/* literal */')
        text = e.t
        # 语句以 { 或 function 开头会被误解析为块/函数声明, 需包裹
        if text.startswith('{') or text.startswith('function') or text.startswith('class'):
            text = '(%s)' % text
        self.stmt(indent, text + (';' if semi else ''), getattr(self, 'line_hint', None))

    def op_POP(self, ins, i, hi, ind):
        # a && b / a || b 短路求值的 DISCARD pop(DUP; IFNE/IFEQ T; POP)不对应源码语句
        if i >= 2 and self.f.instrs[i - 1]['name'] in ('IFNE', 'IFEQ') \
                and self.f.instrs[i - 2]['name'] == 'DUP':
            if self.stack:
                self.stack.pop()
            return
        # void 0 编译产物(ZERO; POP; UNDEF): let 无初值变量的初始化,
        # ZERO 压入的 0 被 POP 丢弃, 不对应源码语句
        if i >= 1 and self.f.instrs[i - 1]['name'] == 'ZERO':
            j = i + 1
            while j < hi and self.f.instrs[j]['name'].startswith('REG_'):
                j += 1
            if j < hi and self.f.instrs[j]['name'] == 'UNDEF':
                if self.stack:
                    self.stack.pop()
                return
        if self.stack:
            self._stmt(ind, self.stack.pop())

    def op_POP_RESULT(self, ins, i, hi, ind):
        if self.stack:
            self._stmt(ind, self.stack.pop())

    # ---- 返回/抛出
    def op_RETUNDEF(self, ins, i, hi, ind):
        self.stmt(ind, 'return;', getattr(self, 'line_hint', None))

    def op_RETURN(self, ins, i, hi, ind):
        if self.stack:
            self.stmt(ind, 'return %s;' % wrap(self.popE(), P_ASSIGN), getattr(self, 'line_hint', None))
        else:
            self.stmt(ind, 'return;', getattr(self, 'line_hint', None))

    def op_RETURN_RESULT(self, ins, i, hi, ind):
        if self.stack:
            self.stmt(ind, 'return %s;' % wrap(self.popE(), P_ASSIGN), getattr(self, 'line_hint', None))

    def op_THROW(self, ins, i, hi, ind):
        if self.stack:
            self.stmt(ind, 'throw %s;' % wrap(self.popE(), P_ASSIGN), getattr(self, 'line_hint', None))

    def op_RETHROW(self, ins, i, hi, ind):
        self.stmt(ind, 'throw %s;' % self.f.var_name(ins.get('varIdx', 0)), getattr(self, 'line_hint', None))

    def op_SETNAME(self, ins, i, hi, ind):
        """BINDNAME name; <value>; SETNAME name -> name = value"""
        name = ins['stringReg']
        v = self.popE()
        # 弹出 BINDNAME 压入的绑定(同名)
        if self.stack:
            b = self.stack.pop()
        kw = ''
        if name not in self.seen_names:
            self.seen_names.add(name)
            kw = 'var '
        self.push(E('%s%s = %s' % (kw, name, wrap(v, P_ASSIGN)), P_ASSIGN))

    def op_STRICT_SETNAME(self, ins, i, hi, ind):
        self.op_SETNAME(ins, i, hi, ind)

    def op_ESCXMLATTR(self, ins, i, hi, ind):
        # XML 属性插值: ESCXMLATTR(x) -> E4X 形式 b="{x}"
        if self.stack:
            e = self.popE()
            val = '' if (e.s is not None and e.s == '') else e.t
            self.push(E('{%s}' % val if val else '{}', P_ATOM, xp=[('e', val)]))
        return None

    def op_ESCXMLTEXT(self, ins, i, hi, ind):
        # XML 文本插值: ESCXMLTEXT(x) -> E4X 形式 {x}
        if self.stack:
            e = self.popE()
            val = '' if (e.s is not None and e.s == '') else e.t
            self.push(E('{%s}' % val if val else '{}', P_ATOM, xp=[('e', val)]))
        return None

    # ---- 寄存器前缀指令: 无栈效应, 仅设置 stringReg/indexReg
    def _noop(self, ins, i, hi, ind):
        return None

    op_REG_STR_C0 = _noop
    op_REG_STR_C1 = _noop
    op_REG_STR_C2 = _noop
    op_REG_STR_C3 = _noop
    op_REG_STR1 = _noop
    op_REG_STR2 = _noop
    op_REG_STR4 = _noop
    op_REG_IND_C0 = _noop
    op_REG_IND_C1 = _noop
    op_REG_IND_C2 = _noop
    op_REG_IND_C3 = _noop
    op_REG_IND_C4 = _noop
    op_REG_IND_C5 = _noop
    op_REG_IND1 = _noop
    op_REG_IND2 = _noop
    op_REG_IND4 = _noop
    op_REG_BIGINT_C0 = _noop
    op_REG_BIGINT_C1 = _noop
    op_REG_BIGINT_C2 = _noop
    op_REG_BIGINT_C3 = _noop
    op_REG_BIGINT1 = _noop
    op_REG_BIGINT2 = _noop
    op_REG_BIGINT4 = _noop

    # ---- 控制流
    def _is_logic_jump(self, i):
        """前一条是 DUP -> 逻辑与/或短路"""
        return i > 0 and self.f.instrs[i - 1]['name'] == 'DUP'

    def _is_expr_seg(self, lo, hi):
        """[lo,hi) 是否为纯表达式段(无语句级 POP/POP_RESULT)"""
        if lo >= hi:
            return False
        for s in self.f.instrs[lo:hi]:
            if s['name'] in ('POP', 'POP_RESULT'):
                return False
        return True

    def _sim_expr(self, lo, hi):
        """隔离模拟 [lo,hi), 返回栈顶表达式(不发射语句)"""
        if lo >= hi:
            return None
        saved_stack = list(self.stack)
        saved_out = self.out
        saved_line = self.cur_line
        self.out = []
        self.cur_line = None
        self.stack = list(saved_stack)
        self.run(lo, hi, 0)
        top = self.stack[-1] if self.stack else None
        self.stack = saved_stack
        self.out = saved_out
        self.cur_line = saved_line
        return top if isinstance(top, E) else None

    def _ternary_at(self, i, T, hi):
        """检测三元表达式: <cond>; IF* T; <else>; GOTO G; T: <then>; G:
        返回 (then_e, else_e, G) 或 None"""
        if T - 1 <= i or T >= hi:
            return None
        g = self.f.instrs[T - 1]
        if g['name'] != 'GOTO':
            return None
        G = self.f.tidx(g['target'])
        if G is None or not (T < G <= hi):
            return None
        if not self._is_expr_seg(i + 1, T - 1):
            return None
        if not self._is_expr_seg(T, G):
            return None
        then_e = self._sim_expr(T, G)
        else_e = self._sim_expr(i + 1, T - 1)
        if then_e is None or else_e is None:
            return None
        return then_e, else_e, G

    def op_IFNE(self, ins, i, hi, ind):
        """IFNE: 条件为假跳转"""
        cond = self.popE()
        T = self.f.tidx(ins['target'])
        line = getattr(self, 'line_hint', None)
        if self._is_logic_jump(i) and T is not None and T > i:
            # a && b :  a DUP IFNE T POP b T
            self.logic[T] = ('and', cond)
            return None
        if T is None or T >= hi:
            # if (cond) { 剩余部分 }
            self.stmt(ind, 'if (%s) {' % wrap(cond, P_ASSIGN), line)
            self.run(i + 1, hi, ind + 1)
            self.emit(ind, '}')
            return hi
        if T > i:
            # 三元表达式: <cond>; IFNE T; <else>; GOTO G; T: <then>; G:
            # IFNE 为假跳转: 真→顺序(else), 假→T(then)
            tern = self._ternary_at(i, T, hi)
            if tern is not None:
                then_e, else_e, G = tern
                self.push(E('%s ? %s : %s' % (
                    wrap(cond, P_COND), wrap(then_e, P_ASSIGN),
                    wrap(else_e, P_ASSIGN)), P_COND))
                return G
            # 检查 then 块末尾是否是跳到 else 之后的 GOTO
            g = self.f.instrs[T - 1]
            if g['name'] == 'GOTO':
                G = self.f.tidx(g['target'])
                if G is not None and T < G <= hi:
                    self.stmt(ind, 'if (%s) {' % wrap(cond, P_ASSIGN), line)
                    self.run(i + 1, T - 1, ind + 1)
                    self.emit(ind, '} else {')
                    self.run(T, G, ind + 1)
                    self.emit(ind, '}')
                    return G
            self.stmt(ind, 'if (%s) {' % wrap(cond, P_ASSIGN), line)
            self.run(i + 1, T, ind + 1)
            self.emit(ind, '}')
            return T
        # 反向 IFNE: 循环退出条件等
        self.stmt(ind, 'if (%s) { /* 反向跳转 pc%d */ }' % (wrap(cond, P_ASSIGN), ins['target']), line)
        return None

    def op_IFEQ(self, ins, i, hi, ind):
        """IFEQ: 条件为真跳转"""
        cond = self.popE()
        T = self.f.tidx(ins['target'])
        line = getattr(self, 'line_hint', None)
        if self._is_logic_jump(i) and T is not None and T > i:
            # a || b :  a DUP IFEQ T POP b T
            self.logic[T] = ('or', cond)
            return None
        if T is not None and T > i:
            # 前向跳真: || 短路 或 三元或循环退出判断
            if T == hi:
                # if (!cond) 跳出本范围 -> if (cond) { 剩余 }
                self.stmt(ind, 'if (%s) {' % wrap(cond, P_ASSIGN), line)
                self.run(i + 1, hi, ind + 1)
                self.emit(ind, '}')
                return hi
            # 三元表达式: <cond>; IFEQ T; <else>; GOTO G; T: <then>; G:
            # IFEQ 为真跳转: 真→T(then), 假→顺序(else)
            tern = self._ternary_at(i, T, hi)
            if tern is not None:
                then_e, else_e, G = tern
                self.push(E('%s ? %s : %s' % (
                    wrap(cond, P_COND), wrap(then_e, P_ASSIGN),
                    wrap(else_e, P_ASSIGN)), P_COND))
                return G
            # || 短路: <a> DUP IFEQ T POP <b> T
            self.logic[T] = ('or', cond)
            return None
        if T is not None and T <= i:
            # 反向跳真: 循环回边 —— 应由循环结构消费; 单独出现则注释
            self.stmt(ind, 'if (%s) { /* 循环回边 -> pc%d */ }' % (wrap(cond, P_ASSIGN), ins['target']), line)
            return None
        self.stmt(ind, 'if (%s) { /* IFEQ 异常 */ }' % wrap(cond, P_ASSIGN), line)
        return None

    def op_IFEQ_POP(self, ins, i, hi, ind):
        # switch case 链由 run() 主循环在 DUP 处统一识别; 此处仅兜底
        cond = self.popE()
        T = self.f.tidx(ins['target'])
        line = getattr(self, 'line_hint', None)
        if T is not None and T < hi:
            self.stmt(ind, 'if (%s) { /* switch case -> pc%d */' % (wrap(cond, P_ASSIGN), ins['target']), line)
            self.run(i + 1, T, ind + 1)
            self.emit(ind, '}')
            return T
        return None

    # ---- switch 结构化
    # Rhino 代码形态(见 IRFactory.transformSwitch):
    #   <expr>
    #   DUP; <test1>; SHEQ; IFEQ_POP L1
    #   DUP; <test2>; SHEQ; IFEQ_POP L2 ...
    #   POP; GOTO Ldefault(or end)
    #   L1: <body1>; GOTO end ...
    def _switch_chain_at(self, i, hi):
        """从 DUP 指令 i 匹配 switch case 链; 返回 (cases, switch_expr_idx, G) 或 None
        cases: [(test_start, test_end, target_idx)]"""
        f = self.f
        if i >= hi or f.instrs[i]['name'] != 'DUP':
            return None
        cases = []
        j = i
        while True:
            if j >= hi or f.instrs[j]['name'] != 'DUP':
                return None
            # 从 j+1 找第一个跳转指令
            k = j + 1
            while k < hi:
                nm = f.instrs[k]['name']
                if nm in ('IFNE', 'IFEQ', 'IFEQ_POP', 'GOTO'):
                    break
                k += 1
            if k >= hi or f.instrs[k]['name'] != 'IFEQ_POP':
                return None  # 逻辑与/或短路, 非 switch
            if f.instrs[k - 1]['name'] != 'SHEQ':
                return None
            T = f.tidx(f.instrs[k]['target'])
            if T is None or T <= k:
                return None
            cases.append((j + 1, k - 1, T))
            j = k + 1
            if j < hi and f.instrs[j]['name'] == 'POP':
                break
            if j >= hi:
                return None
        # j = POP; 其后应为 GOTO(汇合点/默认子句)
        if j + 1 >= hi or f.instrs[j + 1]['name'] != 'GOTO':
            return None
        G = f.tidx(f.instrs[j + 1]['target'])
        if G is None:
            return None
        return cases, i, G

    def _emit_switch(self, sw, i, hi, ind):
        cases, dup_i, G = sw
        f = self.f
        line = getattr(self, 'line_hint', None)
        switch_expr = self.popE()
        # 汇合点(break 目标): 优先取 case 体末尾 GOTO 的目标
        labels = sorted(set(T for _, _, T in cases))
        break_idx = None
        for (_, _, T) in cases:
            nxt = None
            for L in labels:
                if L > T:
                    nxt = L
                    break
            end = nxt if nxt is not None else None
            if end is None:
                continue
            if end - 1 >= T and f.instrs[end - 1]['name'] == 'GOTO':
                t = f.tidx(f.instrs[end - 1]['target'])
                if t is not None and t > end:
                    break_idx = t
                    break
        if break_idx is None:
            break_idx = hi
        # 默认子句标签: G 落在 case 体区域内且不等于汇合点
        default_label = None
        if G != break_idx and labels and labels[0] <= G < break_idx:
            default_label = G
        # 重建各 case 测试表达式(不含 SHEQ, 栈顶即 case 字面量)
        case_tests = []
        for (ts, te, T) in cases:
            saved_stack = list(self.stack)
            saved_out, saved_line = self.out, self.cur_line
            self.out = []
            self.cur_line = None
            self.stack = [E(switch_expr.t, switch_expr.p)]
            self.run(ts, te, 0)
            test = self.popE() if self.stack else E('?')
            self.stack = saved_stack
            self.out, self.cur_line = saved_out, saved_line
            case_tests.append(test.t)
        # 发射
        self.stmt(ind, 'switch (%s) {' % wrap(switch_expr, P_ASSIGN), line)
        self.switch_end.append(break_idx)
        # 标签条目(含默认子句; 多个 case 可共享同一目标 -> case A: case B:)
        label_entries = [(T, 'case', case_tests[n]) for n, (_, _, T) in enumerate(cases)]
        if default_label is not None:
            label_entries.append((default_label, 'default', None))
        label_entries.sort(key=lambda x: x[0])
        all_labels = sorted(set(L for L, _, _ in label_entries) | {break_idx})
        for pos, (L, kind, test) in enumerate(label_entries):
            if kind == 'default':
                self.emit(ind + 1, 'default:')
            else:
                self.emit(ind + 1, 'case %s:' % test)
            # 主体范围: 到下一个更大标签(同标签的后续 case 行由下一轮条目发射)
            nxt = None
            for LL in all_labels:
                if LL > L:
                    nxt = LL
                    break
            if nxt is None:
                nxt = break_idx
            if pos + 1 < len(label_entries) and label_entries[pos + 1][0] == L:
                continue  # 同目标: 只发射 case 标签行, 主体在最后一个同名 case 后
            self.run(L, nxt, ind + 2)
        self.switch_end.pop()
        self.emit(ind, '}')
        return break_idx

    def op_GOTO(self, ins, i, hi, ind):
        T = self.f.tidx(ins['target'])
        line = getattr(self, 'line_hint', None)
        if T is None:
            return None
        if T > i:
            if T == hi:
                return None  # 跳到范围末尾: 空操作
            # while/for 循环头: GOTO cond; body; cond(自 T 起); IFEQ body_start(=i+1)
            # 从 T 向后找到回边 IFEQ (其间不应有其它跳转)
            j = T
            while j < hi and self.f.instrs[j]['name'] != 'IFEQ':
                if 'target' in self.f.instrs[j]:
                    j = hi
                    break
                j += 1
            if j < hi and self.f.instrs[j]['name'] == 'IFEQ':
                back = self.f.tidx(self.f.instrs[j]['target'])
                if back == i + 1:
                    # for-in? GOTO 前附近有 ENUM_INIT_KEYS, cond 段含 ENUM_NEXT
                    enum_init = None
                    for k in range(i - 1, max(-1, i - 6), -1):
                        nm = self.f.instrs[k]['name']
                        if nm == 'ENUM_INIT_KEYS':
                            enum_init = k
                            break
                        if nm != 'LINE' and not nm.startswith('REG_'):
                            break
                    if enum_init is not None:
                        seg = [s['name'] for s in self.f.instrs[T:j]]
                        if 'ENUM_NEXT' in seg:
                            r = self._emit_forin(enum_init, i, T, j, ind)
                            if r is not None:
                                return r
                    return self._emit_loop(i, T, j, ind)
            # switch 结束 -> break
            if self.switch_end and T in self.switch_end:
                self.stmt(ind, 'break;', line)
                return None
            # 循环内前向跳转: break / continue
            if self.loop_stack:
                ls, ci, ei = self.loop_stack[-1]
                if T == ei:
                    self.stmt(ind, 'break;', line)
                    return None
                if T < ci:
                    self.stmt(ind, 'continue;', line)
                    return None
            return None  # 其它前向跳转: 暂按空操作
        else:
            # 反向 GOTO: 循环回边或 continue
            if self.loop_stack:
                ls, ci, ei = self.loop_stack[-1]
                if T == ls:
                    return None  # 循环末尾
                if T < ci:
                    self.stmt(ind, 'continue;', line)
                    return None
            return None

    def _emit_forin(self, enum_init_idx, goto_i, cond_start, ifeq_idx, ind):
        """for-in: <obj>; ENUM_INIT_KEYS; GOTO cond;
        body: ENUM_ID; SETVAR x; POP; <rest>; cond: ENUM_NEXT; IFEQ bodyStart"""
        f = self.f
        # body 开头: [LINE/REG]; ENUM_ID; [REG]; SETVAR/SETVAR1/SETNAME x; POP
        k = goto_i + 1
        while k < ifeq_idx and (f.instrs[k]['name'] == 'LINE'
                                or f.instrs[k]['name'].startswith('REG_')):
            k += 1
        if k >= ifeq_idx or f.instrs[k]['name'] != 'ENUM_ID':
            return None
        k += 1
        while k < ifeq_idx and f.instrs[k]['name'].startswith('REG_'):
            k += 1
        if k >= ifeq_idx or f.instrs[k]['name'] not in ('SETVAR', 'SETVAR1', 'SETNAME'):
            return None
        s = f.instrs[k]
        var = f.var_name(s['varIdx']) if 'varIdx' in s else s.get('stringReg', 'v')
        k += 1
        while k < ifeq_idx and f.instrs[k]['name'].startswith('REG_'):
            k += 1
        if k < ifeq_idx and f.instrs[k]['name'] in ('POP', 'POP_RESULT'):
            k += 1
        body_start = k
        if body_start >= cond_start:
            return None
        obj = getattr(self, 'enum_obj', None)
        if not isinstance(obj, E):
            obj = E('/*enumObj*/')
        line = getattr(self, 'line_hint', None)
        kw = '' if var in self.seen_names else 'var '
        if var:
            self.seen_names.add(var)
        # 隔离模拟 body(此时 enum_obj 已由 ENUM_INIT_KEYS 保存)
        saved_stack = list(self.stack)
        saved_out = self.out
        saved_line = self.cur_line
        saved_hint = getattr(self, 'line_hint', None)
        self.out = []
        self.cur_line = None
        self.stack = list(saved_stack)
        self.run(body_start, cond_start, 0)
        body_lines = self.out
        self.out = saved_out
        self.cur_line = saved_line
        self.stack = saved_stack
        self.line_hint = saved_hint
        self.stmt(ind, 'for (%s%s in %s) {' % (kw, var, wrap(obj, P_ASSIGN)), line)
        pad = '    ' * (ind + 1)
        for ln in body_lines:
            self.out.append((pad + ln) if ln.strip() else ln)
        self.emit(ind, '}')
        return ifeq_idx + 1

    def _pop_init_line(self, init_t):
        """若最后输出的语句正是 init 表达式(去 var 前缀/分号/行号注释后相同),
        弹出该行避免与 for 头重复; 返回保留 var 前缀的 init 文本, 不匹配返回 None"""
        if not self.out:
            return None
        t = self.out[-1].strip()
        cidx = t.find('  // L')
        if cidx > 0:
            t = t[:cidx].rstrip()
        if t.endswith(';'):
            t = t[:-1]
        has_var = t.startswith('var ')
        if has_var:
            t = t[4:]
        if t == init_t:
            self.out.pop()
            return ('var ' if has_var else '') + t
        return None

    def _emit_loop(self, goto_i, cond_start, ifeq_idx, ind):
        """GOTO cond_start; body; cond; IFEQ->goto_i+1 : while/for 循环
        body = [goto_i+1, cond_start), 条件 = [cond_start, ifeq_idx), 退出点 = ifeq_idx+1"""
        line = getattr(self, 'line_hint', None)
        body_start = goto_i + 1
        cond_idx = ifeq_idx
        end_idx = ifeq_idx + 1
        incr_start = self._find_incr(body_start, cond_start)
        init = self._find_init(goto_i) if incr_start is not None else None
        # let (x = v) 提升模式: ENTERWITH 处已发射 "var x = v;" 语句,
        # 若正是最后一行且循环将转为 for, 则由 for 头承载(弹出重复行)
        pending = None
        pi = getattr(self, 'pending_init', None)
        if init is None:
            if pi is not None and self.out and self.out[-1] == pi[0]:
                pending = pi[1]   # 以提升语句作为 for init, 保留 incr 检测
            else:
                incr_start = None
        # 保存现场
        saved_stack = list(self.stack)
        saved_out = self.out
        saved_line = self.cur_line
        saved_hint = getattr(self, 'line_hint', None)

        def simulate(lo, hi_):
            """在隔离缓冲区中模拟 [lo,hi_), 返回 (输出行, 栈顶表达式)"""
            self.out = []
            self.cur_line = None
            self.stack = list(saved_stack)
            self.loop_stack.append((body_start, cond_idx, end_idx))
            self.run(lo, hi_, 0)
            self.loop_stack.pop()
            lines_ = self.out
            top = self.stack.pop() if self.stack else None
            self.out = saved_out
            self.cur_line = saved_line
            return lines_, top

        if incr_start is not None:
            body_lines, _ = simulate(body_start, incr_start)
            incr_lines, _ = simulate(incr_start, cond_start)
            incr_text = self._last_stmt_text(incr_lines)
            _, cond = simulate(cond_start, ifeq_idx)
        else:
            body_lines, _ = simulate(body_start, cond_start)
            _, cond = simulate(cond_start, ifeq_idx)
            incr_text = ''
        self.stack = saved_stack
        self.line_hint = saved_hint
        self.pending_init = None
        if not isinstance(cond, E):
            cond = None
        if cond is None:
            cond = E('true')
        if incr_start is not None and incr_text:
            # init 语句已被主循环作为普通语句发射, 若正是最后一行则弹出,
            # 由 for 头统一承载(保留 var 前缀)
            if init is not None:
                popped = self._pop_init_line(init.t)
                init_text = popped if popped is not None else init.t
            elif pending is not None:
                if self.out and self.out[-1] == pi[0]:
                    self.out.pop()
                init_text = pending
            else:
                init_text = ''
            self.stmt(ind, 'for (%s; %s; %s) {' % (
                init_text, wrap(cond, P_ASSIGN), incr_text), line)
        else:
            self.stmt(ind, 'while (%s) {' % wrap(cond, P_ASSIGN), line)
        pad = '    ' * (ind + 1)
        for ln in body_lines:
            self.out.append((pad + ln) if ln.strip() else ln)
        self.emit(ind, '}')
        return end_idx

    def _emit_dowhile(self, body_start, ifeq_idx, hi, ind):
        """do-while: bodyStart: <body>; cond; IFEQ bodyStart (真→回边)"""
        f = self.f
        self.dowhile_done.add(body_start)
        # cond 段起点: 从 ifeq 向前跳过 LINE/REG_ 前缀, 再向前找语句边界
        # (POP/POP_RESULT/LINE), 边界之后即为 cond 段
        j = ifeq_idx - 1
        while j >= body_start and (f.instrs[j]['name'] == 'LINE'
                                   or f.instrs[j]['name'].startswith('REG_')):
            j -= 1
        cond_start = None
        if j >= body_start:
            k = j
            while k > body_start and f.instrs[k - 1]['name'] not in (
                    'POP', 'POP_RESULT', 'LINE'):
                k -= 1
            cond_start = k
        if cond_start is None or cond_start >= ifeq_idx or cond_start <= body_start:
            return None
        line = getattr(self, 'line_hint', None)
        saved_stack = list(self.stack)
        saved_out = self.out
        saved_line = self.cur_line
        saved_hint = getattr(self, 'line_hint', None)
        self.out = []
        self.cur_line = None
        self.stack = list(saved_stack)
        self.run(body_start, cond_start, 0)
        body_lines = self.out
        self.out = []
        self.cur_line = None
        self.stack = list(saved_stack)
        self.run(cond_start, ifeq_idx, 0)
        cond = self.stack.pop() if self.stack else None
        self.out = saved_out
        self.cur_line = saved_line
        self.stack = saved_stack
        self.line_hint = saved_hint
        if not isinstance(cond, E):
            cond = E('true')
        self.stmt(ind, 'do {', line)
        pad = '    ' * (ind + 1)
        for ln in body_lines:
            self.out.append((pad + ln) if ln.strip() else ln)
        self.stmt(ind, '} while (%s);' % wrap(cond, P_ASSIGN), None)
        return ifeq_idx + 1

    @staticmethod
    def _last_stmt_text(lines):
        """从输出行中取最后一条语句文本(去掉分号与行号注释)"""
        for ln in reversed(lines):
            t = ln.strip()
            if t and not t.startswith('//'):
                idx = t.find('  // L')
                if idx > 0:
                    t = t[:idx]
                if t.endswith(';'):
                    t = t[:-1]
                return t
        return ''

    def _find_incr(self, body_start, cond_start):
        """在 [body_start, cond_start) 末寻找 for 循环的 incr 段:
        cond_start 之前最后一条以 POP/POP_RESULT 结尾、无跳转/调用的语句"""
        f = self.f
        j = cond_start - 1
        while j >= body_start and (f.instrs[j]['name'] == 'LINE'
                                   or f.instrs[j]['name'].startswith('REG_')):
            j -= 1
        if j < body_start or f.instrs[j]['name'] not in ('POP', 'POP_RESULT'):
            return None
        incr_end = j + 1
        # 向前找上一个语句边界(POP/POP_RESULT)
        p = j
        while p > body_start and f.instrs[p - 1]['name'] not in (
                'POP', 'POP_RESULT', 'LEAVEWITH', 'ENTERWITH'):
            p -= 1
        incr_start = p
        seg = f.instrs[incr_start:incr_end]
        if not seg:
            return None
        # incr 必须是简单自增/赋值表达式(无跳转/调用)
        for s in seg:
            if 'target' in s or s['name'] in ('CALL', 'TAIL_CALL', 'NEW', 'REF_CALL'):
                return None
        # 行号: incr 行号不应早于循环体首行(for 头同行或 incr 在体后)
        line_incr = self._line_before(incr_start)
        line_body = self._line_before(body_start)
        if line_incr is not None and line_body is not None and line_incr < line_body:
            return None
        return incr_start

    def _line_before(self, idx):
        j = idx - 1
        while j >= 0:
            ins = self.f.instrs[j]
            if ins['name'] == 'LINE':
                return ins['line']
            j -= 1
        return None

    def _find_init(self, goto_i):
        """GOTO 前的 init 语句: 向前找以 POP/POP_RESULT 结尾的片段"""
        j = goto_i - 1
        if j < 0:
            return None
        # GOTO 前必须是语句结束(POP/POP_RESULT)或 LINE
        while j >= 0 and self.f.instrs[j]['name'] == 'LINE':
            j -= 1
        if j < 0 or self.f.instrs[j]['name'] not in ('POP', 'POP_RESULT'):
            return None
        # 找该语句起点
        k = j
        while k > 0 and self.f.instrs[k - 1]['name'] not in ('POP', 'POP_RESULT'):
            k -= 1
        seg = self.f.instrs[k:j + 1]
        for s in seg:
            if 'target' in s or s['name'] in ('CALL', 'TAIL_CALL', 'NEW', 'REF_CALL', 'CLOSURE_EXPR'):
                return None
        line_init = seg[0]['line'] if (seg and seg[0]['name'] == 'LINE') \
            else self._line_before(k)
        line_cond = self._line_before(goto_i)
        if line_init is not None and line_cond is not None and line_init != line_cond:
            return None
        # 模拟该片段得到 init 表达式
        saved_stack = list(self.stack)
        saved_with = list(self.with_stack)
        saved_out = self.out
        self.stack = []
        self.out = []
        for s in seg[:-1]:
            h = getattr(self, 'op_' + s['name'], None)
            if h:
                h(s, 0, 0, 0)
        init = self.popE() if self.stack else None
        self.stack = saved_stack
        self.with_stack = saved_with
        self.out = saved_out
        return init

    # ---- with / try
    def op_ENTERWITH(self, ins, i, hi, ind):
        obj = self.popE()
        line = getattr(self, 'line_hint', None)
        # 纯 undefined 属性对象: 变量提升模式, 转为 var 声明列表
        if getattr(obj, 'uo', None):
            names = [n for n in obj.uo if n not in self.seen_names]
            if names:
                for n in names:
                    self.seen_names.add(n)
                self.stmt(ind, 'var %s;' % ', '.join(names), line)
            self.with_stack.append(True)   # 假 with: LEAVEWITH 时不发射 }
            return None
        # 单标识符属性 + 字面量值: Auto.js 分支的循环变量提升模式
        # with ({i: 0}) { while (i < n) {...} } -> var i = 0; while (i < n) {...}
        # (已验证: 三处实例的 with 块之后均不读取该变量, 语义等价)
        solo = getattr(obj, 'solo', None)
        if solo is not None:
            key, val = solo
            kw = 'var ' if key not in self.seen_names else ''
            if key not in self.seen_names:
                self.seen_names.add(key)
            text = '%s%s = %s' % (kw, key, wrap(val, P_ASSIGN))
            self.stmt(ind, text + ';', line)
            # 记录待接入 for 头的 init(若紧随的是 for 循环)
            self.pending_init = (self.out[-1], text)
            self.with_stack.append(True)   # 假 with: LEAVEWITH 时不发射 }
            return None
        self.stmt(ind, 'with (%s) {' % wrap(obj, P_ASSIGN), line)
        self.with_stack.append(False)      # 真实 with: LEAVEWITH 时发射 }
        return None

    def op_LEAVEWITH(self, ins, i, hi, ind):
        if self.with_stack:
            fake = self.with_stack.pop()
            if fake:
                return None
            self.emit(ind, '}')
            return None
        # 栈空(不匹配的 LEAVEWITH, 如被跳过的 newCatchScope 包装): 兜底发射
        self.emit(ind, '}')
        return None

    def op_SCOPE_SAVE(self, ins, i, hi, ind):
        return None

    def op_SCOPE_LOAD(self, ins, i, hi, ind):
        # with 对象(保存的域)
        slot = ins.get('varIdx', 0)
        if slot in self.with_objs:
            self.push(E(self.with_objs[slot]))
        else:
            self.push(E('/*scope%d*/' % slot))

    def op_CATCH_SCOPE(self, ins, i, hi, ind):
        # 正常路径由 _emit_try 消费; 单独出现时兜底
        self.emit(ind, '} catch (%s) {' % ins['stringReg'])
        return None

    # ---- try/catch 结构化(依据异常表)
    # Rhino 代码形态:
    #   [SCOPE_SAVE scope]
    #   tryStart: <try 体>; GOTO join
    #   handler:  LOCAL_LOAD exc; CATCH_SCOPE e; LOCAL_LOAD scope; ENTERWITH
    #             <catch 体>; LEAVEWITH; GOTO join
    #             LEAVEWITH; LOCAL_CLEAR...
    #   join:     ...
    # 其中 with(newCatchScope(e)) 包裹是编译器内部行为, 不对应源码。
    def _prev_real(self, j):
        """向前跳过 REG_* 前缀, 返回实际指令下标"""
        f = self.f
        while j > 0 and f.instrs[j - 1]['name'].startswith('REG_'):
            j -= 1
        return j - 1

    @staticmethod
    def _skip_pref(f, k, hi):
        """向后跳过 REG_* 前缀与 LINE 标记, 返回实际指令下标"""
        while k < hi and (f.instrs[k]['name'].startswith('REG_')
                          or f.instrs[k]['name'] == 'LINE'):
            k += 1
        return k

    def _catch_body_end(self, join_idx):
        """从 join 向前剔除编译器清理指令, 返回 catch 主体结束下标"""
        f = self.f
        j = join_idx
        j = self._prev_real(j)
        while j >= 0 and f.instrs[j]['name'] == 'LOCAL_CLEAR':
            j = self._prev_real(j)
        if j >= 0 and f.instrs[j]['name'] == 'LEAVEWITH':
            j = self._prev_real(j)
        if j >= 0 and f.instrs[j]['name'] == 'GOTO':
            t = f.tidx(f.instrs[j]['target'])
            if t == join_idx:
                j = self._prev_real(j)
        if j >= 0 and f.instrs[j]['name'] == 'LEAVEWITH':
            j = self._prev_real(j)
        return j + 1

    def _emit_try(self, ent, i, hi, ind):
        f = self.f
        self.try_done.add(i)
        try_end = f.tidx(ent['tryEnd'])
        handler = f.tidx(ent['handler'])
        if try_end is None or handler is None or try_end > hi or handler > hi:
            return None
        line = getattr(self, 'line_hint', None)
        self.stmt(ind, 'try {', line)
        # try 体: 末尾 GOTO(跳过 catch)目标即汇合点
        join_idx = None
        if try_end - 1 > i and f.instrs[try_end - 1]['name'] == 'GOTO':
            join_idx = f.tidx(f.instrs[try_end - 1]['target'])
        self.run(i, try_end, ind + 1)
        # catch 头
        name = 'e'
        k = handler
        k = self._skip_pref(f, k, hi)
        if k < hi and f.instrs[k]['name'] == 'LOCAL_LOAD':
            k += 1
            k = self._skip_pref(f, k, hi)
        if k < hi and f.instrs[k]['name'] == 'CATCH_SCOPE':
            name = f.instrs[k]['stringReg']
            k += 1
        # 跳过 with(newCatchScope) 包装: LOCAL_LOAD; ENTERWITH
        k = self._skip_pref(f, k, hi)
        if k < hi and f.instrs[k]['name'] == 'LOCAL_LOAD':
            k += 1
            k = self._skip_pref(f, k, hi)
            if k < hi and f.instrs[k]['name'] == 'ENTERWITH':
                k += 1
        self.emit(ind, '} catch (%s) {' % name)
        if join_idx is None:
            join_idx = hi
        body_end = self._catch_body_end(join_idx)
        body_end = max(body_end, k)
        self.run(k, body_end, ind + 1)
        self.emit(ind, '}')
        return join_idx

    def op_LOCAL_CLEAR(self, ins, i, hi, ind):
        return None

    def op_LOCAL_LOAD(self, ins, i, hi, ind):
        self.push(E('/*local%d*/' % ins.get('varIdx', 0)))

    def op_GOSUB(self, ins, i, hi, ind):
        return None  # finally 调用

    def op_STARTSUB(self, ins, i, hi, ind):
        return None

    def op_RETSUB(self, ins, i, hi, ind):
        return None

    def op_ENUM_INIT_KEYS(self, ins, i, hi, ind):
        obj = self.popE()
        self.enum_obj = obj
        return None

    op_ENUM_INIT_VALUES = op_ENUM_INIT_KEYS
    op_ENUM_INIT_ARRAY = op_ENUM_INIT_KEYS
    op_ENUM_INIT_VALUES_IN_ORDER = op_ENUM_INIT_KEYS

    def op_ENUM_NEXT(self, ins, i, hi, ind):
        self.push(E('/*enumNext*/', P_ATOM))
        return None

    def op_ENUM_ID(self, ins, i, hi, ind):
        self.push(E('/*enumId*/', P_ATOM))
        return None

    def op_CLOSURE_EXPR(self, ins, i, hi, ind):
        idx = ins['nestedIdx']
        if 0 <= idx < len(self.f.nested):
            nf = self.f.nested[idx]
            params = ', '.join(nf.arg_names[:nf.arg_count])
            # 语句位置的命名函数声明: CLOSURE_EXPR 后紧跟 POP/POP_RESULT,
            # 直接发射 function 声明(提升语义), 避免被 _stmt 误加括号
            j = i + 1
            while j < hi and self.f.instrs[j]['name'].startswith('REG_'):
                j += 1
            if nf.name and j < hi and self.f.instrs[j]['name'] in ('POP', 'POP_RESULT'):
                body = decompile_function(nf, 0)
                pad = '    ' * (ind + 1)
                bodytxt = '\n'.join((pad + ln) if ln.strip() else ln for ln in body)
                self.stmt(ind, 'function %s(%s) {' % (nf.name, params),
                          getattr(self, 'line_hint', None))
                self.out.extend(bodytxt.split('\n'))
                self.stmt(ind, '}', None)
                self.emit(ind, '')
                return j + 1
            nm = (' ' + nf.name) if nf.name else ''
            body = decompile_function(nf, 0)
            pad = '    ' * (ind + 1)
            bodytxt = '\n'.join((pad + ln) if ln.strip() else ln for ln in body)
            self.push(E('function%s(%s) {\n%s\n%s}' % (
                nm, params, bodytxt, '    ' * ind), P_ATOM))
        else:
            self.push(E('/*fn%d*/' % idx, P_ATOM))
        return None

    def op_CLOSURE_STMT(self, ins, i, hi, ind):
        idx = ins['nestedIdx']
        self.stmt(ind, '/*fn%d*/;' % idx, getattr(self, 'line_hint', None))
        return None

    def op_SETCONSTVAR(self, ins, i, hi, ind):
        v = self.popE()
        self.push(E('%s = %s' % (self.f.var_name(ins['varIdx']), wrap(v, P_ASSIGN)), P_ASSIGN))

    def op_DEBUGGER(self, ins, i, hi, ind):
        self.stmt(ind, 'debugger;', getattr(self, 'line_hint', None))
        return None

    def op_YIELD(self, ins, i, hi, ind):
        if self.stack:
            self.stmt(ind, 'yield %s;' % wrap(self.popE(), P_ASSIGN), getattr(self, 'line_hint', None))
        else:
            self.stmt(ind, 'yield;', getattr(self, 'line_hint', None))
        return None

    def op_LEAVEDQ(self, ins, i, hi, ind):
        return None

    def op_ENTERDQ(self, ins, i, hi, ind):
        obj = self.popE()
        self.push(E('with (%s)' % wrap(obj, P_ASSIGN), P_ATOM))
        return None


# ---------------------------------------------------------------- 顶层驱动
def decompile_function(func, indent=0, as_statement=False):
    """反编译单个函数, 返回源码行列表"""
    d = Decompiler(func)
    d.line_hint = None
    # 先发射嵌套命名函数声明(提升)
    lines = []
    nested_decl = []
    for k, nf in enumerate(func.nested):
        if nf.name and k not in func.closure_refs:
            nested_decl.append(nf)
    for nf in nested_decl:
        sub = decompile_function(nf, 1)
        params = ', '.join(nf.arg_names[:nf.arg_count])
        lines.append('    ' * indent + 'function %s(%s) {' % (nf.name, params))
        lines.extend(sub)
        lines.append('    ' * indent + '}')
        lines.append('')
    body = decompile_body(func)
    lines.extend(body)
    return lines


def decompile_body(func):
    d = Decompiler(func)
    d.line_hint = None
    d.run(0, func.n, 0)
    return d.out


if __name__ == '__main__':
    import sys
    import os
    # 用法: python3 decompiler.py [snapshot.json] > main.js
    # 默认按目录层级向上查找 snapshot.json
    snap_path = sys.argv[1] if len(sys.argv) > 1 else None
    if snap_path is None:
        d = os.path.dirname(os.path.abspath(__file__))
        for _ in range(4):
            cand = os.path.join(d, 'snapshot.json')
            if os.path.exists(cand):
                snap_path = cand
                break
            d = os.path.dirname(d)
    if snap_path is None or not os.path.exists(snap_path):
        sys.stderr.write('未找到 snapshot.json, 请先运行 decrypt2.py + parse_ser3.py\n')
        sys.exit(1)
    snap = json.load(open(snap_path))
    root = Func(snap)
    out = decompile_function(root)
    print('\n'.join(out))
