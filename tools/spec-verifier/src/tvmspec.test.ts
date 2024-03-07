import { cp0 } from "tvm-spec";
import { addInstruction, generateInstructionOperands, runCode } from "./utils";
import { beginCell } from "@ton/ton";

describe('tvm-spec', () => {
    test.concurrent.each(cp0.instructions.filter(insn => insn.since_version <= 4))('all instructions with version <= 4 decoded properly', async (instruction) => {
        let operands = generateInstructionOperands(instruction);
        if (instruction.mnemonic == "XCHG_IJ") {
            operands.set('j', BigInt(5));
        }
        let builder = addInstruction(instruction, operands);
        let result = await runCode(beginCell().storeBuilder(builder).endCell(), []);
        let context = `instruction ${instruction.mnemonic}\nresult\n${JSON.stringify(result, undefined, 4)}`;
        expect(result.output.success, context).toBe(true);
        if (!result.output.success) throw new Error('wtf');
        if (instruction.mnemonic == "SETCP_SPECIAL") {
            expect(result.output.vm_log, context).toContain("unsupported codepage");
        } else {
            expect(result.output.vm_exit_code, context).not.toBe(6);
        }
    });

    test.concurrent.each(cp0.instructions.filter(insn => insn.since_version > 4))('all instructions with version > 4 returns with invalid opcode', async (instruction) => {
        let operands = generateInstructionOperands(instruction);
        let builder = addInstruction(instruction, operands);
        let result = await runCode(beginCell().storeBuilder(builder).endCell(), []);
        let context = `instruction ${instruction.mnemonic}\nresult\n${JSON.stringify(result, undefined, 4)}`;
        expect(result.output.success, context).toBe(true);
        if (!result.output.success) throw new Error('wtf');
        expect(result.output.vm_exit_code, context).toBe(6);
        expect(result.output.vm_log, context).toContain("invalid opcode");
    });
});