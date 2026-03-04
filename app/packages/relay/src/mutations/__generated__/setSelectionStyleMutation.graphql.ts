/**
 * @generated SignedSource<<generated>>
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
    "cacheID": "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7",
    "id": null,
    "metadata": {},
    "name": "setSelectionStyleMutation",
    "operationKind": "mutation",
    "text": "mutation setSelectionStyleMutation(\n  $subscription: String!\n  $session: String\n  $style: JSON!\n) {\n  setSelectionStyle(subscription: $subscription, session: $session, style: $style)\n}\n"
  }
};
})();

(node as any).hash = "b2c3d4e5f6g7h8i9j0k1";

export default node;
