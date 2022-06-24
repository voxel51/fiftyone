/**
 * @generated SignedSource<<90b215b22fe20e97a6ad3d2faa79c962>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
export type srcQuery$variables = {};
export type srcQuery$data = {
  readonly teamsConfig: {
    readonly clientId: string;
    readonly organization: string;
  };
};
export type srcQuery = {
  variables: srcQuery$variables;
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
          name: "clientId",
          storageKey: null,
        },
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
      cacheID: "37b9d4463d8cc0d7fffbcebe86e8dcb5",
      id: null,
      metadata: {},
      name: "srcQuery",
      operationKind: "query",
      text: "query srcQuery {\n  teamsConfig {\n    clientId\n    organization\n  }\n}\n",
    },
  };
})();

(node as any).hash = "af5fc5f4b81d82574dea0f90469f3737";

export default node;
