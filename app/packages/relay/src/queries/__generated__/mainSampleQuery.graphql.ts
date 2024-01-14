/**
 * @generated SignedSource<<d1abd1addd7913e1193336100095b405>>
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
export type mainSampleQuery$variables = {
  dataset: string;
  filter: SampleFilter;
  filters?: object | null;
  view: Array;
};
export type mainSampleQuery$data = {
  readonly sample: {
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
  "name": "filters"
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
    "name": "filters",
    "variableName": "filters"
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
  "name": "__typename",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "aspectRatio",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
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
},
v10 = [
  (v6/*: any*/),
  (v7/*: any*/),
  (v8/*: any*/),
  (v9/*: any*/)
],
v11 = {
  "kind": "InlineFragment",
  "selections": (v10/*: any*/),
  "type": "ImageSample",
  "abstractKey": null
},
v12 = {
  "kind": "InlineFragment",
  "selections": (v10/*: any*/),
  "type": "PointCloudSample",
  "abstractKey": null
},
v13 = {
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
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "frameNumber",
      "storageKey": null
    },
    (v8/*: any*/),
    (v9/*: any*/)
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
          (v5/*: any*/),
          (v11/*: any*/),
          (v12/*: any*/),
          (v13/*: any*/)
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
          (v5/*: any*/),
          (v11/*: any*/),
          (v12/*: any*/),
          (v13/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": [
              (v7/*: any*/)
            ],
            "type": "ThreeDSample",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "5b046d25589fd5c93c6beb35f4330cf8",
    "id": null,
    "metadata": {},
    "name": "mainSampleQuery",
    "operationKind": "query",
    "text": "query mainSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $filters: JSON\n) {\n  sample(dataset: $dataset, view: $view, filters: $filters, filter: $filter) {\n    __typename\n    ... on ImageSample {\n      aspectRatio\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on PointCloudSample {\n      aspectRatio\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on VideoSample {\n      aspectRatio\n      id\n      frameRate\n      frameNumber\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on ThreeDSample {\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "2b2a2cfd1b68e8fd6d01258f45d2f99a";

export default node;
