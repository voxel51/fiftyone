/**
 * @generated SignedSource<<74d626b47db10bf8fe56d811cad7e41f>>
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
  view: Array;
};
export type setGroupSliceMutation$data = {
  readonly setGroupSlice: {
    readonly id: string;
  };
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
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v4 = [
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
      },
      {
        "kind": "Variable",
        "name": "view",
        "variableName": "view"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "setGroupSlice",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      }
    ],
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
    "name": "setGroupSliceMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setGroupSliceMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "bf10fdcc9a9e3441643c157812f905a2",
    "id": null,
    "metadata": {},
    "name": "setGroupSliceMutation",
    "operationKind": "mutation",
    "text": "mutation setGroupSliceMutation(\n  $subscription: String!\n  $session: String\n  $view: BSONArray!\n  $slice: String!\n) {\n  setGroupSlice(subscription: $subscription, session: $session, view: $view, slice: $slice) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "88072c125d8981795598ed623e1609eb";

export default node;
