/**
 * @generated SignedSource<<3e7b653d9e92c627be99b0a7d5408b0a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type teamSetUserRoleMutation$variables = {
  role: UserRole;
  userId: string;
};
export type teamSetUserRoleMutation$data = {
  readonly setUserRole: {
    readonly id: string;
    readonly name: string;
    readonly role: UserRole;
  };
};
export type teamSetUserRoleMutation = {
  response: teamSetUserRoleMutation$data;
  variables: teamSetUserRoleMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "role"
  },
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
        "name": "role",
        "variableName": "role"
      },
      {
        "kind": "Variable",
        "name": "userId",
        "variableName": "userId"
      }
    ],
    "concreteType": "User",
    "kind": "LinkedField",
    "name": "setUserRole",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "role",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "teamSetUserRoleMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "teamSetUserRoleMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "a1da4e9a4a6f07b310d3fa715e9c0bda",
    "id": null,
    "metadata": {},
    "name": "teamSetUserRoleMutation",
    "operationKind": "mutation",
    "text": "mutation teamSetUserRoleMutation(\n  $role: UserRole!\n  $userId: String!\n) {\n  setUserRole(role: $role, userId: $userId) {\n    name\n    role\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "4a6a7f372133e8732513fff1effcd1fa";

export default node;
