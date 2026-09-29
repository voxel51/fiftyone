/**
 * @generated SignedSource<<799546693a6b3d231a5c215defc096f9>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type setFieldVisibilityStageMutation$variables = {
  session?: string | null | undefined;
  stage?: object | null | undefined;
  subscription: string;
};
export type setFieldVisibilityStageMutation$data = {
  readonly setFieldVisibilityStage: boolean;
};
export type setFieldVisibilityStageMutation = {
  response: setFieldVisibilityStageMutation$data;
  variables: setFieldVisibilityStageMutation$variables;
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
  "name": "stage"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
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
        "name": "stage",
        "variableName": "stage"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setFieldVisibilityStage",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*:: as any*/),
      (v1/*:: as any*/),
      (v2/*:: as any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setFieldVisibilityStageMutation",
    "selections": (v3/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*:: as any*/),
      (v0/*:: as any*/),
      (v1/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "setFieldVisibilityStageMutation",
    "selections": (v3/*:: as any*/)
  },
  "params": {
    "cacheID": "9825597b80da566f3836d4f7e93d3f3e",
    "id": null,
    "metadata": {},
    "name": "setFieldVisibilityStageMutation",
    "operationKind": "mutation",
    "text": "mutation setFieldVisibilityStageMutation(\n  $subscription: String!\n  $session: String\n  $stage: BSON\n) {\n  setFieldVisibilityStage(subscription: $subscription, session: $session, stage: $stage)\n}\n"
  }
};
})();

(node as any).hash = "27b37142a47f9463d0245e634eada360";

export default node;
