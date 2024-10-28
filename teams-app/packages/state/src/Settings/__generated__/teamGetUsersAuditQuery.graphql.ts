/**
 * @generated SignedSource<<21188115ba94baaf88374aacfdf63b8d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type teamGetUsersAuditQuery$variables = {};
export type teamGetUsersAuditQuery$data = {
  readonly usersAudit: {
    readonly collaborators: {
      readonly current: number;
      readonly remaining: number;
    } | null;
    readonly guests: {
      readonly current: number;
      readonly remaining: number;
    };
    readonly users: {
      readonly current: number;
      readonly remaining: number;
    };
  } | null;
};
export type teamGetUsersAuditQuery = {
  response: teamGetUsersAuditQuery$data;
  variables: teamGetUsersAuditQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "current",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "remaining",
    "storageKey": null
  }
],
v1 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "UsersAudit",
    "kind": "LinkedField",
    "name": "usersAudit",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "AuditResult",
        "kind": "LinkedField",
        "name": "users",
        "plural": false,
        "selections": (v0/*: any*/),
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "AuditResult",
        "kind": "LinkedField",
        "name": "collaborators",
        "plural": false,
        "selections": (v0/*: any*/),
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "AuditResult",
        "kind": "LinkedField",
        "name": "guests",
        "plural": false,
        "selections": (v0/*: any*/),
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
    "name": "teamGetUsersAuditQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "teamGetUsersAuditQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "e5117655cc124fa325ff7fb7044a596b",
    "id": null,
    "metadata": {},
    "name": "teamGetUsersAuditQuery",
    "operationKind": "query",
    "text": "query teamGetUsersAuditQuery {\n  usersAudit {\n    users {\n      current\n      remaining\n    }\n    collaborators {\n      current\n      remaining\n    }\n    guests {\n      current\n      remaining\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "f94c3ca317995f0254c3890535c4d1ff";

export default node;
