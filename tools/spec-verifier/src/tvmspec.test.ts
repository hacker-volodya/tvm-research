import { cp0 } from "tvm-spec";

describe('tvm-spec', () => {
    test('prefixes do not intersect with each other', () => {
        let prefixTree: any = {};
        for (let instruction of cp0.instructions) {
            let prefix = instruction.bytecode.prefix;
            let currentNode = prefixTree;
            for (let i = 0; i < prefix.length; i++) {
                if (prefix[i] == "_") {
                    break;
                }
                if (!currentNode[prefix[i]]) {
                    currentNode[prefix[i]] = {};
                }
                currentNode = currentNode[prefix[i]];
                expect(currentNode).toBeInstanceOf(Object);
            }
            currentNode
        }
    });
});