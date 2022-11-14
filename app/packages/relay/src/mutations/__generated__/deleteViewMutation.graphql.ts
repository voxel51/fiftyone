/**
 * @generated SignedSource<<c59301926efa11a68b66295988946cdb>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type deleteViewMutation$variables = {
  session?: string | null;
  subscription: string;
  viewName: string;
};
export type deleteViewMutation$data = {
  readonly deleteView: boolean;
};
export type deleteViewMutation = {
  response: deleteViewMutation$data;
  variables: deleteViewMutation$variables;
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
    "name": "deleteView",
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
    "name": "deleteViewMutation",
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
    "name": "deleteViewMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "8a2899c244390ad157763ee6fe2eb314",
    "id": null,
    "metadata": {},
    "name": "deleteViewMutation",
    "operationKind": "mutation",
    "text": "mutation deleteViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n) {\n  deleteView(subscription: $subscription, session: $session, viewName: $viewName)\n}\n"
  }
};
})();

(node as any).hash = "c51af0579dceaef577b61e4277003314";

export default node;
