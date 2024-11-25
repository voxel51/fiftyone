/**
 * @generated SignedSource<<6046bca8d67b74419e994ffca3ac4079>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type teamRemoveUserMutation$variables = {
  userId: string;
};
export type teamRemoveUserMutation$data = {
  readonly removeUser: any | null;
};
export type teamRemoveUserMutation = {
  response: teamRemoveUserMutation$data;
  variables: teamRemoveUserMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "userId"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "userId",
        "variableName": "userId"
      }
    ],
    "kind": "ScalarField",
    "name": "removeUser",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "teamRemoveUserMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "teamRemoveUserMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "edb355fb81d768cc696b7b3588e43033",
    "id": null,
    "metadata": {},
    "name": "teamRemoveUserMutation",
    "operationKind": "mutation",
    "text": "mutation teamRemoveUserMutation(\n  $userId: String!\n) {\n  removeUser(userId: $userId)\n}\n"
  }
};
})();

(node as any).hash = "edffe79818091f109fb51633d62be30a";

export default node;
