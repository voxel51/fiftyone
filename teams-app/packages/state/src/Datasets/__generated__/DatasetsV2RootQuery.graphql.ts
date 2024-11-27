/**
 * @generated SignedSource<<015e18f50af19fff8ff0b78a0be0ad51>>
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
export type DatasetsV2RootQuery$variables = {
  filter?: DatasetFilter | null;
  firstViews?: number | null;
  order: DatasetOrderFieldsOrder;
  page: number;
  pageSize: number;
  search?: DatasetSearchFieldsSearch | null;
};
export type DatasetsV2RootQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"CurrentUserFragment" | "DatasetListFragment" | "RecentViewsListFragment">;
};
export type DatasetsV2RootQuery = {
  response: DatasetsV2RootQuery$data;
  variables: DatasetsV2RootQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
},
v1 = {
  "defaultValue": 5,
  "kind": "LocalArgument",
  "name": "firstViews"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "order"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "page"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pageSize"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "search"
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "email",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetsV2RootQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "RecentViewsListFragment"
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "DatasetListFragment"
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "CurrentUserFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v5/*: any*/),
      (v4/*: any*/),
      (v3/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetsV2RootQuery",
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "first",
            "variableName": "firstViews"
          }
        ],
        "concreteType": "DatasetViewUser",
        "kind": "LinkedField",
        "name": "userViews",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetView",
            "kind": "LinkedField",
            "name": "view",
            "plural": false,
            "selections": [
              (v6/*: any*/),
              (v7/*: any*/),
              (v8/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "color",
                "storageKey": null
              },
              (v9/*: any*/)
            ],
            "storageKey": null
          },
          (v10/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "loadCount",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Dataset",
            "kind": "LinkedField",
            "name": "dataset",
            "plural": false,
            "selections": [
              (v6/*: any*/),
              (v7/*: any*/),
              (v8/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      },
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
              (v6/*: any*/),
              (v7/*: any*/),
              (v8/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "mediaType",
                "storageKey": null
              },
              (v9/*: any*/),
              (v10/*: any*/),
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
                      (v6/*: any*/),
                      (v11/*: any*/)
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
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "APIKey",
            "kind": "LinkedField",
            "name": "apiKeys",
            "plural": true,
            "selections": [
              (v9/*: any*/),
              (v6/*: any*/),
              (v7/*: any*/)
            ],
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
            "name": "role",
            "storageKey": null
          },
          (v7/*: any*/),
          (v6/*: any*/),
          (v11/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "875e82749cfdc3f57179b134fc011cfa",
    "id": null,
    "metadata": {},
    "name": "DatasetsV2RootQuery",
    "operationKind": "query",
    "text": "query DatasetsV2RootQuery(\n  $filter: DatasetFilter\n  $order: DatasetOrderFieldsOrder!\n  $search: DatasetSearchFieldsSearch\n  $pageSize: Int!\n  $page: Int!\n  $firstViews: Int = 5\n) {\n  ...RecentViewsListFragment\n  ...DatasetListFragment\n  ...CurrentUserFragment\n}\n\nfragment CurrentUserFragment on Query {\n  viewer {\n    apiKeys {\n      createdAt\n      id\n      name\n    }\n    picture\n    role\n    name\n    id\n    email\n  }\n}\n\nfragment DatasetFrag on Dataset {\n  id\n  name\n  slug\n  mediaType\n  createdAt\n  lastLoadedAt\n  defaultPermission\n  samplesCount\n  sampleFieldsCount\n  tags\n  viewer {\n    user {\n      id\n      email\n    }\n    pinned\n    pinnedAt\n    activePermission\n  }\n}\n\nfragment DatasetListFragment on Query {\n  datasetsPage(filter: $filter, search: $search, order: $order, pageSize: $pageSize, page: $page) {\n    prev\n    page\n    next\n    pageSize\n    pageTotal\n    nodeTotal\n    nodes {\n      ...DatasetFrag\n    }\n  }\n}\n\nfragment RecentViewsListFragment on Query {\n  userViews(first: $firstViews) {\n    view {\n      id\n      name\n      slug\n      color\n      createdAt\n    }\n    lastLoadedAt\n    loadCount\n    dataset {\n      id\n      name\n      slug\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "4a4686d5a9329aa4933fb759785ab2ec";

export default node;
