/**
 * @generated SignedSource<<d0fca6b6dd0f57793fd954620e795d80>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setGroupSliceMutation$variables = {
  session?: string | null;
  slice?: string | null;
  subscription: string;
};
export type setGroupSliceMutation$data = {
  readonly setGroupSlice: boolean;
};
export type setGroupSliceMutation = {
  response: setGroupSliceMutation$data;
  variables: setGroupSliceMutation$variables;
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
  "name": "slice"
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
        "name": "slice",
        "variableName": "slice"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setGroupSlice",
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
    "name": "setGroupSliceMutation",
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
    "name": "setGroupSliceMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "a3abb5881d033e39d98ea503d6ad3655",
    "id": null,
    "metadata": {},
    "name": "setGroupSliceMutation",
    "operationKind": "mutation",
    "text": "mutation setGroupSliceMutation(\n  $subscription: String!\n  $session: String\n  $slice: String\n) {\n  setGroupSlice(subscription: $subscription, session: $session, slice: $slice)\n}\n"
  }
};
})();

(node as any).hash = "7e249f4083da309f5bfa70e3a068e6aa";

export default node;
