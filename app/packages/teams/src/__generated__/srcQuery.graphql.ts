/**
 * @generated SignedSource<<766c6cdeef3599b02624c33b554030b4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
export type srcQuery$variables = {};
export type srcQueryVariables = srcQuery$variables;
export type srcQuery$data = {
  readonly teamsConfig: {
    readonly organization: string;
  };
};
export type srcQueryResponse = srcQuery$data;
export type srcQuery = {
  variables: srcQueryVariables;
  response: srcQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
    {
      alias: null,
      args: null,
      concreteType: "TeamsConfig",
      kind: "LinkedField",
      name: "teamsConfig",
      plural: false,
      selections: [
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "organization",
          storageKey: null,
        },
      ],
      storageKey: null,
    },
  ];
  return {
    fragment: {
      argumentDefinitions: [],
      kind: "Fragment",
      metadata: null,
      name: "srcQuery",
      selections: v0 /*: any*/,
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [],
      kind: "Operation",
      name: "srcQuery",
      selections: v0 /*: any*/,
    },
    params: {
      cacheID: "0a146faaf50b87e73e73b90aca063d7d",
      id: null,
      metadata: {},
      name: "srcQuery",
      operationKind: "query",
      text: "query srcQuery {\n  teamsConfig {\n    organization\n  }\n}\n",
    },
  };
})();

(node as any).hash = "ffc9a55974ae971c33c10a95ccf79af2";

export default node;
