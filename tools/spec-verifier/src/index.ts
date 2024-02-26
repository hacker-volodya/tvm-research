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
    let unsignedRange = (operand: Operand): IntegerOperand => ({
        'type': 'integer',
        'minValue': BigInt(0),
        'maxValue': (BigInt(1) << BigInt((operand.loader_args!.size as number))) - BigInt(1)
    });

    let unsignedRangeWithBounds = (operand: Operand, bounds: OperandsRangeCheck | undefined): IntegerOperand => {
        if (bounds) {
            return { type: 'integer', maxValue: BigInt(bounds.to), minValue: BigInt(bounds.from) }
        } else {
            return unsignedRange(operand);
        }
    };

    let signedRange = (operand: Operand): IntegerOperand => {
        let max = unsignedRange(operand).maxValue / BigInt(2);
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
        if (operand.internal) {
            continue;
        }
        if (operand.loader == "subslice") {
            let minBits = operand.loader_args!.bits_padding as number ?? 0;
            let minRefs = operand.loader_args!.refs_add as number ?? 0;
            let maxBits = minBits;
            let maxRefs = minRefs;
            // assuming length vars are always unsigned
            let bitLengthVarName = operand.loader_args?.bits_length_var;
            if (bitLengthVarName) {
                let lengthVar = operands.find(x => x.name == bitLengthVarName)!;
                maxBits += Number(unsignedRangeWithBounds(lengthVar, lengthVar.name == operands[0].name ? instruction.bytecode.operands_range_check : undefined).maxValue) * 8;
            }
            let refLengthVarName = operand.loader_args?.refs_length_var;
            if (refLengthVarName) {
                let lengthVar = operands.find(x => x.name == refLengthVarName)!;
                maxRefs += Number(unsignedRangeWithBounds(lengthVar, lengthVar.name == operands[0].name ? instruction.bytecode.operands_range_check : undefined).maxValue);
            }
            if (operand.loader_args!.completion_tag) {
                maxBits -= 1;
                minBits = 0;
            }
            result.set(operand.name, { type: 'cell', maxBits, maxRefs, minBits, minRefs });
        }
        else if (operand.loader == "int") {
            result.set(operand.name, signedRange(operand));
        } else if (operand.loader == "uint") {
            // assuming operands_range_check used only for uints and matches its size
            if (i == 0) {
                result.set(operand.name, unsignedRangeWithBounds(operand, instruction.bytecode.operands_range_check));
            } else {
                result.set(operand.name, unsignedRange(operand));
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

function addInstruction(continuation: Builder, instruction: Instruction, operands: Map<string, Cell | bigint>): Builder {
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
    let result = continuation.storeUint(prefix, size);
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
                    result = result.storeInt(operandValue, operand.loader_args!.size as number);
                } else if (operand.loader == 'uint') {
                    result = result.storeUint(operandValue, operand.loader_args!.size as number);
                } else if (operand.loader == 'pushint_long') {
                    let size = operandValue.toString(2).length / 8;
                    result = result.storeUint(operandValue, )
                }
            }
        }
        // separate internal operands from common
        // (opt) try to match range check with operands here, tell operandGetter about restrictions
        // call operandPutter
        // fill internal operands
        // do range check
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
})()