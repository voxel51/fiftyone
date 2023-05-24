/**
 * @generated SignedSource<<335b8f4c74cd303db10f0c6208e614da>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type Aggregate = {
  count?: Count | null;
  countValues?: CountValues | null;
  histogramValues?: HistogramValues | null;
};
export type Count = {
  field: string;
};
export type CountValues = {
  field: string;
};
export type HistogramValues = {
  field: string;
};
export type aggregateQuery$variables = {
  aggregations: ReadonlyArray<Aggregate>;
  dataset: string;
  view: Array;
};
export type aggregateQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly __typename: "CountResponse";
    readonly count: number;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  }>;
};
export type aggregateQuery = {
  response: aggregateQuery$data;
  variables: aggregateQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "aggregations"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v3 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "aggregations",
        "variableName": "aggregations"
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
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "count",
            "storageKey": null
          }
        ],
        "type": "CountResponse",
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
    "name": "aggregateQuery",
    "selections": (v3/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "aggregateQuery",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "811d48ee6fc58f0fb885944a0d758b25",
    "id": null,
    "metadata": {},
    "name": "aggregateQuery",
    "operationKind": "query",
    "text": "query aggregateQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $aggregations: [Aggregate!]!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: $aggregations) {\n    __typename\n    ... on CountResponse {\n      count\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "a3d8ed59346920bc1ad72c8f6c4cbb98";

export default node;
