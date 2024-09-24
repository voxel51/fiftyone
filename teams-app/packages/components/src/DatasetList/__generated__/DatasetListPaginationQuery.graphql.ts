/**
 * @generated SignedSource<<0bf2f82587d478b5e2b50b4fab6ba42c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetMediaType = "GROUP" | "IMAGE" | "POINT_CLOUD" | "THREE_D" | "VIDEO" | "%future added value";
export type DatasetOrderFields = "createdAt" | "lastLoadedAt" | "name" | "sampleFieldsCount" | "samplesCount" | "slug" | "userPinnedAt" | "%future added value";
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type DatasetSearchFields = "id" | "mediaType" | "name" | "slug" | "tags" | "%future added value";
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
export type DatasetOrderFieldsOrder = {
  direction: OrderInputDirection;
  field: DatasetOrderFields;
};
export type DatasetSearchFieldsSearch = {
  fields: ReadonlyArray<DatasetSearchFields>;
  term: string;
};
export type DatasetListPaginationQuery$variables = {
  filter?: DatasetFilter | null;
  order?: DatasetOrderFieldsOrder | null;
  page: number;
  pageSize: number;
  search?: DatasetSearchFieldsSearch | null;
};
export type DatasetListPaginationQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"DatasetListFragment">;
};
export type DatasetListPaginationQuery = {
  response: DatasetListPaginationQuery$data;
  variables: DatasetListPaginationQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "filter"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "order"
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
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "search"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetListPaginationQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "DatasetListFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetListPaginationQuery",
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
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Dataset",
            "kind": "LinkedField",
            "name": "nodes",
            "plural": true,
            "selections": [
              (v1/*: any*/),
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
                "name": "slug",
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
                "name": "lastLoadedAt",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "defaultPermission",
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
                "concreteType": "DatasetUser",
                "kind": "LinkedField",
                "name": "viewer",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "User",
                    "kind": "LinkedField",
                    "name": "user",
                    "plural": false,
                    "selections": [
                      (v1/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "email",
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "pinned",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "pinnedAt",
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
    ]
  },
  "params": {
    "cacheID": "ca494a2d9a4698f3884e5f117a8d4a88",
    "id": null,
    "metadata": {},
    "name": "DatasetListPaginationQuery",
    "operationKind": "query",
    "text": "query DatasetListPaginationQuery(\n  $filter: DatasetFilter\n  $order: DatasetOrderFieldsOrder\n  $page: Int!\n  $pageSize: Int!\n  $search: DatasetSearchFieldsSearch\n) {\n  ...DatasetListFragment\n}\n\nfragment DatasetFrag on Dataset {\n  id\n  name\n  slug\n  mediaType\n  createdAt\n  lastLoadedAt\n  defaultPermission\n  samplesCount\n  sampleFieldsCount\n  tags\n  viewer {\n    user {\n      id\n      email\n    }\n    pinned\n    pinnedAt\n    activePermission\n  }\n}\n\nfragment DatasetListFragment on Query {\n  datasetsPage(filter: $filter, search: $search, order: $order, pageSize: $pageSize, page: $page) {\n    prev\n    page\n    next\n    pageSize\n    pageTotal\n    nodeTotal\n    nodes {\n      ...DatasetFrag\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "71e3c437fec6c72026d5d6fc642340ea";

export default node;
