/**
 * @generated SignedSource<<9c817d0133099b00832aee363281eeb0>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type deleteSavedViewMutation$variables = {
  datasetName?: string | null | undefined;
  session?: string | null | undefined;
  subscription: string;
  viewName: string;
};
export type deleteSavedViewMutation$data = {
  readonly deleteSavedView: string | null | undefined;
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
      (v0/*:: as any*/),
      (v1/*:: as any*/),
      (v2/*:: as any*/),
      (v3/*:: as any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "deleteSavedViewMutation",
    "selections": (v4/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*:: as any*/),
      (v1/*:: as any*/),
      (v3/*:: as any*/),
      (v0/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "deleteSavedViewMutation",
    "selections": (v4/*:: as any*/)
  },
  "params": {
    "cacheID": "4ba96f75c5f2f30f1824a2aaf49fd7eb",
    "id": null,
    "metadata": {},
    "name": "deleteSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation deleteSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $datasetName: String\n) {\n  deleteSavedView(subscription: $subscription, session: $session, viewName: $viewName, datasetName: $datasetName)\n}\n"
  }
};
})();

(node as any).hash = "d25e17a369c05534c3d06f3319bef86c";

export default node;
