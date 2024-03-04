import {
    Instruction,
    InstructionOperands,
    OperandsRangeCheck,
    cp0,
} from "tvm-spec";
import { TVMStack, TVMStackEntry, runTVM } from "ton-contract-executor";
import { Builder, Cell, beginCell } from "@ton/ton";

const instructions = new Map();
for (let insn of cp0.instructions) {
    instructions.set(insn.mnemonic, insn);
}

function addInstruction(
    instruction: Instruction,
    operands: Map<string, Cell | bigint>
): Builder {
    let prefixHex = instruction.bytecode.prefix.replace("_", "");
    let completionTag = instruction.bytecode.prefix.endsWith("_");
    let size = prefixHex.length * 4;
    let prefix = parseInt(prefixHex, 16);
    if (completionTag) {
        while ((prefix & 1) == 0) {
            prefix >>= 1;
            size -= 1;
        }
        prefix >>= 1;
        size -= 1;
    }
    let result = beginCell();
    result.storeUint(prefix, size);
    if (instruction.bytecode.operands) {
        for (let operand of instruction.bytecode.operands) {
            let operandValue = operands.get(operand.name);
            if (!operandValue) {
                throw new Error("missing operand");
            }
            if (operand.type == "int" || operand.type == "uint") {
                if (typeof operandValue != "bigint") {
                    throw Error("unknown type");
                }
                if (
                    operandValue > operand.max_value ||
                    operandValue < operand.min_value
                ) {
                    throw Error("out of range");
                }
                if (operand.type == "int") {
                    result.storeInt(operandValue, operand.size as number);
                } else if (operand.type == "uint") {
                    result.storeUint(operandValue, operand.size as number);
                }
            } else if (operand.type == "pushint_long") {
                if (typeof operandValue != "bigint") {
                    throw Error("unknown type");
                }
                let bitSize = operandValue.toString(2).length;
                let arg = Math.ceil((bitSize - 19) / 8);
                if (arg > 30) {
                    throw new Error("out of range");
                }
                result.storeUint(arg, 5);
                result.storeInt(operandValue, bitSize);
            } else {
                if (!(operandValue instanceof Cell)) {
                    throw Error("unknown type");
                }
                if (operand.type == "ref") {
                    result.storeRef(operandValue);
                } else {
                    if (
                        operandValue.bits.length > operand.max_bits ||
                        operandValue.bits.length < operand.min_bits
                    ) {
                        throw Error("bit length out of range");
                    }
                    if (
                        operandValue.refs.length > operand.max_refs ||
                        operandValue.refs.length < operand.min_refs
                    ) {
                        throw Error("ref length out of range");
                    }
                    let refsVarSize = (operand.refs_length_var_size as number) ?? 0;
                    let refsAdd = (operand.refs_add as number) ?? 0;
                    if (refsVarSize > 0) {
                        result.storeUint(operandValue.refs.length - refsAdd, refsVarSize);
                    }
                    let bitsVarSize = (operand.bits_length_var_size as number) ?? 0;
                    let bitsAdd = (operand.bits_padding as number) ?? 0;
                    if (bitsVarSize > 0) {
                        if (
                            !operand.completion_tag &&
                            (operandValue.bits.length - bitsAdd) % 8 != 0
                        ) {
                            throw Error(
                                "completion tag is absent, operand slice length not divisible by 8"
                            );
                        }
                        result.storeUint(
                            Math.ceil((operandValue.bits.length - bitsAdd) / 8),
                            bitsVarSize
                        );
                    }
                    result.storeSlice(operandValue.asSlice());
                    if (operand.completion_tag) {
                        result.storeBit(1);
                        let paddingSize =
                            Math.ceil((operandValue.bits.length - bitsAdd) / 8) * 8 +
                            bitsAdd -
                            operandValue.bits.length -
                            1;
                        while (paddingSize) {
                            result.storeBit(0);
                            paddingSize--;
                        }
                    }
                }
            }
        }
    }
    return result;
}

async function runCode(code: Cell, stack: TVMStack) {
    return await runTVM({
        debug: true,
        function_selector: 1337,
        init_stack: stack,
        code: code.toBoc({ idx: false }).toString("base64"),
        data: beginCell().endCell().toBoc({ idx: false }).toString("base64"),
        c7_register: {
            type: "tuple",
            value: [],
        },
        gas_limit: -1,
        gas_max: -1,
        gas_credit: -1,
    });
}

// (async () => {
//     let result = await runCode(beginCell().storeUint(0xa4, 8).endCell(), [
//         {
//             type: 'int',
//             value: '1'
//         }
//     ]);
//     console.log(Buffer.from(result.logs ?? "", 'base64').toString('ascii'));
//     console.log(result);
// })()

(async () => {
    for (let instruction of cp0.instructions) {
        if (!instruction.value_flow.inputs.registers) {
            instruction.value_flow.inputs.registers = [];
        }
        if (!instruction.value_flow.outputs.registers) {
            instruction.value_flow.outputs.registers = [];
        }
    }
    console.log(JSON.stringify(cp0));
    //console.log(addInstruction(cp0.instructions.find(x => x.mnemonic == 'STSLICECONST')!, new Map([["s", beginCell().storeUint(0xffff, 16).endCell()]])).endCell().toString())
})();
