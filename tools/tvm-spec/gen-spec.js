let js2ts = require('json-schema-to-typescript')
let fs = require('fs')

// compile from file
js2ts.compileFromFile('src/tvm-spec/schema.json')
  .then(ts => fs.writeFileSync('src/gen/tvm-spec.ts', ts))