/**
 * @generated SignedSource<<6a6fa60ef0030a2bc73273d5fc18127e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type histogramValuesIntQuery$variables = {
  dataset: string;
  path: string;
  view: Array;
};
export type histogramValuesIntQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly max: number;
      readonly min: number;
    }>;
  }>;
};
export type histogramValuesIntQuery = {
  response: histogramValuesIntQuery$data;
  variables: histogramValuesIntQuery$variables;
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
      "concreteType": "IntHistogramValue",
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
  "type": "IntHistogramValuesResponse",
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
    "name": "histogramValuesIntQuery",
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
    "name": "histogramValuesIntQuery",
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
    "cacheID": "ded61ffdf84408592564505c3c3a5591",
    "id": null,
    "metadata": {},
    "name": "histogramValuesIntQuery",
    "operationKind": "query",
    "text": "query histogramValuesIntQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{histogramValues: {path: $path}}]) {\n    __typename\n    ... on IntHistogramValuesResponse {\n      values {\n        count\n        min\n        max\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "b79adfcb87bddf06f4379b57a17ad461";

export default node;
