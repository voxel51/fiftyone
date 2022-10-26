/**
 * @generated SignedSource<<110fad434e453ab80f0414deb9a7b67c>>
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
v3 = [
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
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSidebarGroupsMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSidebarGroupsMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "49223211f87d09916d692a5b86c73e55",
    "id": null,
    "metadata": {},
    "name": "setSidebarGroupsMutation",
    "operationKind": "mutation",
    "text": "mutation setSidebarGroupsMutation(\n  $dataset: String!\n  $stages: BSONArray!\n  $sidebarGroups: [SidebarGroupInput!]!\n) {\n  setSidebarGroups(dataset: $dataset, stages: $stages, sidebarGroups: $sidebarGroups)\n}\n"
  }
};
})();

(node as any).hash = "22c6d57fcd3c020c73b93c7b6c8897e9";

export default node;
