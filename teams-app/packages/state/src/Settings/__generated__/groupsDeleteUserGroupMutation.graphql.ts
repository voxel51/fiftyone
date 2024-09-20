/**
 * @generated SignedSource<<279383618c03f7d56ed6afd3b1765131>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type groupsDeleteUserGroupMutation$variables = {
  id: string;
};
export type groupsDeleteUserGroupMutation$data = {
  readonly deleteUserGroup: any | null;
};
export type groupsDeleteUserGroupMutation = {
  response: groupsDeleteUserGroupMutation$data;
  variables: groupsDeleteUserGroupMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "id"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "userGroupIdentifier",
        "variableName": "id"
      }
    ],
    "kind": "ScalarField",
    "name": "deleteUserGroup",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "groupsDeleteUserGroupMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "groupsDeleteUserGroupMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "7cffe386108c4816b2b4b8928f57d22b",
    "id": null,
    "metadata": {},
    "name": "groupsDeleteUserGroupMutation",
    "operationKind": "mutation",
    "text": "mutation groupsDeleteUserGroupMutation(\n  $id: String!\n) {\n  deleteUserGroup(userGroupIdentifier: $id)\n}\n"
  }
};
})();

(node as any).hash = "54e971f41512b37c122f126adb4327f1";

export default node;
