/**
 * @generated SignedSource<<865474f017642d9ea741346df01ce06c>>
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
  readonly histogramValues: {
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly max: number;
      readonly min: number;
    }>;
  };
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
    "kind": "Variable",
    "name": "datasetName",
    "variableName": "dataset"
  },
  {
    "kind": "Variable",
    "name": "path",
    "variableName": "path"
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
        "name": "histogramValues",
        "plural": false,
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
        "name": "histogramValues",
        "plural": false,
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
    "cacheID": "8d361372a22af3dc0b606022dc111e01",
    "id": null,
    "metadata": {},
    "name": "histogramValuesFloatQuery",
    "operationKind": "query",
    "text": "query histogramValuesFloatQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  histogramValues(datasetName: $dataset, view: $view, path: $path) {\n    __typename\n    ... on FloatHistogramValuesResponse {\n      values {\n        count\n        min\n        max\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "0f59bfb0fb9a63c359ec96a078a673d7";

export default node;
