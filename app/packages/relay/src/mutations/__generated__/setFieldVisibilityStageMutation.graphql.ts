/**
 * @generated SignedSource<<030c363b6286e739c631c4b28feb43a2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setFieldVisibilityStageMutation$variables = {
  session?: string | null;
  stage?: object | null;
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
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setFieldVisibilityStageMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setFieldVisibilityStageMutation",
    "selections": (v3/*: any*/)
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
