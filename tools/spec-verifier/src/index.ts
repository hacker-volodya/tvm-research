import { Instruction, InstructionOperands, OperandsRangeCheck, cp0 } from "tvm-spec";
import { TVMStack, TVMStackEntry, runTVM } from "ton-contract-executor";
import { Builder, Cell, beginCell } from "@ton/ton";

type ArrayElement<ArrayType extends readonly unknown[]> = 
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

type Operand = ArrayElement<InstructionOperands>;

interface IntegerOperand {
    type: 'integer',
    maxValue: bigint,
    minValue: bigint
}

interface CellOperand {
    type: 'cell',
    maxBits: number,
    minBits: number,
    maxRefs: number,
    minRefs: number
}

type OperandType = IntegerOperand | CellOperand;

function getInstructionOperandTypes(instruction: Instruction): Map<string, OperandType> {
    let unsignedRange = (bitSize: number): IntegerOperand => ({
        'type': 'integer',
        'minValue': BigInt(0),
        'maxValue': (BigInt(1) << BigInt(bitSize)) - BigInt(1)
    });

    let unsignedRangeWithBounds = (bitSize: number, bounds: OperandsRangeCheck | undefined): IntegerOperand => {
        if (bounds) {
            return { type: 'integer', maxValue: BigInt(bounds.to), minValue: BigInt(bounds.from) }
        } else {
            return unsignedRange(bitSize);
        }
    };

    let signedRange = (bitSize: number): IntegerOperand => {
        let max = unsignedRange(bitSize).maxValue / BigInt(2);
        return {
            'type': 'integer',
            'minValue': -max - BigInt(1),
            'maxValue': max
        }
    };

    let result = new Map<string, OperandType>();
    let operands = instruction.bytecode.operands;
    if (!operands) {
        return result;
    }
    for (let i = 0; i < operands.length; i++) {
        let operand = operands[i];
        if (operand.loader == "subslice") {
            let minBits = operand.loader_args!.bits_padding as number ?? 0;
            let minRefs = operand.loader_args!.refs_add as number ?? 0;
            let maxBits = minBits;
            let maxRefs = minRefs;
            let bitLengthVarSize = operand.loader_args?.bits_length_var_size as number;
            let refLengthVarSize = operand.loader_args?.refs_length_var_size as number;
            let refsRangeCheck = i == 0 && refLengthVarSize ? instruction.bytecode.operands_range_check : undefined;
            let bitsRangeCheck = i == 0 && !refLengthVarSize ? instruction.bytecode.operands_range_check : undefined;
            if (bitLengthVarSize) {
                maxBits += Number(unsignedRangeWithBounds(bitLengthVarSize, bitsRangeCheck).maxValue) * 8;
            }
            if (refLengthVarSize) {
                maxRefs += Number(unsignedRangeWithBounds(refLengthVarSize, refsRangeCheck).maxValue);
            }
            if (operand.loader_args!.completion_tag) {
                maxBits -= 1;
                minBits = 0;
            }
            result.set(operand.name, { type: 'cell', maxBits, maxRefs, minBits, minRefs });
        }
        else if (operand.loader == "int") {
            result.set(operand.name, signedRange(operand.loader_args!.size as number));
        } else if (operand.loader == "uint") {
            // assuming operands_range_check used only for uints and matches its size
            if (i == 0) {
                result.set(operand.name, unsignedRangeWithBounds(operand.loader_args!.size as number, instruction.bytecode.operands_range_check));
            } else {
                result.set(operand.name, unsignedRange(operand.loader_args!.size as number));
            }
        } else if (operand.loader == "pushint_long") {
            result.set(operand.name, { type: 'integer', maxValue: (BigInt(1) << BigInt(258)) - BigInt(1), minValue: -(BigInt(1) << BigInt(258)) });
        } else if (operand.loader == "ref") {
            result.set(operand.name, { type: 'cell', maxBits: 1023, minBits: 0, maxRefs: 4, minRefs: 0 });
        }
    }
    return result;
}

const instructions = new Map(); 
for (let insn of cp0.instructions) {
    instructions.set(insn.mnemonic, insn);
}

function addInstruction(instruction: Instruction, operands: Map<string, Cell | bigint>): Builder {
    let prefixHex = instruction.bytecode.prefix.replace('_', '');
    let completionTag = instruction.bytecode.prefix.endsWith('_');
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
        let operandTypes = getInstructionOperandTypes(instruction);
        for (let operand of instruction.bytecode.operands) {
            let operandValue = operands.get(operand.name);
            if (!operandValue) {
                throw new Error('missing operand');
            }
            let operandType = operandTypes.get(operand.name)!;
            if (operandType.type == "integer") {
                if (typeof operandValue != 'bigint') {
                    throw Error('unknown type');
                }
                if (operandValue > operandType.maxValue || operandValue < operandType.minValue) {
                    throw Error('out of range');
                }
                if (operand.loader == 'int') {
                    result.storeInt(operandValue, operand.loader_args!.size as number);
                } else if (operand.loader == 'uint') {
                    result.storeUint(operandValue, operand.loader_args!.size as number);
                } else if (operand.loader == 'pushint_long') {
                    let bitSize = operandValue.toString(2).length;
                    result.storeUint(Math.ceil((bitSize - 19) / 8), 5);
                    result.storeUint(operandValue, bitSize);
                }
            } else {
                if (!(operandValue instanceof Cell)) {
                    throw Error('unknown type');
                }
                if (operandValue.bits.length > operandType.maxBits || operandValue.bits.length < operandType.minBits) {
                    throw Error('bit length out of range');
                }
                if (operandValue.refs.length > operandType.maxRefs || operandValue.refs.length < operandType.minRefs) {
                    throw Error('ref length out of range');
                }
                if (operand.loader == 'ref') {
                    result.storeRef(operandValue);
                } else if (operand.loader == 'subslice') {
                    let refsVarSize = operand.loader_args!.refs_length_var_size as number ?? 0;
                    let refsAdd = operand.loader_args!.refs_add as number ?? 0;
                    if (refsVarSize > 0) {
                        result.storeUint(operandValue.refs.length - refsAdd, refsVarSize);
                    }
                    let bitsVarSize = operand.loader_args!.bits_length_var_size as number ?? 0;
                    let bitsAdd = operand.loader_args!.bits_padding as number ?? 0;
                    if (bitsVarSize > 0) {
                        if (!operand.loader_args!.completion_tag && (operandValue.bits.length - bitsAdd) % 8 != 0) {
                            throw Error('completion tag is absent, operand slice length not divisible by 8');
                        }
                        result.storeUint(Math.ceil((operandValue.bits.length - bitsAdd) / 8), bitsVarSize);
                    }
                    result.storeSlice(operandValue.asSlice());
                    if (operand.loader_args!.completion_tag) {
                        result.storeBit(1);
                        let paddingSize = Math.ceil((operandValue.bits.length - bitsAdd) / 8) * 8 + bitsAdd - operandValue.bits.length - 1;
                        console.log(paddingSize);
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
        code: code.toBoc({idx: false}).toString('base64'),
        data: beginCell().endCell().toBoc({idx: false}).toString('base64'),
        c7_register: {
            type: "tuple",
            value: []
        },
        gas_limit: -1,
        gas_max: -1,
        gas_credit: -1
    })
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
        console.log(instruction.mnemonic, getInstructionOperandTypes(instruction))
    }
    console.log(addInstruction(cp0.instructions.find(x => x.mnemonic == 'STSLICECONST')!, new Map([["s", beginCell().storeUint(0xffff, 16).endCell()]])).endCell().toString())
})()