/**
 * @generated SignedSource<<a48bda67999fa9bd4647b1bb3f319a01>>
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
  filters?: object | null;
  index: number;
  view: Array;
};
export type mainSampleQuery$data = {
  readonly sample: {
    readonly __typename: "ImageSample";
    readonly id: string;
    readonly sample: object;
    readonly urls: ReadonlyArray<{
      readonly field: string;
      readonly url: string | null;
    }>;
  } | {
    readonly __typename: "VideoSample";
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
  "name": "index"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v5 = [
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
    "name": "index",
    "variableName": "index"
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
  "name": "__typename",
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
v10 = {
  "kind": "InlineFragment",
  "selections": [
    (v7/*: any*/),
    (v8/*: any*/),
    (v9/*: any*/)
  ],
  "type": "ImageSample",
  "abstractKey": null
},
v11 = {
  "kind": "InlineFragment",
  "selections": [
    (v7/*: any*/),
    (v8/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "frameRate",
      "storageKey": null
    },
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
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "mainSampleQuery",
    "selections": [
      {
        "alias": null,
        "args": (v5/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "sample",
        "plural": false,
        "selections": [
          (v6/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/)
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
      (v4/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "mainSampleQuery",
    "selections": [
      {
        "alias": null,
        "args": (v5/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "sample",
        "plural": false,
        "selections": [
          (v6/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": [
              (v7/*: any*/)
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
    "cacheID": "2b308049942cabaf916a56806344e9cf",
    "id": null,
    "metadata": {},
    "name": "mainSampleQuery",
    "operationKind": "query",
    "text": "query mainSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $filters: JSON\n  $index: Int!\n) {\n  sample(dataset: $dataset, view: $view, filters: $filters, filter: $filter, index: $index) {\n    __typename\n    ... on ImageSample {\n      id\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on VideoSample {\n      id\n      sample\n      frameRate\n      urls {\n        field\n        url\n      }\n    }\n    ... on PointCloudSample {\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "f1502abcee059321e8fc092cf2136b17";

export default node;
