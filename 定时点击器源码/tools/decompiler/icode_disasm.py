# -*- coding: utf-8 -*-
"""Rhino ICode 反汇编器 —— 基于 Rhino 1.7.14 Interpreter.bytecodeSpan/dumpICode"""

# Icode 特殊操作码
ICODE = {
    -21: "CALLSPECIAL", -19: "CLOSURE_EXPR", -20: "CLOSURE_STMT", -64: "DEBUGGER",
    0: "DELNAME", -1: "DUP", -2: "DUP2", -17: "ELEM_AND_THIS", -10: "ELEM_INC_DEC",
    -53: "ENTERDQ", -62: "GENERATOR", -63: "GENERATOR_END", -65: "GENERATOR_RETURN",
    -48: "GETVAR1", -23: "GOSUB", -6: "IFEQ_POP", -28: "INTNUMBER", -54: "LEAVEDQ",
    -26: "LINE", -57: "LITERAL_GETTER", -29: "LITERAL_NEW", -30: "LITERAL_SET",
    -58: "LITERAL_SETTER", -56: "LOCAL_CLEAR", -15: "NAME_AND_THIS", -8: "NAME_INC_DEC",
    -52: "ONE", -4: "POP", -5: "POP_RESULT", -16: "PROP_AND_THIS", -9: "PROP_INC_DEC",
    -11: "REF_INC_DEC", -71: "REG_BIGINT1", -72: "REG_BIGINT2", -73: "REG_BIGINT4",
    -67: "REG_BIGINT_C0", -68: "REG_BIGINT_C1", -69: "REG_BIGINT_C2", -70: "REG_BIGINT_C3",
    -38: "REG_IND1", -39: "REG_IND2", -40: "REG_IND4",
    -32: "REG_IND_C0", -33: "REG_IND_C1", -34: "REG_IND_C2", -35: "REG_IND_C3",
    -36: "REG_IND_C4", -37: "REG_IND_C5",
    -45: "REG_STR1", -46: "REG_STR2", -47: "REG_STR4",
    -41: "REG_STR_C0", -42: "REG_STR_C1", -43: "REG_STR_C2", -44: "REG_STR_C3",
    -25: "RETSUB", -22: "RETUNDEF", -12: "SCOPE_LOAD", -13: "SCOPE_SAVE",
    -59: "SETCONST", -60: "SETCONSTVAR", -61: "SETCONSTVAR1", -49: "SETVAR1",
    -27: "SHORTNUMBER", -31: "SPARE_ARRAYLIT", -24: "STARTSUB", -3: "SWAP",
    -55: "TAIL_CALL", -74: "TEMPLATE_LITERAL_CALLSITE", -14: "TYPEOFNAME",
    -50: "UNDEF", -18: "VALUE_AND_THIS", -7: "VAR_INC_DEC", -66: "YIELD_STAR",
    -51: "ZERO",
}

# Token 操作码 (2..83)
TOKEN = {
    2: "ENTERWITH", 3: "LEAVEWITH", 4: "RETURN", 5: "GOTO", 6: "IFEQ", 7: "IFNE",
    8: "SETNAME", 9: "BITOR", 10: "BITXOR", 11: "BITAND", 12: "EQ", 13: "NE",
    14: "LT", 15: "LE", 16: "GT", 17: "GE", 18: "LSH", 19: "RSH", 20: "URSH",
    21: "ADD", 22: "SUB", 23: "MUL", 24: "DIV", 25: "MOD", 26: "NOT", 27: "BITNOT",
    28: "POS", 29: "NEG", 30: "NEW", 31: "DELPROP", 32: "TYPEOF", 33: "GETPROP",
    34: "GETPROPNOWARN", 35: "SETPROP", 36: "GETELEM", 37: "SETELEM", 38: "CALL",
    39: "NAME", 40: "NUMBER", 41: "STRING", 42: "NULL", 43: "THIS", 44: "FALSE",
    45: "TRUE", 46: "SHEQ", 47: "SHNE", 48: "REGEXP", 49: "BINDNAME", 50: "THROW",
    51: "RETHROW", 52: "IN", 53: "INSTANCEOF", 54: "LOCAL_LOAD", 55: "GETVAR",
    56: "SETVAR", 57: "CATCH_SCOPE", 58: "ENUM_INIT_KEYS", 59: "ENUM_INIT_VALUES",
    60: "ENUM_INIT_ARRAY", 61: "ENUM_INIT_VALUES_IN_ORDER", 62: "ENUM_NEXT",
    63: "ENUM_ID", 64: "THISFN", 65: "RETURN_RESULT", 66: "ARRAYLIT", 67: "OBJECTLIT",
    68: "GET_REF", 69: "SET_REF", 70: "DEL_REF", 71: "REF_CALL", 72: "REF_SPECIAL",
    73: "YIELD", 74: "STRICT_SETNAME", 75: "EXP", 76: "DEFAULTNAMESPACE",
    77: "ESCXMLATTR", 78: "ESCXMLTEXT", 79: "REF_MEMBER", 80: "REF_NS_MEMBER",
    81: "REF_NAME", 82: "REF_NS_NAME", 83: "BIGINT",
}

