/**
 * @generated SignedSource<<29e4f6bfef073e45ef8392b0ae3ab5d8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type manageDatasetGetAccessPageQuery$variables = {
  datasetIdentifier: string;
  page: number;
  pageSize: number;
};
export type manageDatasetGetAccessPageQuery$data = {
  readonly dataset: {
    readonly accessPage: {
      readonly next: number | null;
      readonly nodeTotal: number;
      readonly nodes: ReadonlyArray<{
        readonly __typename: "DatasetUser";
        readonly activePermission: DatasetPermission;
        readonly email: string;
        readonly name: string;
        readonly picture: string | null;
        readonly role: UserRole;
        readonly userId: string;
        readonly userPermission: DatasetPermission | null;
      } | {
        readonly __typename: "DatasetUserGroup";
        readonly description: string | null;
        readonly groupId: string;
        readonly name: string;
        readonly permission: DatasetPermission | null;
        readonly slug: string;
      } | {
        // This will never be '%other', but we need some
        // value in case none of the concrete values match.
        readonly __typename: "%other";
      }>;
      readonly page: number | null;
      readonly pageSize: number;
      readonly pageTotal: number;
      readonly prev: number | null;
    };
  } | null;
};
export type manageDatasetGetAccessPageQuery = {
  response: manageDatasetGetAccessPageQuery$data;
  variables: manageDatasetGetAccessPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "datasetIdentifier"
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
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "identifier",
        "variableName": "datasetIdentifier"
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
            "kind": "Literal",
            "name": "userFilter",
            "value": {
              "userPermission": {
                "ne": null
              }
            }
          }
        ],
        "concreteType": "DatasetAccessPage",
        "kind": "LinkedField",
        "name": "accessPage",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": null,
            "kind": "LinkedField",
            "name": "nodes",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "__typename",
                "storageKey": null
              },
              {
                "kind": "InlineFragment",
                "selections": [
                  {
                    "alias": "userId",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "id",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "email",
                    "storageKey": null
                  },
                  (v1/*: any*/),
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
                "type": "DatasetUser",
                "abstractKey": null
              },
              {
                "kind": "InlineFragment",
                "selections": [
                  {
                    "alias": "groupId",
                    "args": null,
                    "kind": "ScalarField",
                    "name": "id",
                    "storageKey": null
                  },
                  (v1/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "slug",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "permission",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "description",
                    "storageKey": null
                  }
                ],
                "type": "DatasetUserGroup",
                "abstractKey": null
              }
            ],
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
            "kind": "ScalarField",
            "name": "next",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "page",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "pageSize",
            "storageKey": null
          },
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
            "name": "prev",
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
    "name": "manageDatasetGetAccessPageQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetGetAccessPageQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "4288e8bf94bae3c1af407b234d53cb0d",
    "id": null,
    "metadata": {},
    "name": "manageDatasetGetAccessPageQuery",
    "operationKind": "query",
    "text": "query manageDatasetGetAccessPageQuery(\n  $datasetIdentifier: String!\n  $page: Int!\n  $pageSize: Int!\n) {\n  dataset(identifier: $datasetIdentifier) {\n    accessPage(userFilter: {userPermission: {ne: null}}, page: $page, pageSize: $pageSize) {\n      nodes {\n        __typename\n        ... on DatasetUser {\n          userId: id\n          email\n          name\n          role\n          picture\n          userPermission\n          activePermission\n        }\n        ... on DatasetUserGroup {\n          groupId: id\n          name\n          slug\n          permission\n          description\n        }\n      }\n      nodeTotal\n      next\n      page\n      pageSize\n      pageTotal\n      prev\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "85b4e8c75e274e749d4a529aebce6b8e";

export default node;
