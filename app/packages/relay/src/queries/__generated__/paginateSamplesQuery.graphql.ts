/**
 * @generated SignedSource<<01ff69d2c9fa6ca5f8e610ba1e34d374>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type SampleFilter = {
  group?: GroupElementFilter | null;
  id?: string | null;
};
export type GroupElementFilter = {
  id?: string | null;
  slice?: string | null;
  slices?: ReadonlyArray<string> | null;
};
export type paginateSamplesQuery$variables = {
  after?: string | null;
  before?: string | null;
  count?: number | null;
  cursorPagination?: boolean | null;
  dataset: string;
  desc?: boolean | null;
  dynamicGroup?: object | null;
  extendedStages?: object | null;
  filter: SampleFilter;
  filters?: object | null;
  hint?: string | null;
  maxQueryTime?: number | null;
  paginationData?: boolean | null;
  sortBy?: string | null;
  view: Array;
};
export type paginateSamplesQuery$data = {
  readonly samples: {
    readonly __typename: "QueryTimeout";
    readonly queryTime: number;
  } | {
    readonly __typename: "SampleItemStrConnection";
    readonly edges: ReadonlyArray<{
      readonly cursor: string;
      readonly node: {
        readonly __typename: "ImageSample";
        readonly aspectRatio: number;
        readonly id: string;
        readonly sample: object;
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string | null;
        }>;
      } | {
        readonly __typename: "PointCloudSample";
        readonly aspectRatio: number;
        readonly id: string;
        readonly sample: object;
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string | null;
        }>;
      } | {
        readonly __typename: "ThreeDSample";
        readonly aspectRatio: number;
        readonly id: string;
        readonly sample: object;
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string | null;
        }>;
      } | {
        readonly __typename: "UnknownSample";
        readonly aspectRatio: number;
        readonly id: string;
        readonly sample: object;
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string | null;
        }>;
      } | {
        readonly __typename: "VideoSample";
        readonly aspectRatio: number;
        readonly frameNumber: number;
        readonly frameRate: number;
        readonly id: string;
        readonly sample: object;
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string | null;
        }>;
      } | {
        // This will never be '%other', but we need some
        // value in case none of the concrete values match.
        readonly __typename: "%other";
      };
    }>;
    readonly pageInfo: {
      readonly endCursor: string | null;
      readonly hasNextPage: boolean;
      readonly hasPreviousPage: boolean;
      readonly startCursor: string | null;
    };
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  };
};
export type paginateSamplesQuery = {
  response: paginateSamplesQuery$data;
  variables: paginateSamplesQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "after"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "before"
},
v2 = {
  "defaultValue": 20,
  "kind": "LocalArgument",
  "name": "count"
},
v3 = {
  "defaultValue": false,
  "kind": "LocalArgument",
  "name": "cursorPagination"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "desc"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dynamicGroup"
},
v7 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "extendedStages"
},
v8 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
},
v9 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filters"
},
v10 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "hint"
},
v11 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "maxQueryTime"
},
v12 = {
  "defaultValue": true,
  "kind": "LocalArgument",
  "name": "paginationData"
},
v13 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sortBy"
},
v14 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v15 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
},
v16 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v17 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "aspectRatio",
  "storageKey": null
},
v18 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sample",
  "storageKey": null
},
v19 = {
  "alias": null,
  "args": null,
  "concreteType": "MediaURL",
  "kind": "LinkedField",
  "name": "urls",
  "plural": true,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "field",
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
},
v20 = [
  (v16/*: any*/),
  (v17/*: any*/),
  (v18/*: any*/),
  (v19/*: any*/)
],
v21 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "after",
        "variableName": "after"
      },
      {
        "kind": "Variable",
        "name": "before",
        "variableName": "before"
      },
      {
        "kind": "Variable",
        "name": "cursorPagination",
        "variableName": "cursorPagination"
      },
      {
        "kind": "Variable",
        "name": "dataset",
        "variableName": "dataset"
      },
      {
        "kind": "Variable",
        "name": "desc",
        "variableName": "desc"
      },
      {
        "kind": "Variable",
        "name": "dynamicGroup",
        "variableName": "dynamicGroup"
      },
      {
        "kind": "Variable",
        "name": "extendedStages",
        "variableName": "extendedStages"
      },
      {
        "kind": "Variable",
        "name": "filter",
        "variableName": "filter"
      },
      {
        "kind": "Variable",
        "name": "filters",
        "variableName": "filters"
      },
      {
        "kind": "Variable",
        "name": "first",
        "variableName": "count"
      },
      {
        "kind": "Variable",
        "name": "hint",
        "variableName": "hint"
      },
      {
        "kind": "Variable",
        "name": "maxQueryTime",
        "variableName": "maxQueryTime"
      },
      {
        "kind": "Variable",
        "name": "paginationData",
        "variableName": "paginationData"
      },
      {
        "kind": "Variable",
        "name": "sortBy",
        "variableName": "sortBy"
      },
      {
        "kind": "Variable",
        "name": "view",
        "variableName": "view"
      }
    ],
    "concreteType": null,
    "kind": "LinkedField",
    "name": "samples",
    "plural": false,
    "selections": [
      (v15/*: any*/),
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "queryTime",
            "storageKey": null
          }
        ],
        "type": "QueryTimeout",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleItemStrPageInfo",
            "kind": "LinkedField",
            "name": "pageInfo",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "hasNextPage",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "hasPreviousPage",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "endCursor",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "startCursor",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleItemStrEdge",
            "kind": "LinkedField",
            "name": "edges",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "cursor",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": null,
                "kind": "LinkedField",
                "name": "node",
                "plural": false,
                "selections": [
                  (v15/*: any*/),
                  {
                    "kind": "InlineFragment",
                    "selections": (v20/*: any*/),
                    "type": "ImageSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      (v17/*: any*/),
                      (v16/*: any*/),
                      (v18/*: any*/),
                      (v19/*: any*/)
                    ],
                    "type": "PointCloudSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      (v16/*: any*/),
                      (v17/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "frameRate",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "frameNumber",
                        "storageKey": null
                      },
                      (v18/*: any*/),
                      (v19/*: any*/)
                    ],
                    "type": "VideoSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": (v20/*: any*/),
                    "type": "ThreeDSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": (v20/*: any*/),
                    "type": "UnknownSample",
                    "abstractKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "type": "SampleItemStrConnection",
        "abstractKey": null
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
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/),
      (v7/*: any*/),
      (v8/*: any*/),
      (v9/*: any*/),
      (v10/*: any*/),
      (v11/*: any*/),
      (v12/*: any*/),
      (v13/*: any*/),
      (v14/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "paginateSamplesQuery",
    "selections": (v21/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/),
      (v4/*: any*/),
      (v14/*: any*/),
      (v8/*: any*/),
      (v9/*: any*/),
      (v7/*: any*/),
      (v12/*: any*/),
      (v13/*: any*/),
      (v5/*: any*/),
      (v10/*: any*/),
      (v6/*: any*/),
      (v11/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "paginateSamplesQuery",
    "selections": (v21/*: any*/)
  },
  "params": {
    "cacheID": "029222f8b9bca924eef74862f1fd3f6c",
    "id": null,
    "metadata": {},
    "name": "paginateSamplesQuery",
    "operationKind": "query",
    "text": "query paginateSamplesQuery(\n  $count: Int = 20\n  $after: String = null\n  $before: String = null\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $filters: BSON = null\n  $extendedStages: BSON\n  $paginationData: Boolean = true\n  $sortBy: String\n  $desc: Boolean\n  $hint: String\n  $dynamicGroup: BSON = null\n  $maxQueryTime: Int\n  $cursorPagination: Boolean = false\n) {\n  samples(dataset: $dataset, view: $view, first: $count, after: $after, before: $before, filter: $filter, filters: $filters, extendedStages: $extendedStages, paginationData: $paginationData, sortBy: $sortBy, desc: $desc, hint: $hint, dynamicGroup: $dynamicGroup, maxQueryTime: $maxQueryTime, cursorPagination: $cursorPagination) {\n    __typename\n    ... on QueryTimeout {\n      queryTime\n    }\n    ... on SampleItemStrConnection {\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        endCursor\n        startCursor\n      }\n      edges {\n        cursor\n        node {\n          __typename\n          ... on ImageSample {\n            id\n            aspectRatio\n            sample\n            urls {\n              field\n              url\n            }\n          }\n          ... on PointCloudSample {\n            aspectRatio\n            id\n            sample\n            urls {\n              field\n              url\n            }\n          }\n          ... on VideoSample {\n            id\n            aspectRatio\n            frameRate\n            frameNumber\n            sample\n            urls {\n              field\n              url\n            }\n          }\n          ... on ThreeDSample {\n            id\n            aspectRatio\n            sample\n            urls {\n              field\n              url\n            }\n          }\n          ... on UnknownSample {\n            id\n            aspectRatio\n            sample\n            urls {\n              field\n              url\n            }\n          }\n        }\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "e14105f3be81a714fbf3a8962832c673";

export default node;
