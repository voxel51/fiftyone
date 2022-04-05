/**
 * @generated SignedSource<<a6570360bd1796511f7f17e8c14c2544>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
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
    readonly familyName: string;
  };
};
export type LoginMutationResponse = LoginMutation$data;
export type LoginMutation = {
  variables: LoginMutationVariables;
  response: LoginMutation$data;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "user"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "user",
        "variableName": "user"
      }
    ],
    "concreteType": "User",
    "kind": "LinkedField",
    "name": "login",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "familyName",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "LoginMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "LoginMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "7c01549097494e70a5ac63730c3b9fa4",
    "id": null,
    "metadata": {},
    "name": "LoginMutation",
    "operationKind": "mutation",
    "text": "mutation LoginMutation(\n  $user: UserInput!\n) {\n  login(user: $user) {\n    id\n    familyName\n  }\n}\n"
  }
};
})();

(node as any).hash = "692af5083699c56301066312c7858b01";

export default node;