def opname(op):
    return TOKEN.get(op) or ICODE.get(op) or ("T%d" % op)

def get_short(b, pc):
    # Java: (byte)iCode[pc] << 8 | (iCode[pc+1] & 0xFF) —— byte 有符号提升, 结果为有符号 16 位
    v = (s8(b[pc]) << 8) | (b[pc+1] & 0xFF)
    return v

def get_index(b, pc):
    return ((b[pc] & 0xFF) << 8) | (b[pc+1] & 0xFF)

def get_int(b, pc):
    return (b[pc] << 24) | ((b[pc+1] & 0xFF) << 16) | ((b[pc+2] & 0xFF) << 8) | (b[pc+3] & 0xFF)

def s8(v):
    return v - 256 if v >= 128 else v

# 指令跨度: opcode -> 总字节数
def bytecode_span(op):
    if op in (50, 73, -66, -62, -63, -65):      # THROW/YIELD/YIELD_STAR/GENERATOR*
        return 3
    if op in (5, 6, 7, -6, -54, -23):            # GOTO/IFEQ/IFNE/IFEQ_POP/LEAVEDQ/GOSUB
        return 3
    if op == -21:                                # CALLSPECIAL
        return 5
    if op == 57:                                 # CATCH_SCOPE
        return 2
    if op in (-7, -8, -9, -10, -11):             # *_INC_DEC
        return 2
    if op == -27:                                # SHORTNUMBER
        return 3
    if op == -28:                                # INTNUMBER
        return 5
    if op == -38:                                # REG_IND1
        return 2
    if op == -39:                                # REG_IND2
        return 3
    if op == -40:                                # REG_IND4
        return 5
    if op == -45:                                # REG_STR1
        return 2
    if op == -46:                                # REG_STR2
        return 3
    if op == -47:                                # REG_STR4
        return 5
    if op in (-49, -61):                         # SETVAR1/SETCONSTVAR1 (含 GETVAR1 -48)
        return 2
    if op == -26:                                # LINE
        return 3
    if op in (-71, -72, -73):                    # REG_BIGINT1/2/4
        return { -71: 2, -72: 3, -73: 5 }[op]
    return 1

