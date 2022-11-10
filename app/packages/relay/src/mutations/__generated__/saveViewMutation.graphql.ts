/**
 * @generated SignedSource<<401c3f42348e308264de958a4ee4abeb>>
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
  readonly saveView: boolean;
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
    "alias": null,
    "args": [
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
    "kind": "ScalarField",
    "name": "saveView",
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
    "name": "saveViewMutation",
    "selections": (v5/*: any*/),
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
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "3331977169fb00bb591681a9d23ff919",
    "id": null,
    "metadata": {},
    "name": "saveViewMutation",
    "operationKind": "mutation",
    "text": "mutation saveViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $description: String = null\n  $color: String = null\n) {\n  saveView(subscription: $subscription, session: $session, viewName: $viewName, description: $description, color: $color)\n}\n"
  }
};
})();

(node as any).hash = "c192b13195154a528b4a80292f44374a";

export default node;
