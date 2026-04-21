import { _registerBuiltInOperator } from "../operators";

import * as colorSchemeOps from "./color-scheme";
import * as spaces from "./spaces";
import * as common from "./common";

const builtInOperators = {
  ...colorSchemeOps,
  ...spaces,
  ...common,
};

for (const [name, op] of Object.entries(builtInOperators)) {
  try {
    _registerBuiltInOperator(op);
  } catch (e) {
    console.error(`Failed to register built-in operator ${name}:`, e);
  }
}
