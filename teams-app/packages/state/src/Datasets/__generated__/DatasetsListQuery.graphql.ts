/**
 * @generated SignedSource<<43105bdcf8e74bcd4fe1cf94a31931d7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetMediaType = "GROUP" | "IMAGE" | "POINT_CLOUD" | "THREE_D" | "VIDEO" | "%future added value";
export type DatasetOrderFields = "createdAt" | "lastLoadedAt" | "name" | "sampleFieldsCount" | "samplesCount" | "slug" | "userPinnedAt" | "%future added value";
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type DatasetSearchFields = "id" | "mediaType" | "name" | "slug" | "tags" | "%future added value";
export type MediaTypeOption = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
export type OrderInputDirection = "ASC" | "DESC" | "%future added value";
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
export type DatasetSearchFieldsSearch = {
  fields: ReadonlyArray<DatasetSearchFields>;
  term: string;
};
export type DatasetOrderFieldsOrder = {
  direction: OrderInputDirection;
  field: DatasetOrderFields;
};
export type DatasetsListQuery$variables = {
  filter?: DatasetFilter | null;
  order: DatasetOrderFieldsOrder;
  page: number;
  pageSize: number;
  search?: DatasetSearchFieldsSearch | null;
};
export type DatasetsListQuery$data = {
  readonly datasetsPage: {
    readonly next: number | null;
    readonly nodeTotal: number;
    readonly nodes: ReadonlyArray<{
      readonly createdAt: string | null;
      readonly id: string;
      readonly lastLoadedAt: string | null;
      readonly mediaType: MediaTypeOption | null;
      readonly name: string;
      readonly sampleFieldsCount: number;
      readonly samplesCount: number;
      readonly slug: string;
      readonly tags: ReadonlyArray<string>;
      readonly viewer: {
        readonly pinned: boolean;
      };
    }>;
    readonly page: number | null;
    readonly pageSize: number;
    readonly pageTotal: number;
    readonly prev: number | null;
  };
};
export type DatasetsListQuery = {
  response: DatasetsListQuery$data;
  variables: DatasetsListQuery$variables;
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
  "name": "order"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "page"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pageSize"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "search"
},
v5 = [
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
    "concreteType": "DatasetPage",
    "kind": "LinkedField",
    "name": "datasetsPage",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "prev",
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
        "name": "next",
        "storageKey": null
      },
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
            "name": "lastLoadedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetUser",
            "kind": "LinkedField",
            "name": "viewer",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "pinned",
                "storageKey": null
              }
            ],
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
            "args": null,
            "kind": "ScalarField",
            "name": "sampleFieldsCount",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "tags",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "mediaType",
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
            "name": "slug",
            "storageKey": null
          }
        ],
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
        "name": "nodeTotal",
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
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetsListQuery",
    "selections": (v5/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v4/*: any*/),
      (v1/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetsListQuery",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "c4cb4c73817e39892a5698e399eaa9dc",
    "id": null,
    "metadata": {},
    "name": "DatasetsListQuery",
    "operationKind": "query",
    "text": "query DatasetsListQuery(\n  $filter: DatasetFilter\n  $search: DatasetSearchFieldsSearch\n  $order: DatasetOrderFieldsOrder!\n  $pageSize: Int!\n  $page: Int!\n) {\n  datasetsPage(filter: $filter, search: $search, order: $order, pageSize: $pageSize, page: $page) {\n    prev\n    page\n    next\n    nodes {\n      id\n      name\n      lastLoadedAt\n      viewer {\n        pinned\n      }\n      samplesCount\n      sampleFieldsCount\n      tags\n      mediaType\n      createdAt\n      slug\n    }\n    pageSize\n    pageTotal\n    nodeTotal\n  }\n}\n"
  }
};
})();

(node as any).hash = "34130ecb46c9d5e35dacd62d82b259c4";

export default node;
