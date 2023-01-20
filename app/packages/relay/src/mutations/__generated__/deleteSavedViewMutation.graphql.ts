/**
 * @generated SignedSource<<ed51bd23fb0317282e5328d2b8fd3b04>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type deleteSavedViewMutation$variables = {
  datasetName: string;
  session?: string | null;
  subscription: string;
  viewName: string;
};
export type deleteSavedViewMutation$data = {
  readonly deleteSavedView: string | null;
};
export type deleteSavedViewMutation = {
  response: deleteSavedViewMutation$data;
  variables: deleteSavedViewMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetName"
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
        "name": "datasetName",
        "variableName": "datasetName"
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
    "name": "deleteSavedView",
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
    "name": "deleteSavedViewMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v3/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "deleteSavedViewMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "230b61e300bebfcd2070297268774198",
    "id": null,
    "metadata": {},
    "name": "deleteSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation deleteSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $datasetName: String!\n) {\n  deleteSavedView(subscription: $subscription, session: $session, viewName: $viewName, datasetName: $datasetName)\n}\n"
  }
};
})();

(node as any).hash = "84d78454364f1727214a88869db57d4f";

export default node;
