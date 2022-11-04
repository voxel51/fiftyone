/**
 * @generated SignedSource<<d705fb4e0cd5d469ea3841c8bb36113e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type countValuesIntQuery$variables = {
  dataset: string;
  path: string;
  view: Array;
};
export type countValuesIntQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly value: number | null;
    }>;
  }>;
};
export type countValuesIntQuery = {
  response: countValuesIntQuery$data;
  variables: countValuesIntQuery$variables;
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
      "concreteType": "IntValueCount",
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
  "type": "IntCountValuesResponse",
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
    "name": "countValuesIntQuery",
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
    "name": "countValuesIntQuery",
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
    "cacheID": "d9baf2516e2c072f756e77b29eadb436",
    "id": null,
    "metadata": {},
    "name": "countValuesIntQuery",
    "operationKind": "query",
    "text": "query countValuesIntQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{countValues: {path: $path}}]) {\n    __typename\n    ... on IntCountValuesResponse {\n      values {\n        count\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "e2229043d4a56064d7988892539b6c12";

export default node;
