/**
 * @generated SignedSource<<f9d9bd548c4c64551412b575327311a4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from "relay-runtime";
export type setViewMutation$variables = {
  subscription: string;
  session?: string | null;
  view: Array;
};
export type setViewMutation$data = {
  readonly setView: Array;
};
export type setViewMutation = {
  variables: setViewMutation$variables;
  response: setViewMutation$data;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "session",
    },
    v1 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "subscription",
    },
    v2 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "view",
    },
    v3 = [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "session",
            variableName: "session",
          },
          {
            kind: "Variable",
            name: "subscription",
            variableName: "subscription",
          },
          {
            kind: "Variable",
            name: "view",
            variableName: "view",
          },
        ],
        kind: "ScalarField",
        name: "setView",
        storageKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: [v0 /*: any*/, v1 /*: any*/, v2 /*: any*/],
      kind: "Fragment",
      metadata: null,
      name: "setViewMutation",
      selections: v3 /*: any*/,
      type: "Mutation",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [v1 /*: any*/, v0 /*: any*/, v2 /*: any*/],
      kind: "Operation",
      name: "setViewMutation",
      selections: v3 /*: any*/,
    },
    params: {
      cacheID: "ebd4ae2f8049ae46c130e84395ed49ff",
      id: null,
      metadata: {},
      name: "setViewMutation",
      operationKind: "mutation",
      text:
        "mutation setViewMutation(\n  $subscription: String!\n  $session: String\n  $view: JSONArray!\n) {\n  setView(subscription: $subscription, session: $session, view: $view)\n}\n",
    },
  };
})();

(node as any).hash = "562228647c607003fb32255514b2a371";

export default node;
