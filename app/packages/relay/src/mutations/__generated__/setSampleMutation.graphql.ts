/**
 * @generated SignedSource<<f3939a0b3b7b55d1a5c94f6a4c30aa2c>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type setSampleMutation$variables = {
  groupId?: string | null | undefined;
  id?: string | null | undefined;
  session?: string | null | undefined;
  subscription: string;
};
export type setSampleMutation$data = {
  readonly setSample: boolean;
};
export type setSampleMutation = {
  response: setSampleMutation$data;
  variables: setSampleMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "groupId"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "id"
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
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "groupId",
        "variableName": "groupId"
      },
      {
        "kind": "Variable",
        "name": "id",
        "variableName": "id"
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
      }
    ],
    "kind": "ScalarField",
    "name": "setSample",
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
    "name": "setSampleMutation",
    "selections": (v4/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v3/*:: as any*/),
      (v2/*:: as any*/),
      (v0/*:: as any*/),
      (v1/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "setSampleMutation",
    "selections": (v4/*:: as any*/)
  },
  "params": {
    "cacheID": "afa49913ba9c5d963bfc59671f856e56",
    "id": null,
    "metadata": {},
    "name": "setSampleMutation",
    "operationKind": "mutation",
    "text": "mutation setSampleMutation(\n  $subscription: String!\n  $session: String\n  $groupId: String\n  $id: String\n) {\n  setSample(subscription: $subscription, session: $session, groupId: $groupId, id: $id)\n}\n"
  }
};
})();

(node as any).hash = "2b5302738bd9cc6eae0fcbbf5bf703e7";

export default node;
