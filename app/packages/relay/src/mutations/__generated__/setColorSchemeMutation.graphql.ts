/**
 * @generated SignedSource<<98eab1035b9a3cd4474a2cda909c13c0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type ColorSchemeInput = {
  colorPool?: ReadonlyArray<string> | null;
  fields?: Array | null;
};
export type setColorSchemeMutation$variables = {
  colorScheme: ColorSchemeInput;
  dataset: string;
  saveToApp: boolean;
  session?: string | null;
  stages: Array;
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
  "name": "dataset"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "saveToApp"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "stages"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v6 = [
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
        "name": "dataset",
        "variableName": "dataset"
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
        "name": "stages",
        "variableName": "stages"
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
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setColorSchemeMutation",
    "selections": (v6/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v5/*: any*/),
      (v3/*: any*/),
      (v1/*: any*/),
      (v4/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "setColorSchemeMutation",
    "selections": (v6/*: any*/)
  },
  "params": {
    "cacheID": "9a5cb504b80aeb4092afb482fa7b9eac",
    "id": null,
    "metadata": {},
    "name": "setColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setColorSchemeMutation(\n  $subscription: String!\n  $session: String\n  $dataset: String!\n  $stages: BSONArray!\n  $colorScheme: ColorSchemeInput!\n  $saveToApp: Boolean!\n) {\n  setColorScheme(subscription: $subscription, session: $session, dataset: $dataset, stages: $stages, colorScheme: $colorScheme, saveToApp: $saveToApp)\n}\n"
  }
};
})();

(node as any).hash = "193b0e609534a6ecbd3254c763b832c5";

export default node;
