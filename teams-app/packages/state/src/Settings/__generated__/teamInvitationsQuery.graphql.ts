/**
 * @generated SignedSource<<ba1ed0f235818bdb19c6ce8aca382d60>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type teamInvitationsQuery$variables = {};
export type teamInvitationsQuery$data = {
  readonly invitations: ReadonlyArray<{
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly id: string;
    readonly inviteeEmail: string;
    readonly inviteeRole: UserRole;
    readonly url: string;
  }>;
};
export type teamInvitationsQuery = {
  response: teamInvitationsQuery$data;
  variables: teamInvitationsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "Invitation",
    "kind": "LinkedField",
    "name": "invitations",
    "plural": true,
    "selections": [
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
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "teamInvitationsQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "teamInvitationsQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "d9671021aac2ae62fbdbc3618636d4b8",
    "id": null,
    "metadata": {},
    "name": "teamInvitationsQuery",
    "operationKind": "query",
    "text": "query teamInvitationsQuery {\n  invitations {\n    createdAt\n    expiresAt\n    id\n    inviteeEmail\n    inviteeRole\n    url\n  }\n}\n"
  }
};
})();

(node as any).hash = "44182b376c579085b770e0393b7990a6";

export default node;