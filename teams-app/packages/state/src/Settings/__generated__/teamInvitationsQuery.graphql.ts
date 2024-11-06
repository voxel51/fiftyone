/**
 * @generated SignedSource<<24d7c5c6d6a0fa436ec8318f954c0d89>>
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
    readonly emailSendAttemptedAt: string;
    readonly emailSentAt: string;
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
        "name": "emailSendAttemptedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "emailSentAt",
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
    "cacheID": "68bf19b24dc80ed1c267a78e7de0f65a",
    "id": null,
    "metadata": {},
    "name": "teamInvitationsQuery",
    "operationKind": "query",
    "text": "query teamInvitationsQuery {\n  invitations {\n    createdAt\n    emailSendAttemptedAt\n    emailSentAt\n    expiresAt\n    id\n    inviteeEmail\n    inviteeRole\n    url\n  }\n}\n"
  }
};
})();

(node as any).hash = "4c82bf5f1e5f7279f491d1116c1480f6";

export default node;
