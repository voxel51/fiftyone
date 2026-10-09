/**
 * @generated SignedSource<<03216724830408320874632ca962db03>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type OrderMode = "INDEXED" | "SCROLL" | "SMALL" | "%future added value";
export type OrderScale = "DATE" | "ID" | "NUMBER" | "%future added value";
export type OrderUnit = "DYNAMIC_GROUP" | "GROUP" | "SAMPLE" | "%future added value";
export type Unavailable = "BUDGET_EXCEEDED" | "FRAME_SORT" | "UNSUPPORTED_STAGE" | "%future added value";
export type OrderInput = {
  dataset: string;
  desc?: boolean | null;
  dynamicGroup?: object | null;
  extendedStages?: object | null;
  filters?: object | null;
  groupSlice?: string | null;
  partition?: ReadonlyArray<PartitionKey> | null;
  sortBy?: string | null;
  unit?: OrderUnit | null;
  view: Array;
};
export type PartitionKey = {
  path: string;
  value?: object | null;
};
export type SampleFilter = {
  group?: GroupElementFilter | null;
  id?: string | null;
};
export type GroupElementFilter = {
  id?: string | null;
  slice?: string | null;
  slices?: ReadonlyArray<string> | null;
};
export type openOrderQuery$variables = {
  count?: number | null;
  filter?: SampleFilter | null;
  input: OrderInput;
  maxQueryTime?: number | null;
  paginationData?: boolean | null;
  withFirstPage?: boolean | null;
};
export type openOrderQuery$data = {
  readonly openOrder: {
    readonly __typename: "Order";
    readonly bounds: {
      readonly max: object | null;
      readonly min: object | null;
      readonly scale: OrderScale | null;
    } | null;
    readonly firstPage?: {
      readonly edges: ReadonlyArray<{
        readonly cursor: string;
        readonly fraction: number | null;
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
        readonly offset: number | null;
        readonly value: object | null;
      }>;
      readonly pageInfo: {
        readonly endCursor: string | null;
        readonly hasNextPage: boolean;
        readonly hasPreviousPage: boolean;
        readonly startCursor: string | null;
      };
    } | null;
    readonly mode: OrderMode;
    readonly ticks: ReadonlyArray<{
      readonly fraction: number;
      readonly label: string;
    }>;
    readonly token: any;
    readonly total: number | null;
  } | {
    readonly __typename: "OrderUnavailable";
    readonly reason: Unavailable;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  };
};
export type openOrderQuery = {
  response: openOrderQuery$data;
  variables: openOrderQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": 50,
  "kind": "LocalArgument",
  "name": "count"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "input"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "maxQueryTime"
},
v4 = {
  "defaultValue": true,
  "kind": "LocalArgument",
  "name": "paginationData"
},
v5 = {
  "defaultValue": false,
  "kind": "LocalArgument",
  "name": "withFirstPage"
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "fraction",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "aspectRatio",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sample",
  "storageKey": null
},
v11 = {
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
v12 = [
  (v8/*: any*/),
  (v9/*: any*/),
  (v10/*: any*/),
  (v11/*: any*/)
],
v13 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "input",
        "variableName": "input"
      }
    ],
    "concreteType": null,
    "kind": "LinkedField",
    "name": "openOrder",
    "plural": false,
    "selections": [
      (v6/*: any*/),
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "token",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "mode",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "total",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "OrderBounds",
            "kind": "LinkedField",
            "name": "bounds",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "min",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "max",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "scale",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "OrderTick",
            "kind": "LinkedField",
            "name": "ticks",
            "plural": true,
            "selections": [
              (v7/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "label",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "condition": "withFirstPage",
            "kind": "Condition",
            "passingValue": true,
            "selections": [
              {
                "alias": null,
                "args": [
                  {
                    "kind": "Variable",
                    "name": "count",
                    "variableName": "count"
                  },
                  {
                    "kind": "Variable",
                    "name": "filter",
                    "variableName": "filter"
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
                  }
                ],
                "concreteType": "SampleItemStrConnection",
                "kind": "LinkedField",
                "name": "firstPage",
                "plural": false,
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
                      (v7/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "offset",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "value",
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
                          (v6/*: any*/),
                          {
                            "kind": "InlineFragment",
                            "selections": (v12/*: any*/),
                            "type": "ImageSample",
                            "abstractKey": null
                          },
                          {
                            "kind": "InlineFragment",
                            "selections": [
                              (v9/*: any*/),
                              (v8/*: any*/),
                              (v10/*: any*/),
                              (v11/*: any*/)
                            ],
                            "type": "PointCloudSample",
                            "abstractKey": null
                          },
                          {
                            "kind": "InlineFragment",
                            "selections": [
                              (v8/*: any*/),
                              (v9/*: any*/),
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
                              (v10/*: any*/),
                              (v11/*: any*/)
                            ],
                            "type": "VideoSample",
                            "abstractKey": null
                          },
                          {
                            "kind": "InlineFragment",
                            "selections": (v12/*: any*/),
                            "type": "ThreeDSample",
                            "abstractKey": null
                          },
                          {
                            "kind": "InlineFragment",
                            "selections": (v12/*: any*/),
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
                "storageKey": null
              }
            ]
          }
        ],
        "type": "Order",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "reason",
            "storageKey": null
          }
        ],
        "type": "OrderUnavailable",
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
      (v5/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "openOrderQuery",
    "selections": (v13/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v5/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/),
      (v4/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "openOrderQuery",
    "selections": (v13/*: any*/)
  },
  "params": {
    "cacheID": "f42d21e9a78911b369cd39c3c17cd7b9",
    "id": null,
    "metadata": {},
    "name": "openOrderQuery",
    "operationKind": "query",
    "text": "query openOrderQuery(\n  $input: OrderInput!\n  $withFirstPage: Boolean = false\n  $count: Int = 50\n  $filter: SampleFilter = null\n  $paginationData: Boolean = true\n  $maxQueryTime: Int = null\n) {\n  openOrder(input: $input) {\n    __typename\n    ... on Order {\n      token\n      mode\n      total\n      bounds {\n        min\n        max\n        scale\n      }\n      ticks {\n        fraction\n        label\n      }\n      firstPage(count: $count, filter: $filter, paginationData: $paginationData, maxQueryTime: $maxQueryTime) @include(if: $withFirstPage) {\n        pageInfo {\n          hasNextPage\n          hasPreviousPage\n          endCursor\n          startCursor\n        }\n        edges {\n          cursor\n          fraction\n          offset\n          value\n          node {\n            __typename\n            ... on ImageSample {\n              id\n              aspectRatio\n              sample\n              urls {\n                field\n                url\n              }\n            }\n            ... on PointCloudSample {\n              aspectRatio\n              id\n              sample\n              urls {\n                field\n                url\n              }\n            }\n            ... on VideoSample {\n              id\n              aspectRatio\n              frameRate\n              frameNumber\n              sample\n              urls {\n                field\n                url\n              }\n            }\n            ... on ThreeDSample {\n              id\n              aspectRatio\n              sample\n              urls {\n                field\n                url\n              }\n            }\n            ... on UnknownSample {\n              id\n              aspectRatio\n              sample\n              urls {\n                field\n                url\n              }\n            }\n          }\n        }\n      }\n    }\n    ... on OrderUnavailable {\n      reason\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "8c9ac72adc89cd5cdb23d329a59a8d2a";

export default node;
