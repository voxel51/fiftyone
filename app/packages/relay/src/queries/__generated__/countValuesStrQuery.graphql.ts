/**
 * @generated SignedSource<<284d0af74b25f504f1ca04c254880d3d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type countValuesStrQuery$variables = {
  dataset: string;
  path: string;
  view: Array;
};
export type countValuesStrQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly value: string | null;
    }>;
  }>;
};
export type countValuesStrQuery = {
  response: countValuesStrQuery$data;
  variables: countValuesStrQuery$variables;
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
            "name": "countValues"
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
      "concreteType": "StrValueCount",
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
          "name": "value",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "StrCountValuesResponse",
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
    "name": "countValuesStrQuery",
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
    "name": "countValuesStrQuery",
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
    "cacheID": "19f42a2449419f8f6e4a07fc37e5150a",
    "id": null,
    "metadata": {},
    "name": "countValuesStrQuery",
    "operationKind": "query",
    "text": "query countValuesStrQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{countValues: {path: $path}}]) {\n    __typename\n    ... on StrCountValuesResponse {\n      values {\n        count\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "427c2fb050a346c64a01aea26eab2f1d";

export default node;
