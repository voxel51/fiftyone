/**
 * @generated SignedSource<<86537c2cf6ea5044e12a24654ed1c743>>
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
  slices?: ReadonlyArray<string> | null;
};
export type pcdSampleQuery$variables = {
  dataset: string;
  filter: SampleFilter;
  index: number;
  view: Array;
};
export type pcdSampleQuery$data = {
  readonly sample: {
    readonly id?: string;
    readonly sample?: object;
    readonly urls?: ReadonlyArray<{
      readonly field: string;
      readonly url: string | null;
    }>;
  } | null;
};
export type pcdSampleQuery = {
  response: pcdSampleQuery$data;
  variables: pcdSampleQuery$variables;
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
  "name": "index"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v4 = [
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
    "name": "index",
    "variableName": "index"
  },
  {
    "kind": "Variable",
    "name": "view",
    "variableName": "view"
  }
],
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v6 = {
  "kind": "InlineFragment",
  "selections": [
    (v5/*: any*/),
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
v7 = [
  (v5/*: any*/)
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "pcdSampleQuery",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "sample",
        "plural": false,
        "selections": [
          (v6/*: any*/)
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
      (v3/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "pcdSampleQuery",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
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
          (v6/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": (v7/*: any*/),
            "type": "ImageSample",
            "abstractKey": null
          },
          {
            "kind": "InlineFragment",
            "selections": (v7/*: any*/),
            "type": "VideoSample",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "1b4ac73d268cbd32b107cff662d64b41",
    "id": null,
    "metadata": {},
    "name": "pcdSampleQuery",
    "operationKind": "query",
    "text": "query pcdSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $index: Int!\n) {\n  sample(dataset: $dataset, view: $view, filter: $filter, index: $index) {\n    __typename\n    ... on PointCloudSample {\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on ImageSample {\n      id\n    }\n    ... on VideoSample {\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "bf587d10f3ec805fa6219154285e1eb0";

export default node;
