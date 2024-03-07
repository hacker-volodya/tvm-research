import { cp0 } from "tvm-spec";
import { addInstruction, generateInstructionOperands, runCode } from "./utils";
import { beginCell } from "@ton/ton";

(async () => {
    let data: any = {};
    for (let instruction of cp0.instructions) {
        if (instruction.mnemonic != "PUSHSLICE_REFS") continue;
        let operands = generateInstructionOperands(instruction);
        let builder = addInstruction(instruction, operands);
        console.log(builder.endCell().toString())
        let result = await runCode(beginCell().storeBuilder(builder).endCell(), []);
        console.log(result);
        data[instruction.mnemonic] = result;
    }
    console.log("------------------")
    console.log(JSON.stringify(data));
})();
