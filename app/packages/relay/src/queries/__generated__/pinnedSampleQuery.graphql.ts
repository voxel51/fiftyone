/**
 * @generated SignedSource<<50e2ce74043e9cd5468b056a7ac1c49e>>
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
};
export type pinnedSampleQuery$variables = {
  dataset: string;
  filter: SampleFilter;
  view: Array;
};
export type pinnedSampleQuery$data = {
  readonly sample: {
    readonly id?: string;
    readonly sample?: object;
    readonly urls?: ReadonlyArray<{
      readonly field: string;
      readonly url: string | null;
    }>;
  } | null;
};
export type pinnedSampleQuery = {
  response: pinnedSampleQuery$data;
  variables: pinnedSampleQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v3 = [
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
    "name": "view",
    "variableName": "view"
  }
],
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v5 = {
  "kind": "InlineFragment",
  "selections": [
    (v4/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "sample",
      "storageKey": null
    },
    {
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
    }
  ],
  "type": "PointCloudSample",
  "abstractKey": null
},
v6 = [
  (v4/*: any*/)
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "pinnedSampleQuery",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "sample",
        "plural": false,
        "selections": [
          (v5/*: any*/)
        ],
        "storageKey": null
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
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "pinnedSampleQuery",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "sample",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "__typename",
            "storageKey": null
          },
          (v5/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": (v6/*: any*/),
            "type": "ImageSample",
            "abstractKey": null
          },
          {
            "kind": "InlineFragment",
            "selections": (v6/*: any*/),
            "type": "VideoSample",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "1acff8b3a33f491ec9d5e3ea1cee6bad",
    "id": null,
    "metadata": {},
    "name": "pinnedSampleQuery",
    "operationKind": "query",
    "text": "query pinnedSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n) {\n  sample(dataset: $dataset, view: $view, filter: $filter) {\n    __typename\n    ... on PointCloudSample {\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on ImageSample {\n      id\n    }\n    ... on VideoSample {\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "1c03615213506567db79981363a7f764";

export default node;
