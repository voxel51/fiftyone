/**
 * @generated SignedSource<<21e1737c2b81b672b44e1d9d9e71197c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setSelectionStyleMutation$variables = {
  session?: string | null;
  style: object;
  subscription: string;
};
export type setSelectionStyleMutation$data = {
  readonly setSelectionStyle: boolean;
};
export type setSelectionStyleMutation = {
  response: setSelectionStyleMutation$data;
  variables: setSelectionStyleMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "style"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v3 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "session",
        "variableName": "session"
      },
      {
        "kind": "Variable",
        "name": "style",
        "variableName": "style"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setSelectionStyle",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSelectionStyleMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSelectionStyleMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "6a8621dc7e1f61e1aafd6e6cf83b1e75",
    "id": null,
    "metadata": {},
    "name": "setSelectionStyleMutation",
    "operationKind": "mutation",
    "text": "mutation setSelectionStyleMutation(\n  $subscription: String!\n  $session: String\n  $style: JSON!\n) {\n  setSelectionStyle(subscription: $subscription, session: $session, style: $style)\n}\n"
  }
};
})();

(node as any).hash = "14dc523b49ed9a262b6e44ec5539fb3b";

export default node;
