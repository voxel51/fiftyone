/**
 * @generated SignedSource<<cc9638f11db95c64afa72200a117b051>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from "relay-runtime";
export type UserInput = {
  email: string;
  familyName: string;
  givenName: string;
  sub: string;
};
export type LoginMutation$variables = {
  user: UserInput;
};
export type LoginMutationVariables = LoginMutation$variables;
export type LoginMutation$data = {
  readonly login: {
    readonly id: string;
  };
};
export type LoginMutationResponse = LoginMutation$data;
export type LoginMutation = {
  variables: LoginMutationVariables;
  response: LoginMutation$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "user",
      },
    ],
    v1 = [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "user",
            variableName: "user",
          },
        ],
        concreteType: "User",
        kind: "LinkedField",
        name: "login",
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
      name: "LoginMutation",
      selections: v1 /*: any*/,
      type: "Mutation",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "LoginMutation",
      selections: v1 /*: any*/,
    },
    params: {
      cacheID: "dc0bd4bb1f30ce2e98eec7c8b3d59474",
      id: null,
      metadata: {},
      name: "LoginMutation",
      operationKind: "mutation",
      text:
        "mutation LoginMutation(\n  $user: UserInput!\n) {\n  login(user: $user) {\n    id\n  }\n}\n",
    },
  };
})();

(node as any).hash = "bde54c8f8a7f48c881892d290cf95380";

export default node;
