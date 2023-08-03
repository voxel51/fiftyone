/**
 * @generated SignedSource<<ee62f8703f3753de2c9f5df4417fa1a9>>
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
  count?: number | null;
  dataset: string;
  extendedStages?: object | null;
  filter: SampleFilter;
  filters?: object | null;
  paginationData?: boolean | null;
  view: Array;
};
export type paginateSamplesQuery$data = {
  readonly samples: {
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
      readonly hasNextPage: boolean;
    };
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
  "defaultValue": 20,
  "kind": "LocalArgument",
  "name": "count"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "extendedStages"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filters"
},
v6 = {
  "defaultValue": true,
  "kind": "LocalArgument",
  "name": "paginationData"
},
v7 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
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
        "name": "dataset",
        "variableName": "dataset"
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
        "name": "paginationData",
        "variableName": "paginationData"
      },
      {
        "kind": "Variable",
        "name": "view",
        "variableName": "view"
      }
    ],
    "concreteType": "SampleItemStrConnection",
    "kind": "LinkedField",
    "name": "samples",
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
                  (v8/*: any*/),
                  (v9/*: any*/),
                  (v10/*: any*/),
                  (v11/*: any*/)
                ],
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
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/),
      (v7/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "paginateSamplesQuery",
    "selections": (v12/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/),
      (v7/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v3/*: any*/),
      (v6/*: any*/)
    ],
    "kind": "Operation",
    "name": "paginateSamplesQuery",
    "selections": (v12/*: any*/)
  },
  "params": {
    "cacheID": "d65e8259e9d935782ca905d80e22550f",
    "id": null,
    "metadata": {},
    "name": "paginateSamplesQuery",
    "operationKind": "query",
    "text": "query paginateSamplesQuery(\n  $count: Int = 20\n  $after: String = null\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $filters: BSON = null\n  $extendedStages: BSON\n  $paginationData: Boolean = true\n) {\n  samples(dataset: $dataset, view: $view, first: $count, after: $after, filter: $filter, filters: $filters, extendedStages: $extendedStages, paginationData: $paginationData) {\n    pageInfo {\n      hasNextPage\n    }\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          id\n          aspectRatio\n          sample\n          urls {\n            field\n            url\n          }\n        }\n        ... on PointCloudSample {\n          aspectRatio\n          id\n          sample\n          urls {\n            field\n            url\n          }\n        }\n        ... on VideoSample {\n          id\n          aspectRatio\n          frameRate\n          frameNumber\n          sample\n          urls {\n            field\n            url\n          }\n        }\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "e8ef27726824c7362be7589892f01f2a";

export default node;
