import { _registerBuiltInOperator, Operator } from "../operators";

import * as colorSchemeOps from "./color-scheme";
import * as dataset from "./dataset";
import * as sidebar from "./sidebar";
import * as spaces from "./spaces";

function registerBuiltInOperators(operators: Record<string, typeof Operator>) {
  for (const [name, op] of Object.entries(operators)) {
    try {
      _registerBuiltInOperator(op);
    } catch (e) {
      console.error(`Failed to register built-in operator ${name}:`, e);
    }
  }
}

/**
 * Imports operators module asynchronously and registers them as built-in
 * operators to avoid circular dependencies
 */
async function registerBuiltInOperatorsAsync() {
  const annotateOps = await import("./annotate");
  registerBuiltInOperators(annotateOps);
}

const builtInOperators = {
  ...colorSchemeOps,
  ...dataset,
  ...sidebar,
  ...spaces,
};

registerBuiltInOperators(builtInOperators);
registerBuiltInOperatorsAsync().catch((e) => {
  console.error("Failed to register built-in operators asynchronously:", e);
});
