/**
 * @generated SignedSource<<652d1003900f3c83de348fd576183e95>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setSpacesMutation$variables = {
  session?: string | null;
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
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSpacesMutation",
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
    "name": "setSpacesMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "64996b78a63925df2a6f495c43eebde7",
    "id": null,
    "metadata": {},
    "name": "setSpacesMutation",
    "operationKind": "mutation",
    "text": "mutation setSpacesMutation(\n  $subscription: String!\n  $session: String\n  $spaces: JSON!\n) {\n  setSpaces(subscription: $subscription, session: $session, spaces: $spaces)\n}\n"
  }
};
})();

(node as any).hash = "045a66803c4f42a41d07b2e0368898cd";

export default node;
