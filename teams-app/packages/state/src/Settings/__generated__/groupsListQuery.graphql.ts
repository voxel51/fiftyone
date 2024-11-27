/**
 * @generated SignedSource<<46a5f8c49e13e01cd373970c2f7856b9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type OrderInputDirection = "ASC" | "DESC" | "%future added value";
export type UserGroupOrderFields = "createdAt" | "name" | "slug" | "%future added value";
export type UserGroupSearchFields = "id" | "name" | "slug" | "user" | "%future added value";
export type UserGroupSearchFieldsSearch = {
  fields: ReadonlyArray<UserGroupSearchFields>;
  term: string;
};
export type UserGroupOrderFieldsOrder = {
  direction: OrderInputDirection;
  field: UserGroupOrderFields;
};
export type groupsListQuery$variables = {
  order?: UserGroupOrderFieldsOrder | null;
  page: number;
  pageSize: number;
  search?: UserGroupSearchFieldsSearch | null;
};
export type groupsListQuery$data = {
  readonly userGroupsPage: {
    readonly nodeTotal: number;
    readonly nodes: ReadonlyArray<{
      readonly createdAt: string;
      readonly description: string | null;
      readonly id: string;
      readonly name: string;
      readonly slug: string;
      readonly users: ReadonlyArray<{
        readonly email: string;
        readonly id: string;
        readonly name: string;
        readonly picture: string | null;
      }>;
      readonly usersCount: number;
    }>;
    readonly pageTotal: number;
  };
};
export type groupsListQuery = {
  response: groupsListQuery$data;
  variables: groupsListQuery$variables;
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
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v6 = [
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
    "concreteType": "UserGroupPage",
    "kind": "LinkedField",
    "name": "userGroupsPage",
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
        "concreteType": "UserGroup",
        "kind": "LinkedField",
        "name": "nodes",
        "plural": true,
        "selections": [
          (v4/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "slug",
            "storageKey": null
          },
          (v5/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "description",
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
            "name": "usersCount",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "users",
            "plural": true,
            "selections": [
              (v4/*: any*/),
              (v5/*: any*/),
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
                "name": "picture",
                "storageKey": null
              }
            ],
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
    "name": "groupsListQuery",
    "selections": (v6/*: any*/),
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
    "name": "groupsListQuery",
    "selections": (v6/*: any*/)
  },
  "params": {
    "cacheID": "5e7127223a70e92204bc0b51b35bfb54",
    "id": null,
    "metadata": {},
    "name": "groupsListQuery",
    "operationKind": "query",
    "text": "query groupsListQuery(\n  $search: UserGroupSearchFieldsSearch\n  $page: Int!\n  $pageSize: Int!\n  $order: UserGroupOrderFieldsOrder\n) {\n  userGroupsPage(search: $search, page: $page, pageSize: $pageSize, order: $order) {\n    pageTotal\n    nodeTotal\n    nodes {\n      id\n      slug\n      name\n      description\n      createdAt\n      usersCount\n      users {\n        id\n        name\n        email\n        picture\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "11df0dfd7dacfd2cc1d1720b3a7f8ad7";

export default node;
