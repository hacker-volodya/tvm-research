import { cp0 } from "tvm-spec";

(async () => {
    for (let instruction of cp0.instructions) {
        for (let op of instruction.bytecode.operands) {
            // @ts-ignore
            if (op.display_hints == undefined) {
                // @ts-ignore
                op.display_hints = [];
            }
        }
    }
    console.log(JSON.stringify(cp0));
})();
