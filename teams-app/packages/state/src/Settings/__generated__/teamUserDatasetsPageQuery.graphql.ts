/**
 * @generated SignedSource<<6a8effe72fc1d6ec453088fcb96846ac>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetMediaType = "GROUP" | "IMAGE" | "POINT_CLOUD" | "THREE_D" | "VIDEO" | "%future added value";
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type DatasetFilter = {
  createdBy?: StringFilter | null;
  mediaType?: DatasetMediaTypeComparisonFilter | null;
  name?: StringFilter | null;
  slug?: StringFilter | null;
  userPermission?: DatasetPermissionComparisonFilter | null;
  userPinned?: boolean | null;
};
export type StringFilter = {
  eq?: string | null;
  in?: ReadonlyArray<string> | null;
  ne?: string | null;
  regexp?: string | null;
};
export type DatasetPermissionComparisonFilter = {
  eq?: DatasetPermission | null;
  ge?: DatasetPermission | null;
  gt?: DatasetPermission | null;
  in?: ReadonlyArray<DatasetPermission> | null;
  le?: DatasetPermission | null;
  lt?: DatasetPermission | null;
  ne?: DatasetPermission | null;
};
export type DatasetMediaTypeComparisonFilter = {
  eq?: DatasetMediaType | null;
  ge?: DatasetMediaType | null;
  gt?: DatasetMediaType | null;
  in?: ReadonlyArray<DatasetMediaType> | null;
  le?: DatasetMediaType | null;
  lt?: DatasetMediaType | null;
  ne?: DatasetMediaType | null;
};
export type teamUserDatasetsPageQuery$variables = {
  filter?: DatasetFilter | null;
  page: number;
  pageSize: number;
  userId: string;
};
export type teamUserDatasetsPageQuery$data = {
  readonly user: {
    readonly datasetsPage: {
      readonly nodes: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly samplesCount: number;
        readonly user: {
          readonly activePermission: DatasetPermission;
          readonly userPermission: DatasetPermission | null;
        } | null;
      }>;
      readonly pageTotal: number;
    };
  } | null;
};
export type teamUserDatasetsPageQuery = {
  response: teamUserDatasetsPageQuery$data;
  variables: teamUserDatasetsPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
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
  "name": "userId"
},
v4 = [
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "userId"
  }
],
v5 = [
  {
    "alias": null,
    "args": (v4/*: any*/),
    "concreteType": "User",
    "kind": "LinkedField",
    "name": "user",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "filter",
            "variableName": "filter"
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
        "concreteType": "DatasetPage",
        "kind": "LinkedField",
        "name": "datasetsPage",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Dataset",
            "kind": "LinkedField",
            "name": "nodes",
            "plural": true,
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
                "name": "id",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "samplesCount",
                "storageKey": null
              },
              {
                "alias": null,
                "args": (v4/*: any*/),
                "concreteType": "DatasetUser",
                "kind": "LinkedField",
                "name": "user",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "activePermission",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "userPermission",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "pageTotal",
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
    "name": "teamUserDatasetsPageQuery",
    "selections": (v5/*: any*/),
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
    "name": "teamUserDatasetsPageQuery",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "08390d355ff5670d1744828c47d63298",
    "id": null,
    "metadata": {},
    "name": "teamUserDatasetsPageQuery",
    "operationKind": "query",
    "text": "query teamUserDatasetsPageQuery(\n  $userId: String!\n  $page: Int!\n  $pageSize: Int!\n  $filter: DatasetFilter\n) {\n  user(id: $userId) {\n    datasetsPage(page: $page, pageSize: $pageSize, filter: $filter) {\n      nodes {\n        name\n        id\n        samplesCount\n        user(id: $userId) {\n          activePermission\n          userPermission\n        }\n      }\n      pageTotal\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "327cc0294048fd3fad4e28555362f4a7";

export default node;
