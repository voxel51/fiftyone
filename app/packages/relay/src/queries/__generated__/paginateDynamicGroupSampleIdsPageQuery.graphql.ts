/**
 * @generated SignedSource<<27ba3fbcc0c958e2db5e5f136b4ce698>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type SampleFilter = {
  group?: GroupElementFilter | null;
  id?: string | null;
};
export type GroupElementFilter = {
  id?: string | null;
  slice?: string | null;
};
export type paginateDynamicGroupSampleIdsPageQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  dataset: string;
  filter?: SampleFilter | null;
  view: Array;
};
export type paginateDynamicGroupSampleIdsPageQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"paginateDynamicGroupSampleIds_query">;
};
export type paginateDynamicGroupSampleIdsPageQuery = {
  response: paginateDynamicGroupSampleIdsPageQuery$data;
  variables: paginateDynamicGroupSampleIdsPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "count"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "cursor"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "dataset"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "filter"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "view"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "after",
    "variableName": "cursor"
  },
  {
    "kind": "Variable",
    "name": "dataset",
    "variableName": "dataset"
  },
  {
    "kind": "Variable",
    "name": "filter",
    "variableName": "filter"
  },
  {
    "kind": "Variable",
    "name": "first",
    "variableName": "count"
  },
  {
    "kind": "Variable",
    "name": "view",
    "variableName": "view"
  }
],
v2 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "id",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "paginateDynamicGroupSampleIdsPageQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "paginateDynamicGroupSampleIds_query"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "paginateDynamicGroupSampleIdsPageQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "SampleItemStrConnection",
        "kind": "LinkedField",
        "name": "samples",
        "plural": false,
        "selections": [
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
                    "selections": (v2/*: any*/),
                    "type": "ImageSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": (v2/*: any*/),
                    "type": "PointCloudSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": (v2/*: any*/),
                    "type": "VideoSample",
                    "abstractKey": null
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
            "concreteType": "SampleItemStrPageInfo",
            "kind": "LinkedField",
            "name": "pageInfo",
            "plural": false,
            "selections": [
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
                "name": "hasNextPage",
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
        "args": (v1/*: any*/),
        "filters": [
          "dataset",
          "view",
          "filter"
        ],
        "handle": "connection",
        "key": "PaginateDynamicGroupSampleIdsQuery_samples",
        "kind": "LinkedHandle",
        "name": "samples"
      }
    ]
  },
  "params": {
    "cacheID": "45f4504899e4e91233d95f0604a7625d",
    "id": null,
    "metadata": {},
    "name": "paginateDynamicGroupSampleIdsPageQuery",
    "operationKind": "query",
    "text": "query paginateDynamicGroupSampleIdsPageQuery(\n  $count: Int\n  $cursor: String\n  $dataset: String!\n  $filter: SampleFilter\n  $view: BSONArray!\n) {\n  ...paginateDynamicGroupSampleIds_query\n}\n\nfragment paginateDynamicGroupSampleIds_query on Query {\n  samples(dataset: $dataset, view: $view, first: $count, after: $cursor, filter: $filter) {\n    total\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          id\n        }\n        ... on PointCloudSample {\n          id\n        }\n        ... on VideoSample {\n          id\n        }\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "05500d155116ac56a8db619be13a5b92";

export default node;
