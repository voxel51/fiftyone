/**
 * @generated SignedSource<<b789681b1458cfb29c3aadf019811a2e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
export type DatasetQuery$variables = {
  name: string;
};
export type DatasetQueryVariables = DatasetQuery$variables;
export type DatasetQuery$data = {
  readonly dataset: {
    readonly id: string;
  };
};
export type DatasetQueryResponse = DatasetQuery$data;
export type DatasetQuery = {
  variables: DatasetQueryVariables;
  response: DatasetQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "name",
      },
    ],
    v1 = [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "name",
            variableName: "name",
          },
        ],
        concreteType: "Dataset",
        kind: "LinkedField",
        name: "dataset",
        plural: false,
        selections: [
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "id",
            storageKey: null,
          },
        ],
        storageKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "DatasetQuery",
      selections: v1 /*: any*/,
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "DatasetQuery",
      selections: v1 /*: any*/,
    },
    params: {
      cacheID: "d6f65d7d2c33ba00ef7f377d3e9ef46a",
      id: null,
      metadata: {},
      name: "DatasetQuery",
      operationKind: "query",
      text:
        "query DatasetQuery(\n  $name: String!\n) {\n  dataset(name: $name) {\n    id\n  }\n}\n",
    },
  };
})();

(node as any).hash = "2f1c3c34fbff87b4d69546f57ee1b8d6";

export default node;
