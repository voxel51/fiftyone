/**
 * @generated SignedSource<<1726c01a8d2647734b54fb40e8856760>>
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
    readonly audience: string;
    readonly clientId: string;
    readonly domain: string;
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
          name: "audience",
          storageKey: null,
        },
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
          name: "domain",
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
      cacheID: "49db0f6a4ac5136f46f65ba4a40dd3b7",
      id: null,
      metadata: {},
      name: "srcQuery",
      operationKind: "query",
      text: "query srcQuery {\n  teamsConfig {\n    audience\n    clientId\n    domain\n    organization\n  }\n}\n",
    },
  };
})();

(node as any).hash = "a6d13645bfc662302a031e204e535058";

export default node;
