/**
 * @generated SignedSource<<82d616c0dd9f7c5d87e54676eecaf1d0>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type setSpacesMutation$variables = {
  session?: string | null | undefined;
  spaces: object;
  subscription: string;
};
export type setSpacesMutation$data = {
  readonly setSpaces: boolean;
};
export type setSpacesMutation = {
  response: setSpacesMutation$data;
  variables: setSpacesMutation$variables;
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
  "name": "spaces"
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
        "name": "spaces",
        "variableName": "spaces"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setSpaces",
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
    "name": "setSpacesMutation",
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
    "name": "setSpacesMutation",
    "selections": (v3/*:: as any*/)
  },
  "params": {
    "cacheID": "5025127b4a8a2c9867ca6f919c8c0ec5",
    "id": null,
    "metadata": {},
    "name": "setSpacesMutation",
    "operationKind": "mutation",
    "text": "mutation setSpacesMutation(\n  $subscription: String!\n  $session: String\n  $spaces: BSON!\n) {\n  setSpaces(subscription: $subscription, session: $session, spaces: $spaces)\n}\n"
  }
};
})();

(node as any).hash = "023e7cf359ce2132e896ff473e33b9f9";

export default node;
