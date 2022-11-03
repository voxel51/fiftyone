/**
 * @generated SignedSource<<ec74dff4ac27c12aff3baadd7ee26194>>
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
  readonly countValues: {
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly value: number | null;
    }>;
  };
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
        "name": "countValues",
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
    "name": "countValuesIntQuery",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "countValues",
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
    "cacheID": "f870008fade2edeff8f32b165a024d26",
    "id": null,
    "metadata": {},
    "name": "countValuesIntQuery",
    "operationKind": "query",
    "text": "query countValuesIntQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  countValues(datasetName: $dataset, view: $view, path: $path) {\n    __typename\n    ... on IntCountValuesResponse {\n      values {\n        count\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "545ddfcb86507ae4a29ed2da0f96286a";

export default node;
