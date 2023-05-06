/**
 * @generated SignedSource<<8c1eef9d348ec4b6f741754fd0d8c57f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type ColorSchemeInput = {
  colorPool?: ReadonlyArray<string> | null;
  customizedColorSettings?: Array | null;
};
export type ColorSchemeSaveFormat = {
  colorPool?: ReadonlyArray<string> | null;
  customizedColorSettings?: string | null;
};
export type setColorSchemeMutation$variables = {
  colorScheme: ColorSchemeInput;
  colorSchemeSaveFormat: ColorSchemeSaveFormat;
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
  "name": "colorSchemeSaveFormat"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "saveToApp"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "stages"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v7 = [
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
        "name": "colorSchemeSaveFormat",
        "variableName": "colorSchemeSaveFormat"
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
      (v5/*: any*/),
      (v6/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setColorSchemeMutation",
    "selections": (v7/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v6/*: any*/),
      (v4/*: any*/),
      (v2/*: any*/),
      (v5/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setColorSchemeMutation",
    "selections": (v7/*: any*/)
  },
  "params": {
    "cacheID": "b88d64ee59f884612798564adf95fb56",
    "id": null,
    "metadata": {},
    "name": "setColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setColorSchemeMutation(\n  $subscription: String!\n  $session: String\n  $dataset: String!\n  $stages: BSONArray!\n  $colorScheme: ColorSchemeInput!\n  $saveToApp: Boolean!\n  $colorSchemeSaveFormat: ColorSchemeSaveFormat!\n) {\n  setColorScheme(subscription: $subscription, session: $session, dataset: $dataset, stages: $stages, colorScheme: $colorScheme, saveToApp: $saveToApp, colorSchemeSaveFormat: $colorSchemeSaveFormat)\n}\n"
  }
};
})();

(node as any).hash = "a4e0c4e7e13fb6f8c608287868181164";

export default node;
