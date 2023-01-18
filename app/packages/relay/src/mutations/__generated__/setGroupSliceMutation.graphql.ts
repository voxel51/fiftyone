/**
 * @generated SignedSource<<d65841e678cc9636391bee909d50f98c>>
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
  viewName?: string | null;
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
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewName"
},
v5 = [
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
      },
      {
        "kind": "Variable",
        "name": "viewName",
        "variableName": "viewName"
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
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setGroupSliceMutation",
    "selections": (v5/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v1/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Operation",
    "name": "setGroupSliceMutation",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "a8129fbfe516833d7d5c233d2adddd97",
    "id": null,
    "metadata": {},
    "name": "setGroupSliceMutation",
    "operationKind": "mutation",
    "text": "mutation setGroupSliceMutation(\n  $subscription: String!\n  $session: String\n  $view: BSONArray!\n  $slice: String!\n  $viewName: String\n) {\n  setGroupSlice(subscription: $subscription, session: $session, view: $view, slice: $slice, viewName: $viewName) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "c240e69e37d0f3986af1569e5abd985f";

export default node;
