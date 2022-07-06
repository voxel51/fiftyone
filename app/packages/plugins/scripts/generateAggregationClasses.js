const fs = require("fs-extra");
const path = require("path");
const { camelCase } = require("lodash");

const rootDir = path.join(__dirname, "..", "..", "..", "..");
const aggregationsDotPy = path.join(rootDir, "fiftyone/core/aggregations.py");
const pluginSrc = path.join(__dirname, "..", "src");
const generatedAggFile = path.join(pluginSrc, "aggregations.ts");

async function main() {
  const contents = await fs.readFile(aggregationsDotPy, "utf-8");
  const lines = contents.split("\n");

  let classes = [];
  let currentClass = null;
  let parsingArgs = false;
  let parsingComment = false;
  let results = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // console.log(line)
    if (line.trim().startsWith('"""')) {
      parsingComment = !parsingComment;
      if (line.trim().endsWith('"""') && line.trim() != '"""')
        parsingComment = !parsingComment;
      if (!parsingComment) parsingArgs = false;
      continue;
    }

    if (parsingComment && currentClass) {
      if (line.trim().startsWith("Args:")) {
        parsingArgs = true;
        continue;
      }
      if (line.trim().startsWith("Returns:")) {
        parsingArgs = false;
        continue;
      }
      if (
        parsingArgs &&
        line.startsWith("        ") &&
        !line.startsWith("          ")
      ) {
        const [full, argName] = line.trim().match(/^(\w+)\s*[\:|\(]/);
        console.log("  ", argName);
        currentClass.args[argName] = line.trim();
      }
    } else {
      if (line.startsWith("class") && line.trim().endsWith("(Aggregation):")) {
        const [full, m1] = line.trim().match(/class (\w+)\(Aggregation\)\:/);
        currentClass = { name: m1, args: [] };
        classes.push(currentClass);
      }
    }

    console.log(classes);
    // to js
    const js = toJS(classes);
    fs.writeFile(generatedAggFile, js, "utf-8");
  }
}

function toJS(classes) {
  let output = ["import Aggregation from './Aggregation'"];
  for (let cls of classes) {
    output.push(`
${printType(cls)}

export class ${cls.name} extends Aggregation {
  constructor(params: ${cls.name}Params = null) {
    super()
    this.params = params
    this._cls = 'fiftyone.core.aggregations.${cls.name}'
    this._nameMap = new Map(Object.entries({
${printNameMap(cls.args)}
    }))
  }
}`);
  }
  return output.join("\n");
}

function printType(cls) {
  return `export type ${cls.name}Params = {
${printArgs(cls.args)}
}`;
}

function printArgs(args) {
  const output = Object.keys(args).map((a) => `  ${fromPyToJS(a)}?: any`);
  return output.join(",\n");
}

function printToJSON(args) {
  const output = Object.keys(args).map(
    (a) => `      ['${a}', this.params.${fromPyToJS(a)}]`
  );
  return `[
${output.join(",\n")}
    ]`;
}

function printNameMap(args) {
  return Object.keys(args)
    .map((k) => {
      return `      ${fromPyToJS(k)}: '${k}'`;
    })
    .join(",\n");
}

function fromPyToJS(argName) {
  return camelCase(argName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
