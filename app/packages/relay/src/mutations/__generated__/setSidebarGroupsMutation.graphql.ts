/**
 * @generated SignedSource<<450e432e6169a85c4f242815d30e7284>>
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
  session?: string | null;
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
  "name": "session"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sidebarGroups"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "stages"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v5 = [
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
        "name": "session",
        "variableName": "session"
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
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSidebarGroupsMutation",
    "selections": (v5/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v4/*: any*/),
      (v1/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSidebarGroupsMutation",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "30ff3bb58850612d19abd31673645b9c",
    "id": null,
    "metadata": {},
    "name": "setSidebarGroupsMutation",
    "operationKind": "mutation",
    "text": "mutation setSidebarGroupsMutation(\n  $subscription: String!\n  $session: String\n  $dataset: String!\n  $stages: BSONArray!\n  $sidebarGroups: [SidebarGroupInput!]!\n) {\n  setSidebarGroups(subscription: $subscription, session: $session, dataset: $dataset, stages: $stages, sidebarGroups: $sidebarGroups)\n}\n"
  }
};
})();

(node as any).hash = "6edb503fe6431a2fd846189f046260d6";

export default node;
