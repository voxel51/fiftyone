/**
 * @generated SignedSource<<dd9a61027a0a4aa41e3bff28ddf7f99c>>
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
    readonly name: string;
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
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "name",
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
      cacheID: "99b38d145129882eeaeb35b50bc9409d",
      id: null,
      metadata: {},
      name: "DatasetQuery",
      operationKind: "query",
      text:
        "query DatasetQuery(\n  $name: String!\n) {\n  dataset(name: $name) {\n    id\n    name\n  }\n}\n",
    },
  };
})();

(node as any).hash = "f6b84da24f8261c8966ccf499e931fab";

export default node;
