/**
 * @generated SignedSource<<965cc389e9ef8c66afba03a0b2c4f6c5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type histogramValuesDatetimeQuery$variables = {
  dataset: string;
  path: string;
  view: Array;
};
export type histogramValuesDatetimeQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly max: string;
      readonly min: string;
    }>;
  }>;
};
export type histogramValuesDatetimeQuery = {
  response: histogramValuesDatetimeQuery$data;
  variables: histogramValuesDatetimeQuery$variables;
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
  "name": "path"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v3 = [
  {
    "items": [
      {
        "fields": [
          {
            "fields": [
              {
                "kind": "Variable",
                "name": "path",
                "variableName": "path"
              }
            ],
            "kind": "ObjectValue",
            "name": "histogramValues"
          }
        ],
        "kind": "ObjectValue",
        "name": "aggregations.0"
      }
    ],
    "kind": "ListValue",
    "name": "aggregations"
  },
  {
    "kind": "Variable",
    "name": "datasetName",
    "variableName": "dataset"
  },
  {
    "kind": "Variable",
    "name": "view",
    "variableName": "view"
  }
],
v4 = {
  "kind": "InlineFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "DatetimeHistogramValue",
      "kind": "LinkedField",
      "name": "values",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "count",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "min",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "max",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "DatetimeHistogramValuesResponse",
  "abstractKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "histogramValuesDatetimeQuery",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "aggregate",
        "plural": true,
        "selections": [
          (v4/*: any*/)
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
    "name": "histogramValuesDatetimeQuery",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "aggregate",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "__typename",
            "storageKey": null
          },
          (v4/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "8f3e800415d5142fb5cbb4c610921bbb",
    "id": null,
    "metadata": {},
    "name": "histogramValuesDatetimeQuery",
    "operationKind": "query",
    "text": "query histogramValuesDatetimeQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{histogramValues: {path: $path}}]) {\n    __typename\n    ... on DatetimeHistogramValuesResponse {\n      values {\n        count\n        min\n        max\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "eb8ea645abb314d20de2f05ad8592ce7";

export default node;
