/**
 * @generated SignedSource<<95e362430a732d949652ef4217c569bc>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type setSampleSelectionStyleMutation$variables = {
  session?: string | null | undefined;
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
      (v0/*:: as any*/),
      (v1/*:: as any*/),
      (v2/*:: as any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSampleSelectionStyleMutation",
    "selections": (v3/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*:: as any*/),
      (v0/*:: as any*/),
      (v1/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "setSampleSelectionStyleMutation",
    "selections": (v3/*:: as any*/)
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
