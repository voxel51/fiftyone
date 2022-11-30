/**
 * @generated SignedSource<<a81b40713d6115e0a370dca13c2469cd>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type saveViewMutation$variables = {
  color?: string | null;
  description?: string | null;
  session?: string | null;
  subscription: string;
  viewName: string;
};
export type saveViewMutation$data = {
  readonly saveView: {
    readonly color: string | null;
    readonly datasetId: string | null;
    readonly description: string | null;
    readonly name: string | null;
    readonly urlName: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  } | null;
};
export type saveViewMutation = {
  response: saveViewMutation$data;
  variables: saveViewMutation$variables;
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
  "name": "description"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewName"
},
v5 = [
  {
    "kind": "Variable",
    "name": "color",
    "variableName": "color"
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
  }
],
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "datasetId",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "urlName",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
};
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
    "name": "saveViewMutation",
    "selections": [
      {
        "alias": null,
        "args": (v5/*: any*/),
        "concreteType": "SavedView",
        "kind": "LinkedField",
        "name": "saveView",
        "plural": false,
        "selections": [
          (v6/*: any*/),
          (v7/*: any*/),
          (v8/*: any*/),
          (v9/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/)
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v3/*: any*/),
      (v2/*: any*/),
      (v4/*: any*/),
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "saveViewMutation",
    "selections": [
      {
        "alias": null,
        "args": (v5/*: any*/),
        "concreteType": "SavedView",
        "kind": "LinkedField",
        "name": "saveView",
        "plural": false,
        "selections": [
          (v6/*: any*/),
          (v7/*: any*/),
          (v8/*: any*/),
          (v9/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/),
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
    ]
  },
  "params": {
    "cacheID": "98ce1dde21755c454028108eb5dd11bd",
    "id": null,
    "metadata": {},
    "name": "saveViewMutation",
    "operationKind": "mutation",
    "text": "mutation saveViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $description: String = null\n  $color: String = null\n) {\n  saveView(subscription: $subscription, session: $session, viewName: $viewName, description: $description, color: $color) {\n    datasetId\n    name\n    urlName\n    description\n    color\n    viewStages\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "281ed6ef9395b713a1fb1914bc1fead4";

export default node;
