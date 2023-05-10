/**
 * @generated SignedSource<<b965eb1474c8e5503b242344204aa178>>
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
  slices?: ReadonlyArray<string> | null;
};
export type paginateGroupPageQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  dataset: string;
  filter?: SampleFilter | null;
  view: Array;
};
export type paginateGroupPageQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroup_query">;
};
export type paginateGroupPageQuery = {
  response: paginateGroupPageQuery$data;
  variables: paginateGroupPageQuery$variables;
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
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "aspectRatio",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sample",
  "storageKey": null
},
v5 = {
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "paginateGroupPageQuery",
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "paginateGroupPageQuery",
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
                    "selections": [
                      (v2/*: any*/),
                      (v3/*: any*/),
                      (v4/*: any*/),
                      (v5/*: any*/)
                    ],
                    "type": "ImageSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      (v2/*: any*/),
                      (v4/*: any*/),
                      (v5/*: any*/)
                    ],
                    "type": "PointCloudSample",
                    "abstractKey": null
                  },
                  {
                    "kind": "InlineFragment",
                    "selections": [
                      (v2/*: any*/),
                      (v3/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "frameRate",
                        "storageKey": null
                      },
                      (v4/*: any*/),
                      (v5/*: any*/)
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
        "args": (v1/*: any*/),
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
    "cacheID": "1e5b70e8bf7e81c7574e5701cfc30db6",
    "id": null,
    "metadata": {},
    "name": "paginateGroupPageQuery",
    "operationKind": "query",
    "text": "query paginateGroupPageQuery(\n  $count: Int\n  $cursor: String\n  $dataset: String!\n  $filter: SampleFilter\n  $view: BSONArray!\n) {\n  ...paginateGroup_query\n}\n\nfragment paginateGroup_query on Query {\n  samples(dataset: $dataset, view: $view, first: $count, after: $cursor, filter: $filter) {\n    total\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          id\n          aspectRatio\n          sample\n          urls {\n            field\n            url\n          }\n        }\n        ... on PointCloudSample {\n          id\n          sample\n          urls {\n            field\n            url\n          }\n        }\n        ... on VideoSample {\n          id\n          aspectRatio\n          frameRate\n          sample\n          urls {\n            field\n            url\n          }\n        }\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "20891cc18082d493738d44781ff64148";

export default node;
