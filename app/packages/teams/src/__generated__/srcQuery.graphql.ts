/**
 * @generated SignedSource<<9c343cf4242dab645466e16022a24b04>>
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
    readonly auth0Audience: string;
    readonly auth0ClientId: string;
    readonly auth0Domain: string;
    readonly auth0Organization: string;
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
          name: "auth0Audience",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "auth0ClientId",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "auth0Domain",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "auth0Organization",
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
      cacheID: "64c25842ad17f9de17adde2ac2b50562",
      id: null,
      metadata: {},
      name: "srcQuery",
      operationKind: "query",
      text:
        "query srcQuery {\n  teamsConfig {\n    auth0Audience\n    auth0ClientId\n    auth0Domain\n    auth0Organization\n  }\n}\n",
    },
  };
})();

(node as any).hash = "f358c3d5485b5dd35fc3a475a41e31e1";

export default node;
