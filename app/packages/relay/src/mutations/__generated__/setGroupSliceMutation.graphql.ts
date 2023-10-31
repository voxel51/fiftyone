/**
 * @generated SignedSource<<236d773230a4f3ec9249912bea38a3e9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setGroupSliceMutation$variables = {
  session?: string | null;
  slice: string;
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
    "cacheID": "cd795af82a8ea3c244df156ed40c5953",
    "id": null,
    "metadata": {},
    "name": "setGroupSliceMutation",
    "operationKind": "mutation",
    "text": "mutation setGroupSliceMutation(\n  $subscription: String!\n  $session: String\n  $slice: String!\n) {\n  setGroupSlice(subscription: $subscription, session: $session, slice: $slice)\n}\n"
  }
};
})();

(node as any).hash = "24425c6e115fd99546cd78204599b91c";

export default node;
