/**
 * @generated SignedSource<<7935ee4aa18a1f891755851de5213a78>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type manageDatasetUsersSuggestionQuery$variables = {
  term: string;
};
export type manageDatasetUsersSuggestionQuery$data = {
  readonly users: ReadonlyArray<{
    readonly email: string;
    readonly id: string;
    readonly name: string;
    readonly picture: string | null;
    readonly role: UserRole;
  }>;
};
export type manageDatasetUsersSuggestionQuery = {
  response: manageDatasetUsersSuggestionQuery$data;
  variables: manageDatasetUsersSuggestionQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "term"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Literal",
        "name": "first",
        "value": 10
      },
      {
        "fields": [
          {
            "kind": "Literal",
            "name": "fields",
            "value": [
              "email",
              "name"
            ]
          },
          {
            "kind": "Variable",
            "name": "term",
            "variableName": "term"
          }
        ],
        "kind": "ObjectValue",
        "name": "search"
      }
    ],
    "concreteType": "User",
    "kind": "LinkedField",
    "name": "users",
    "plural": true,
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
        "name": "email",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "role",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "picture",
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
    "name": "manageDatasetUsersSuggestionQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetUsersSuggestionQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "fad2ca23f23325f852d71c6ce230f518",
    "id": null,
    "metadata": {},
    "name": "manageDatasetUsersSuggestionQuery",
    "operationKind": "query",
    "text": "query manageDatasetUsersSuggestionQuery(\n  $term: String!\n) {\n  users(first: 10, search: {term: $term, fields: [email, name]}) {\n    id\n    email\n    name\n    role\n    picture\n  }\n}\n"
  }
};
})();

(node as any).hash = "f42313e7e26a3370efc48dc9b9961dd8";

export default node;
