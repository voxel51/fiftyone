/**
 * @generated SignedSource<<feefeddeff13f06c30ffb004c35ae8f4>>
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
export type paginateGroupQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  dataset: string;
  filter: SampleFilter;
  view: Array;
};
export type paginateGroupQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroup_query">;
};
export type paginateGroupQuery = {
  response: paginateGroupQuery$data;
  variables: paginateGroupQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": 20,
  "kind": "LocalArgument",
  "name": "count"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "cursor"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v5 = [
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
  "name": "aspectRatio",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sample",
  "storageKey": null
},
v9 = {
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
};
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
    "name": "paginateGroupQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "paginateGroup_query"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v4/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "paginateGroupQuery",
    "selections": [
      {
        "alias": null,
        "args": (v5/*: any*/),
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
                    "selections": [
                      (v6/*: any*/),
                      (v7/*: any*/),
                      (v8/*: any*/),
                      (v9/*: any*/)
                    ],
                    "type": "ImageSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      (v6/*: any*/),
                      (v8/*: any*/),
                      (v9/*: any*/)
                    ],
                    "type": "PointCloudSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      (v6/*: any*/),
                      (v7/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "frameRate",
                        "storageKey": null
                      },
                      (v8/*: any*/),
                      (v9/*: any*/)
                    ],
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
        "args": (v5/*: any*/),
        "filters": [
          "dataset",
          "view",
          "filter"
        ],
        "handle": "connection",
        "key": "paginateGroup_query_samples",
        "kind": "LinkedHandle",
        "name": "samples"
      }
    ]
  },
  "params": {
    "cacheID": "f4d62000dc21792715c8929b9312a2ec",
    "id": null,
    "metadata": {},
    "name": "paginateGroupQuery",
    "operationKind": "query",
    "text": "query paginateGroupQuery(\n  $count: Int = 20\n  $cursor: String = null\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n) {\n  ...paginateGroup_query\n}\n\nfragment paginateGroup_query on Query {\n  samples(dataset: $dataset, view: $view, first: $count, after: $cursor, filter: $filter) {\n    total\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          id\n          aspectRatio\n          sample\n          urls {\n            field\n            url\n          }\n        }\n        ... on PointCloudSample {\n          id\n          sample\n          urls {\n            field\n            url\n          }\n        }\n        ... on VideoSample {\n          id\n          aspectRatio\n          frameRate\n          sample\n          urls {\n            field\n            url\n          }\n        }\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "f675c0667733228ac2427310dc518a45";

export default node;
