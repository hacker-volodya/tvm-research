import {
    Instruction,
    InstructionOperands,
    OperandsRangeCheck,
    cp0,
} from "tvm-spec";
import { TVMStack, TVMStackEntry, runTVM } from "ton-contract-executor";
import { Address, Builder, Cell, TupleItem, beginCell } from "@ton/ton";
import { Executor, defaultConfig } from "@ton/sandbox";

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
            if (operandValue == undefined) {
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
                let arg = Math.max(Math.ceil((bitSize - 19) / 8), 0);
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
                        while (paddingSize > 0) {
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

async function runCode(code: Cell, stack: TupleItem[]) {
    let executor = await Executor.create();
    return await executor.runGetMethod({
        code: beginCell()
            .storeUint(0x30, 8)  // drop method_id
            .storeSlice(code.asSlice()) // actual code
            .endCell(),
        data: beginCell().endCell(),
        methodId: 1337,
        stack: stack,
        config: defaultConfig,
        verbosity: "full_location_stack_verbose",
        address: Address.parseRaw("0:0000000000000000000000000000000000000000000000000000000000000000"),
        unixTime: 10000,
        balance: 1000n,
        randomSeed: Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
        gasLimit: 1000n,
        debugEnabled: true
    });
}

(async () => {
    let data: any = {};
    for (let instruction of cp0.instructions) {
        let operands = new Map<string, Cell | bigint>(instruction.bytecode.operands.map(op => {
            if (op.type == "int" || op.type == "uint") {
                return [op.name, BigInt(op.min_value)];
            } else if (op.type == "pushint_long") {
                return [op.name, BigInt(0)];
            } else if (op.type == "ref") {
                return [op.name, beginCell().endCell()];
            } else if (op.type == "subslice") {
                let builder = op.completion_tag ? beginCell().storeUint(0, op.min_bits || 1) : beginCell().storeUint(0, 8);
                for (let i = 0; i < op.min_refs; i++) {
                    builder.storeRef(beginCell());
                }
                return [op.name, builder.endCell()];
            } else {
                throw new Error("wtf");
            }
        }));
        console.log(instruction.mnemonic, operands);
        let builder = addInstruction(instruction, operands);
        let result = await runCode(beginCell().storeBuilder(builder).endCell(), []);
        console.log(result);
        data[instruction.mnemonic] = result;
    }
    console.log("------------------")
    console.log(JSON.stringify(data));
})();
