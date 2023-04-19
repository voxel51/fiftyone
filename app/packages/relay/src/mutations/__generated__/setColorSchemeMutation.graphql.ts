/**
 * @generated SignedSource<<597ebfaa344b6a3c6bc916ab1b1cb831>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type ColorScheme = {
  colorPool?: ReadonlyArray<string> | null;
  customizedColorSettings?: object | null;
};
export type setColorSchemeMutation$variables = {
  colorScheme: ColorScheme;
  saveToApp: boolean;
  session?: string | null;
  subscription: string;
};
export type setColorSchemeMutation$data = {
  readonly setColorScheme: boolean;
};
export type setColorSchemeMutation = {
  response: setColorSchemeMutation$data;
  variables: setColorSchemeMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "colorScheme"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "saveToApp"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "colorScheme",
        "variableName": "colorScheme"
      },
      {
        "kind": "Variable",
        "name": "saveToApp",
        "variableName": "saveToApp"
      },
      {
        "kind": "Variable",
        "name": "session",
        "variableName": "session"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setColorScheme",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setColorSchemeMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v3/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setColorSchemeMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "1e890a4257c9c1d1a30a9fa2a1c0a282",
    "id": null,
    "metadata": {},
    "name": "setColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setColorSchemeMutation(\n  $subscription: String!\n  $session: String\n  $colorScheme: ColorScheme!\n  $saveToApp: Boolean!\n) {\n  setColorScheme(subscription: $subscription, session: $session, colorScheme: $colorScheme, saveToApp: $saveToApp)\n}\n"
  }
};
})();

(node as any).hash = "a5e1f0d4d0a19a42b588ac7236c173e8";

export default node;
