/**
 * @generated SignedSource<<0befd93c5e70e9594b9caff983ca6e23>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type histogramValuesQuery$variables = {
  dataset: string;
  path: string;
  view: Array;
};
export type histogramValuesQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly __typename: "DatetimeHistogramValuesResponse";
    readonly counts: ReadonlyArray<number>;
    readonly datetimes: ReadonlyArray<any>;
    readonly other: number;
  } | {
    readonly __typename: "FloatHistogramValuesResponse";
    readonly counts: ReadonlyArray<number>;
    readonly floats: ReadonlyArray<number>;
    readonly other: number;
  } | {
    readonly __typename: "IntHistogramValuesResponse";
    readonly counts: ReadonlyArray<number>;
    readonly ints: ReadonlyArray<number>;
    readonly other: number;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  }>;
};
export type histogramValuesQuery = {
  response: histogramValuesQuery$data;
  variables: histogramValuesQuery$variables;
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
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "counts",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "other",
  "storageKey": null
},
v5 = [
  {
    "alias": null,
    "args": [
      {
        "items": [
          {
            "fields": [
              {
                "fields": [
                  {
                    "kind": "Variable",
                    "name": "field",
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
      {
        "kind": "InlineFragment",
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          {
            "alias": "datetimes",
            "args": null,
            "kind": "ScalarField",
            "name": "edges",
            "storageKey": null
          }
        ],
        "type": "DatetimeHistogramValuesResponse",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          {
            "alias": "floats",
            "args": null,
            "kind": "ScalarField",
            "name": "edges",
            "storageKey": null
          }
        ],
        "type": "FloatHistogramValuesResponse",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          {
            "alias": "ints",
            "args": null,
            "kind": "ScalarField",
            "name": "edges",
            "storageKey": null
          }
        ],
        "type": "IntHistogramValuesResponse",
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
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "histogramValuesQuery",
    "selections": (v5/*: any*/),
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
    "name": "histogramValuesQuery",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "58e96351c9319885275f6fb505728296",
    "id": null,
    "metadata": {},
    "name": "histogramValuesQuery",
    "operationKind": "query",
    "text": "query histogramValuesQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{histogramValues: {field: $path}}]) {\n    __typename\n    ... on DatetimeHistogramValuesResponse {\n      counts\n      other\n      datetimes: edges\n    }\n    ... on FloatHistogramValuesResponse {\n      counts\n      other\n      floats: edges\n    }\n    ... on IntHistogramValuesResponse {\n      counts\n      other\n      ints: edges\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "9db4bf0ef140144fdee1d14f8cfe65a0";

export default node;
