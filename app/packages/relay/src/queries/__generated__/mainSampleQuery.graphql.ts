/**
 * @generated SignedSource<<2f2a9564820bafc39ad053149180bf38>>
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
export type mainSampleQuery$variables = {
  dataset: string;
  filter: SampleFilter;
  index: number;
  view: Array;
};
export type mainSampleQuery$data = {
  readonly sample: {
    readonly frameRate?: number;
    readonly id?: string;
    readonly sample?: object;
    readonly urls?: ReadonlyArray<{
      readonly field: string;
      readonly url: string | null;
    }>;
  } | null;
};
export type mainSampleQuery = {
  response: mainSampleQuery$data;
  variables: mainSampleQuery$variables;
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
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sample",
  "storageKey": null
},
v7 = {
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
v8 = {
  "kind": "InlineFragment",
  "selections": [
    (v5/*: any*/),
    (v6/*: any*/),
    (v7/*: any*/)
  ],
  "type": "ImageSample",
  "abstractKey": null
},
v9 = {
  "kind": "InlineFragment",
  "selections": [
    (v5/*: any*/),
    (v6/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "frameRate",
      "storageKey": null
    },
    (v7/*: any*/)
  ],
  "type": "VideoSample",
  "abstractKey": null
};
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
    "name": "mainSampleQuery",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "sample",
        "plural": false,
        "selections": [
          (v8/*: any*/),
          (v9/*: any*/)
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
    "name": "mainSampleQuery",
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
          (v8/*: any*/),
          (v9/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": [
              (v5/*: any*/)
            ],
            "type": "PointCloudSample",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "4f0ef3ac0d02de57a4e62e6515293952",
    "id": null,
    "metadata": {},
    "name": "mainSampleQuery",
    "operationKind": "query",
    "text": "query mainSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $index: Int!\n) {\n  sample(dataset: $dataset, view: $view, filter: $filter, index: $index) {\n    __typename\n    ... on ImageSample {\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on VideoSample {\n      id\n      sample\n      frameRate\n      urls {\n        field\n        url\n      }\n    }\n    ... on PointCloudSample {\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "eddbf046c706c32c00db34b4c1c9d2b0";

export default node;