def disassemble(icode_bytes, strings, doubles=None, nested_count=0):
    """反汇编 ICode, 返回指令列表 [(pc, op, name, operand_dict)]"""
    b = icode_bytes
    n = len(b)
    instrs = []
    pc = 0
    index_reg = 0
    string_reg = None
    while pc < n:
        op = s8(b[pc])
        span = bytecode_span(op)
        name = opname(op)
        start = pc
        pc += 1
        info = {"op": op, "name": name, "pc": start}
        if name in ("THROW", "YIELD", "YIELD_STAR", "GENERATOR", "GENERATOR_END", "GENERATOR_RETURN"):
            info["line"] = get_index(b, pc)
            pc += 2
        elif name in ("GOTO", "IFEQ", "IFNE", "IFEQ_POP", "LEAVEDQ"):
            info["target"] = pc + get_short(b, pc) - 1
            pc += 2
        elif name == "GOSUB":
            info["sub"] = pc + get_short(b, pc) - 1
            pc += 2
        elif name == "CALLSPECIAL":
            info["callType"] = b[pc]
            info["isNew"] = b[pc+1]
            info["line"] = get_index(b, pc+2)
            pc += 4
        elif name == "CATCH_SCOPE":
            info["flag"] = b[pc]
            pc += 1
        elif name in ("VAR_INC_DEC", "NAME_INC_DEC", "PROP_INC_DEC", "ELEM_INC_DEC", "REF_INC_DEC"):
            info["incDec"] = b[pc]
            pc += 1
        elif name == "SHORTNUMBER":
            info["value"] = get_short(b, pc)
            pc += 2
        elif name == "INTNUMBER":
            info["value"] = get_int(b, pc)
            pc += 4
        elif name in ("REG_IND1",):
            index_reg = b[pc] & 0xFF
            info["indexReg"] = index_reg
            pc += 1
        elif name in ("REG_IND2",):
            index_reg = get_index(b, pc)
            info["indexReg"] = index_reg
            pc += 2
        elif name in ("REG_IND4",):
            index_reg = get_int(b, pc)
            info["indexReg"] = index_reg
            pc += 4
        elif name.startswith("REG_IND_C"):
            index_reg = int(name[-1])
            info["indexReg"] = index_reg
        elif name in ("REG_STR1",):
            string_reg = strings[b[pc] & 0xFF] if b[pc] & 0xFF < len(strings) else None
            info["stringReg"] = string_reg
            pc += 1
        elif name in ("REG_STR2",):
            idx = get_index(b, pc)
            string_reg = strings[idx] if idx < len(strings) else None
            info["stringReg"] = string_reg
            pc += 2
        elif name in ("REG_STR4",):
            idx = get_int(b, pc)
            string_reg = strings[idx] if 0 <= idx < len(strings) else None
            info["stringReg"] = string_reg
            pc += 4
        elif name.startswith("REG_STR_C"):
            idx = int(name[-1])
            string_reg = strings[idx] if idx < len(strings) else None
            info["stringReg"] = string_reg
        elif name in ("REG_BIGINT1",):
            info["bigIntIdx"] = b[pc] & 0xFF
            pc += 1
        elif name in ("REG_BIGINT2",):
            info["bigIntIdx"] = get_index(b, pc)
            pc += 2
        elif name in ("REG_BIGINT4",):
            info["bigIntIdx"] = get_int(b, pc)
            pc += 4
        elif name.startswith("REG_BIGINT_C"):
            info["bigIntIdx"] = int(name[-1])
        elif name in ("GETVAR1", "SETVAR1", "SETCONSTVAR1"):
            info["varIdx"] = s8(b[pc])
            pc += 1
        elif name == "LINE":
            info["line"] = get_index(b, pc)
            pc += 2
        # 消耗 indexReg/stringReg 的指令
        if name in ("CALL", "TAIL_CALL", "REF_CALL", "NEW"):
            info["indexReg"] = index_reg
        if name in ("LITERAL_NEW", "LITERAL_SET", "LITERAL_GETTER", "LITERAL_SETTER"):
            info["litCount"] = index_reg
        if name in ("REGEXP",):
            info["regexpIdx"] = index_reg
        if name in ("OBJECTLIT", "SPARE_ARRAYLIT"):
            info["literalId"] = index_reg
        if name in ("CLOSURE_EXPR", "CLOSURE_STMT"):
            info["nestedIdx"] = index_reg
        if name in ("NUMBER",):
            info["doubleIdx"] = index_reg
        if name in ("STRING", "NAME", "SETNAME", "STRICT_SETNAME", "BINDNAME", "TYPEOFNAME",
                    "DELNAME", "GETPROP", "SETPROP", "GETPROPNOWARN", "DELPROP",
                    "REF_MEMBER", "REF_NAME", "REF_NS_MEMBER", "REF_NS_NAME",
                    "NAME_AND_THIS", "PROP_AND_THIS"):
            info["stringReg"] = string_reg
        if name in ("VAR_INC_DEC",):
            info["varIdx"] = index_reg
        if name in ("NAME_INC_DEC", "CATCH_SCOPE"):
            info["stringReg"] = string_reg
        if name in ("BIGINT",):
            info["bigIntIdx"] = index_reg
        instrs.append(info)
    return instrs

if __name__ == "__main__":
    import json, sys
    snap = json.load(open("../snapshot.json"))
    def walk(node, depth=0):
        ic = bytes.fromhex(node["icode"])
        strs = node["strings"]
        instrs = disassemble(ic, strs)
        print("=" * 70)
        print("函数 [%s] icode=%dB 指令数=%d" % (node["name"] or "<anon>", len(ic), len(instrs)))
        for ins in instrs[:60]:
            extra = {k: v for k, v in ins.items() if k not in ("op", "name", "pc")}
            print("  [%4d] %-22s %s" % (ins["pc"], ins["name"], extra if extra else ""))
        for ch in node.get("nested", [])[:3]:
            walk(ch, depth+1)
    walk(snap)
