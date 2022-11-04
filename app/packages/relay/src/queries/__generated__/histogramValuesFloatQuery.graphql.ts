/**
 * @generated SignedSource<<f919b4c192a3c52230fd2b5a18fea05f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type histogramValuesFloatQuery$variables = {
  dataset: string;
  path: string;
  view: Array;
};
export type histogramValuesFloatQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly max: number;
      readonly min: number;
    }>;
  }>;
};
export type histogramValuesFloatQuery = {
  response: histogramValuesFloatQuery$data;
  variables: histogramValuesFloatQuery$variables;
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
      "concreteType": "FloatHistogramValue",
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
  "type": "FloatHistogramValuesResponse",
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
    "name": "histogramValuesFloatQuery",
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
    "name": "histogramValuesFloatQuery",
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
    "cacheID": "5dc40ce746c3ab3332a926280f651326",
    "id": null,
    "metadata": {},
    "name": "histogramValuesFloatQuery",
    "operationKind": "query",
    "text": "query histogramValuesFloatQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{histogramValues: {path: $path}}]) {\n    __typename\n    ... on FloatHistogramValuesResponse {\n      values {\n        count\n        min\n        max\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "b94b470dcaf28157ee909eb69023b423";

export default node;
