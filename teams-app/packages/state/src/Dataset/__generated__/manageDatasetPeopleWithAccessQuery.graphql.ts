/**
 * @generated SignedSource<<acb09bcafde6cf35dadb1e46eb516cce>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type manageDatasetPeopleWithAccessQuery$variables = {
  identifier: string;
  page: number;
  pageSize: number;
};
export type manageDatasetPeopleWithAccessQuery$data = {
  readonly dataset: {
    readonly usersPage: {
      readonly nodes: ReadonlyArray<{
        readonly activePermission: DatasetPermission;
        readonly user: {
          readonly email: string;
          readonly id: string;
          readonly name: string;
          readonly picture: string | null;
          readonly role: UserRole;
        };
        readonly userPermission: DatasetPermission | null;
      }>;
      readonly pageTotal: number;
    };
  } | null;
};
export type manageDatasetPeopleWithAccessQuery = {
  response: manageDatasetPeopleWithAccessQuery$data;
  variables: manageDatasetPeopleWithAccessQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "identifier"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "page"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "pageSize"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "identifier",
        "variableName": "identifier"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "dataset",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Literal",
            "name": "filter",
            "value": {
              "userPermission": {
                "ne": null
              }
            }
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
          }
        ],
        "concreteType": "DatasetUserPage",
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
            "concreteType": "DatasetUser",
            "kind": "LinkedField",
            "name": "nodes",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "User",
                "kind": "LinkedField",
                "name": "user",
                "plural": false,
                "selections": [
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
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "userPermission",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "activePermission",
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "manageDatasetPeopleWithAccessQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetPeopleWithAccessQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "cf13e50eba95b0e85ed82c8f6c43a36c",
    "id": null,
    "metadata": {},
    "name": "manageDatasetPeopleWithAccessQuery",
    "operationKind": "query",
    "text": "query manageDatasetPeopleWithAccessQuery(\n  $identifier: String!\n  $page: Int!\n  $pageSize: Int!\n) {\n  dataset(identifier: $identifier) {\n    usersPage(page: $page, pageSize: $pageSize, filter: {userPermission: {ne: null}}) {\n      pageTotal\n      nodes {\n        user {\n          email\n          id\n          name\n          role\n          picture\n        }\n        userPermission\n        activePermission\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "60901c4ccd2892849bf1b0dae3e32d0f";

export default node;
