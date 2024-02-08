#!/usr/bin/env python3

import json, base64, sys
from tonpy import CellSlice  # pip install tonpy


def subslice_loader(s: CellSlice, ops, vars):
    complete_bit_length = vars.get("bits_padding", 0)
    if vars.get("bits_length_var") is not None:
        complete_bit_length += 8 * ops[vars["bits_length_var"]]
    ref_length = vars.get("refs_add", 0)
    if vars.get("refs_length_var") is not None:
        ref_length += ops[vars["refs_length_var"]]
    bit_length = complete_bit_length
    if complete_bit_length != 0 and vars.get("completion_tag", False):
        bit_length = s.to_bitstring()[:complete_bit_length].rindex("1")
    result = s.load_subslice(bit_length, ref_length)
    s.skip_bits(complete_bit_length - bit_length)
    return result

LOADERS = {
    "int": lambda s, ops, vars: s.load_int(vars["size"]),
    "uint": lambda s, ops, vars: s.load_uint(vars["size"]),
    "ref": lambda s, ops, vars: s.load_ref(),
    "pushint_long": lambda s, ops, vars: s.load_int(8 * s.load_uint(5) + 19),
    "subslice": subslice_loader
}

def prefix_to_bin(prefix):
    bits = ''.join([bin(int(c, 16))[2:].zfill(4) for c in prefix.rstrip("_")])
    return bits[:bits.rindex("1")] if prefix.endswith("_") else bits

def build_instructions_dict():
    with open("cp0_v3.json") as f:
        cp0 = json.load(f)
    return {prefix_to_bin(instruction["bytecode"]["prefix"]):instruction for instruction in cp0["instructions"]}

def load_opcode_prefix(instructions, slice: CellSlice):
    bits = 1
    matched_insn = None
    while any([insn_prefix.startswith(slice.preload_bitstring(bits)) for insn_prefix in instructions.keys()]):
        if exact_match := instructions.get(slice.preload_bitstring(bits)):
            matched_insn = exact_match
        bits += 1
    slice.skip_bits(len(prefix_to_bin(matched_insn["bytecode"]["prefix"])))
    return matched_insn

def load_operands(instruction, slice: CellSlice):
    operands = instruction["bytecode"]["operands"]
    parsed_operands = {}
    for operand in operands:
        parsed_operands[operand["name"]] = LOADERS[operand["loader"]](slice, parsed_operands, operand["loader_args"])
    return parsed_operands

def disasm_next_instruction(instructions, slice: CellSlice):
    instruction = load_opcode_prefix(instructions, slice)
    operands = load_operands(instruction, slice)
    return instruction["mnemonic"], operands

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <boc_file>")
        sys.exit(1)
    cs = CellSlice(base64.b64encode(sys.argv[1]).decode())
    instructions = build_instructions_dict()
    while not cs.empty_ext():
        print(disasm_next_instruction(instructions, cs))
