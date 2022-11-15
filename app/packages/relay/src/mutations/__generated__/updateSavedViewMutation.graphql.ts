/**
 * @generated SignedSource<<869e63143419612e962aaa0c1381d24d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type SavedViewInfo = {
  color?: string | null;
  description?: string | null;
  name?: string | null;
  viewStages?: Array | null;
};
export type updateSavedViewMutation$variables = {
  session?: string | null;
  subscription: string;
  updatedInfo: SavedViewInfo;
  viewName: string;
};
export type updateSavedViewMutation$data = {
  readonly updateSavedView: boolean;
};
export type updateSavedViewMutation = {
  response: updateSavedViewMutation$data;
  variables: updateSavedViewMutation$variables;
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
  "name": "subscription"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "updatedInfo"
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
        "name": "updatedInfo",
        "variableName": "updatedInfo"
      },
      {
        "kind": "Variable",
        "name": "viewName",
        "variableName": "viewName"
      }
    ],
    "kind": "ScalarField",
    "name": "updateSavedView",
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
    "name": "updateSavedViewMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "updateSavedViewMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "ce97c06ede5c2066bc269bafd7a7c179",
    "id": null,
    "metadata": {},
    "name": "updateSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation updateSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $updatedInfo: SavedViewInfo!\n) {\n  updateSavedView(subscription: $subscription, session: $session, viewName: $viewName, updatedInfo: $updatedInfo)\n}\n"
  }
};
})();

(node as any).hash = "4dc49eb8f8af7fc013025a65bdf9bf75";

export default node;
