/**
 * @generated SignedSource<<5f373db50b88edc3ad6cae631c4fceca>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type SidebarGroupInput = {
  expanded?: boolean | null;
  name: string;
  paths?: ReadonlyArray<string> | null;
};
export type setSidebarGroupsMutation$variables = {
  dataset: string;
  sidebarGroups: ReadonlyArray<SidebarGroupInput>;
  stages: Array;
  subscription: string;
};
export type setSidebarGroupsMutation$data = {
  readonly setSidebarGroups: boolean;
};
export type setSidebarGroupsMutation = {
  response: setSidebarGroupsMutation$data;
  variables: setSidebarGroupsMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sidebarGroups"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "stages"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "dataset",
        "variableName": "dataset"
      },
      {
        "kind": "Variable",
        "name": "sidebarGroups",
        "variableName": "sidebarGroups"
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
    "name": "setSidebarGroups",
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
    "name": "setSidebarGroupsMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v3/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSidebarGroupsMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "f588a5354111115f25b155c3911dff95",
    "id": null,
    "metadata": {},
    "name": "setSidebarGroupsMutation",
    "operationKind": "mutation",
    "text": "mutation setSidebarGroupsMutation(\n  $subscription: String!\n  $dataset: String!\n  $stages: BSONArray!\n  $sidebarGroups: [SidebarGroupInput!]!\n) {\n  setSidebarGroups(subscription: $subscription, dataset: $dataset, stages: $stages, sidebarGroups: $sidebarGroups)\n}\n"
  }
};
})();

(node as any).hash = "8b056d24f0ffc6bf7bfb31c43f27b171";

export default node;
