/**
 * @generated SignedSource<<ac7248f4894983ff0b6fd8dac8bfa8bc>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type createSavedViewMutation$variables = {
  color?: string | null;
  datasetName?: string | null;
  description?: string | null;
  session?: string | null;
  subscription: string;
  viewName: string;
  viewStages?: Array | null;
};
export type createSavedViewMutation$data = {
  readonly createSavedView: {
    readonly color: string | null;
    readonly createdAt: any | null;
    readonly datasetId: string | null;
    readonly description: string | null;
    readonly id: string | null;
    readonly name: string | null;
    readonly slug: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  } | null;
};
export type createSavedViewMutation = {
  response: createSavedViewMutation$data;
  variables: createSavedViewMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "color"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetName"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewName"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewStages"
},
v7 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "color",
        "variableName": "color"
      },
      {
        "kind": "Variable",
        "name": "datasetName",
        "variableName": "datasetName"
      },
      {
        "kind": "Variable",
        "name": "description",
        "variableName": "description"
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
      },
      {
        "kind": "Variable",
        "name": "viewStages",
        "variableName": "viewStages"
      }
    ],
    "concreteType": "SavedView",
    "kind": "LinkedField",
    "name": "createSavedView",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "datasetId",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "slug",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "color",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "viewStages",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "createdAt",
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
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "createSavedViewMutation",
    "selections": (v7/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v4/*: any*/),
      (v3/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "createSavedViewMutation",
    "selections": (v7/*: any*/)
  },
  "params": {
    "cacheID": "6fb874cc5e13f089e320464f5893370e",
    "id": null,
    "metadata": {},
    "name": "createSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation createSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $viewStages: BSONArray\n  $datasetName: String = null\n  $description: String = null\n  $color: String = null\n) {\n  createSavedView(subscription: $subscription, session: $session, viewName: $viewName, viewStages: $viewStages, datasetName: $datasetName, description: $description, color: $color) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "5fe8af39ab8589f64892785729950ef4";

export default node;
