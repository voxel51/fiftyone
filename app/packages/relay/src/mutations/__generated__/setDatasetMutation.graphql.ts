/**
 * @generated SignedSource<<64dc42978810a57aebdcb1e6729518b4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from "relay-runtime";
export type setDatasetMutation$variables = {
  name?: string | null;
  session?: string | null;
  subscription: string;
};
export type setDatasetMutation$data = {
  readonly setDataset: boolean;
};
export type setDatasetMutation = {
  response: setDatasetMutation$data;
  variables: setDatasetMutation$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "name",
    },
    v1 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "session",
    },
    v2 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "subscription",
    },
    v3 = [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "name",
            variableName: "name",
          },
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
        ],
        kind: "ScalarField",
        name: "setDataset",
        storageKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: [v0 /*: any*/, v1 /*: any*/, v2 /*: any*/],
      kind: "Fragment",
      metadata: null,
      name: "setDatasetMutation",
      selections: v3 /*: any*/,
      type: "Mutation",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [v2 /*: any*/, v1 /*: any*/, v0 /*: any*/],
      kind: "Operation",
      name: "setDatasetMutation",
      selections: v3 /*: any*/,
    },
    params: {
      cacheID: "f3cdf3dc95b6a967d5734cd2e25ae04d",
      id: null,
      metadata: {},
      name: "setDatasetMutation",
      operationKind: "mutation",
      text: "mutation setDatasetMutation(\n  $subscription: String!\n  $session: String\n  $name: String\n) {\n  setDataset(subscription: $subscription, session: $session, name: $name)\n}\n",
    },
  };
})();

(node as any).hash = "321f49f2b80ef0d0170c5038fe79bba5";

export default node;
