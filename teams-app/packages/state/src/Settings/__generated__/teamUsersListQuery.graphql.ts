/**
 * @generated SignedSource<<651c61c5d266f32882f0eb44b3ea4b02>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type OrderInputDirection = "ASC" | "DESC" | "%future added value";
export type UserOrderFields = "name" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type UserSearchFields = "email" | "id" | "name" | "%future added value";
export type UserSearchFieldsSearch = {
  fields: ReadonlyArray<UserSearchFields>;
  term: string;
};
export type UserOrderFieldsOrder = {
  direction: OrderInputDirection;
  field: UserOrderFields;
};
export type teamUsersListQuery$variables = {
  order?: UserOrderFieldsOrder | null;
  page: number;
  pageSize: number;
  search?: UserSearchFieldsSearch | null;
};
export type teamUsersListQuery$data = {
  readonly usersPage: {
    readonly nodeTotal: number;
    readonly nodes: ReadonlyArray<{
      readonly datasetsCount: number;
      readonly email: string;
      readonly id: string;
      readonly name: string;
      readonly picture: string | null;
      readonly role: UserRole;
    }>;
    readonly pageTotal: number;
  };
};
export type teamUsersListQuery = {
  response: teamUsersListQuery$data;
  variables: teamUsersListQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "order"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "page"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pageSize"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "search"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "order",
        "variableName": "order"
      },
      {
        "kind": "Variable",
        "name": "page",
        "variableName": "page"
      },
      {
        "kind": "Variable",
        "name": "pageSize",
        "variableName": "pageSize"
      },
      {
        "kind": "Variable",
        "name": "search",
        "variableName": "search"
      }
    ],
    "concreteType": "UserPage",
    "kind": "LinkedField",
    "name": "usersPage",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "pageTotal",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "nodeTotal",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "nodes",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "datasetsCount",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "email",
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
            "name": "picture",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "teamUsersListQuery",
    "selections": (v4/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v3/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "teamUsersListQuery",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "d430d519c2bfe66008ef5e81219e1c9e",
    "id": null,
    "metadata": {},
    "name": "teamUsersListQuery",
    "operationKind": "query",
    "text": "query teamUsersListQuery(\n  $search: UserSearchFieldsSearch\n  $page: Int!\n  $pageSize: Int!\n  $order: UserOrderFieldsOrder\n) {\n  usersPage(search: $search, page: $page, pageSize: $pageSize, order: $order) {\n    pageTotal\n    nodeTotal\n    nodes {\n      datasetsCount\n      email\n      id\n      name\n      role\n      picture\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "0f7a7ec021c90e41c39f2c1e1ee9c646";

export default node;
