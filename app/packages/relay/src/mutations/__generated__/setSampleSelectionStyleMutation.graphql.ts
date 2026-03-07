/**
 * @generated SignedSource<<c61a4e0a3765beea310523c67b0401ee>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setSampleSelectionStyleMutation$variables = {
  session?: string | null;
  style: object;
  subscription: string;
};
export type setSampleSelectionStyleMutation$data = {
  readonly setSampleSelectionStyle: boolean;
};
export type setSampleSelectionStyleMutation = {
  response: setSampleSelectionStyleMutation$data;
  variables: setSampleSelectionStyleMutation$variables;
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
    "name": "setSampleSelectionStyle",
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
    "name": "setSampleSelectionStyleMutation",
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
    "name": "setSampleSelectionStyleMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "cdcf823051a6535f72568d0a3142d85e",
    "id": null,
    "metadata": {},
    "name": "setSampleSelectionStyleMutation",
    "operationKind": "mutation",
    "text": "mutation setSampleSelectionStyleMutation(\n  $subscription: String!\n  $session: String\n  $style: JSON!\n) {\n  setSampleSelectionStyle(subscription: $subscription, session: $session, style: $style)\n}\n"
  }
};
})();

(node as any).hash = "63b00868c5d650e29c11cbdf6c83747c";

export default node;
