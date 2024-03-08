import { cp0 } from "tvm-spec";

(async () => {
    for (let instruction of cp0.instructions) {
        // @ts-ignore
        instruction.doc.opcode = instruction.bytecode.doc_opcode;
        // @ts-ignore
        instruction.bytecode.doc_opcode = undefined;
        // @ts-ignore
        instruction.doc.stack = instruction.value_flow.doc_stack;
        // @ts-ignore
        instruction.value_flow.doc_stack = undefined;
    }
    console.log(JSON.stringify(cp0));
})();
