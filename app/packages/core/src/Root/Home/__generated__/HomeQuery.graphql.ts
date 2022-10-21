/**
 * @generated SignedSource<<a0a5f415320da4dd8bf4f7421e508847>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
export type HomeQuery$variables = {};
export type HomeQueryVariables = HomeQuery$variables;
export type HomeQuery$data = {
  readonly version: string;
};
export type HomeQueryResponse = HomeQuery$data;
export type HomeQuery = {
  variables: HomeQueryVariables;
  response: HomeQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "version",
      storageKey: null,
    },
  ];
  return {
    fragment: {
      argumentDefinitions: [],
      kind: "Fragment",
      metadata: null,
      name: "HomeQuery",
      selections: v0 /*: any*/,
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [],
      kind: "Operation",
      name: "HomeQuery",
      selections: v0 /*: any*/,
    },
    params: {
      cacheID: "74d9aebf903f5b5f8303a4dc81267a7a",
      id: null,
      metadata: {},
      name: "HomeQuery",
      operationKind: "query",
      text: "query HomeQuery {\n  version\n}\n",
    },
  };
})();

(node as any).hash = "9122a6a2968b55b47c6381997730a64b";

export default node;
