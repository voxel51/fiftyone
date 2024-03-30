/**
 * @generated SignedSource<<d2915b41290da7b904ed7d7becf917d8>>
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
    readonly __typename: "ThreeDSample";
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
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "aspectRatio",
  "storageKey": null
},
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
v8 = [
  (v4/*: any*/),
  (v5/*: any*/),
  (v6/*: any*/),
  (v7/*: any*/)
],
v9 = [
  {
    "alias": null,
    "args": [
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
      {
        "kind": "InlineFragment",
        "selections": (v8/*: any*/),
        "type": "ImageSample",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v8/*: any*/),
        "type": "PointCloudSample",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v4/*: any*/),
          (v5/*: any*/),
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
          (v6/*: any*/),
          (v7/*: any*/)
        ],
        "type": "VideoSample",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v8/*: any*/),
        "type": "ThreeDSample",
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
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "mainSampleQuery",
    "selections": (v9/*: any*/),
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
    "selections": (v9/*: any*/)
  },
  "params": {
    "cacheID": "3620bb08051185b996237076ef49a2f1",
    "id": null,
    "metadata": {},
    "name": "mainSampleQuery",
    "operationKind": "query",
    "text": "query mainSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $filters: JSON\n) {\n  sample(dataset: $dataset, view: $view, filters: $filters, filter: $filter) {\n    __typename\n    ... on ImageSample {\n      aspectRatio\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on PointCloudSample {\n      aspectRatio\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on VideoSample {\n      aspectRatio\n      id\n      frameRate\n      frameNumber\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on ThreeDSample {\n      aspectRatio\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "e886574436e86028aafc7255b6088901";

export default node;
