/**
 * @generated SignedSource<<1716af1e39670510488bd2ecc95addb1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type teamSendUserInvitationMutation$variables = {
  email: string;
  role: UserRole;
};
export type teamSendUserInvitationMutation$data = {
  readonly sendUserInvitation: {
    readonly __typename: "Invitation";
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly id: string;
    readonly inviteeEmail: string;
    readonly inviteeRole: UserRole;
    readonly url: string;
  };
};
export type teamSendUserInvitationMutation = {
  response: teamSendUserInvitationMutation$data;
  variables: teamSendUserInvitationMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "email"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "role"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "email",
        "variableName": "email"
      },
      {
        "kind": "Variable",
        "name": "role",
        "variableName": "role"
      }
    ],
    "concreteType": "Invitation",
    "kind": "LinkedField",
    "name": "sendUserInvitation",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "__typename",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "createdAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "expiresAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "inviteeEmail",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "inviteeRole",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "url",
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
    "name": "teamSendUserInvitationMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "teamSendUserInvitationMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "bd4bca1af1abd4583d656ed62598dc04",
    "id": null,
    "metadata": {},
    "name": "teamSendUserInvitationMutation",
    "operationKind": "mutation",
    "text": "mutation teamSendUserInvitationMutation(\n  $email: String!\n  $role: UserRole!\n) {\n  sendUserInvitation(email: $email, role: $role) {\n    __typename\n    createdAt\n    expiresAt\n    id\n    inviteeEmail\n    inviteeRole\n    url\n  }\n}\n"
  }
};
})();

(node as any).hash = "2f70425ec69f5a68b4a990916a886434";

export default node;
