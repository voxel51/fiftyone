import { _registerBuiltInOperator } from "../operators";

import * as colorSchemeOps from "./color-scheme";
import * as spaces from "./spaces";
import * as dataset from "./dataset";

const builtInOperators = {
  ...colorSchemeOps,
  ...spaces,
  ...dataset,
};

for (const [name, op] of Object.entries(builtInOperators)) {
  try {
    _registerBuiltInOperator(op);
  } catch (e) {
    console.error(`Failed to register built-in operator ${name}:`, e);
  }
}
