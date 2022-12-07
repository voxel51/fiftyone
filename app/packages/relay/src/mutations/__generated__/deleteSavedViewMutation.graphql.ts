/**
 * @generated SignedSource<<1b68f3b88513f1f7376ea005d7eba477>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type deleteSavedViewMutation$variables = {
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
  "name": "viewName"
},
v3 = [
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
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "deleteSavedViewMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "deleteSavedViewMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "b54762d8ae944198ff38fab074ead92f",
    "id": null,
    "metadata": {},
    "name": "deleteSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation deleteSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n) {\n  deleteSavedView(subscription: $subscription, session: $session, viewName: $viewName)\n}\n"
  }
};
})();

(node as any).hash = "c60fe2d35fc14098d7b033793e78a7a4";

export default node;
