/**
 * @generated SignedSource<<92b4ae0159bdd91cff3b805b6ad94093>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setDatasetMutation$variables = {
  name?: string | null;
  session?: string | null;
  subscription: string;
  viewName?: string | null;
};
export type setDatasetMutation$data = {
  readonly setDataset: boolean;
};
export type setDatasetMutation = {
  response: setDatasetMutation$data;
  variables: setDatasetMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewName"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "name"
      },
      {
        "kind": "Variable",
        "name": "session",
        "variableName": "session"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      },
      {
        "kind": "Variable",
        "name": "viewName",
        "variableName": "viewName"
      }
    ],
    "kind": "ScalarField",
    "name": "setDataset",
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
    "name": "setDatasetMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "setDatasetMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "b8246404b2379055b0649609c9052b2b",
    "id": null,
    "metadata": {},
    "name": "setDatasetMutation",
    "operationKind": "mutation",
    "text": "mutation setDatasetMutation(\n  $subscription: String!\n  $session: String\n  $name: String\n  $viewName: String\n) {\n  setDataset(subscription: $subscription, session: $session, name: $name, viewName: $viewName)\n}\n"
  }
};
})();

(node as any).hash = "df5142387370bffa4344b8eb530e05f7";

export default node;
