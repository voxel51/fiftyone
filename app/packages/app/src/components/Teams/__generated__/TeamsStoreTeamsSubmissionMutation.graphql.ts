/**
 * @generated SignedSource<<970ec59b81cd5feb85840dd314dcc7c8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from "relay-runtime";
export type TeamsStoreTeamsSubmissionMutation$variables = {};
export type TeamsStoreTeamsSubmissionMutation$data = {
  readonly storeTeamsSubmission: boolean;
};
export type TeamsStoreTeamsSubmissionMutation = {
  variables: TeamsStoreTeamsSubmissionMutation$variables;
  response: TeamsStoreTeamsSubmissionMutation$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "storeTeamsSubmission",
      storageKey: null,
    },
  ];
  return {
    fragment: {
      argumentDefinitions: [],
      kind: "Fragment",
      metadata: null,
      name: "TeamsStoreTeamsSubmissionMutation",
      selections: v0 /*: any*/,
      type: "Mutation",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [],
      kind: "Operation",
      name: "TeamsStoreTeamsSubmissionMutation",
      selections: v0 /*: any*/,
    },
    params: {
      cacheID: "65a385a73975d2daf14d156ff5b7ed6a",
      id: null,
      metadata: {},
      name: "TeamsStoreTeamsSubmissionMutation",
      operationKind: "mutation",
      text:
        "mutation TeamsStoreTeamsSubmissionMutation {\n  storeTeamsSubmission\n}\n",
    },
  };
})();

(node as any).hash = "75deb5f0c490b3073749a77128b435e4";

export default node;
