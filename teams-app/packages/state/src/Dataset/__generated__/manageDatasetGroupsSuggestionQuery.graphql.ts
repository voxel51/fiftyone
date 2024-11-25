/**
 * @generated SignedSource<<411ec5f8c0d31524546e659b679603d9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type manageDatasetGroupsSuggestionQuery$variables = {
  term: string;
};
export type manageDatasetGroupsSuggestionQuery$data = {
  readonly userGroups: ReadonlyArray<{
    readonly description: string | null;
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly users: ReadonlyArray<{
      readonly email: string;
      readonly id: string;
      readonly name: string;
      readonly role: UserRole;
    }>;
    readonly usersCount: number;
  }>;
};
export type manageDatasetGroupsSuggestionQuery = {
  response: manageDatasetGroupsSuggestionQuery$data;
  variables: manageDatasetGroupsSuggestionQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "term"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v3 = [
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
              "name",
              "slug"
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
    "concreteType": "UserGroup",
    "kind": "LinkedField",
    "name": "userGroups",
    "plural": true,
    "selections": [
      (v1/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "slug",
        "storageKey": null
      },
      (v2/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "usersCount",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "users",
        "plural": true,
        "selections": [
          (v1/*: any*/),
          (v2/*: any*/),
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
            "name": "role",
            "storageKey": null
          }
        ],
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
    "name": "manageDatasetGroupsSuggestionQuery",
    "selections": (v3/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetGroupsSuggestionQuery",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "1819da2d0dd2f251884753d9e50f31b7",
    "id": null,
    "metadata": {},
    "name": "manageDatasetGroupsSuggestionQuery",
    "operationKind": "query",
    "text": "query manageDatasetGroupsSuggestionQuery(\n  $term: String!\n) {\n  userGroups(first: 10, search: {term: $term, fields: [name, slug]}) {\n    id\n    slug\n    name\n    description\n    usersCount\n    users {\n      id\n      name\n      email\n      role\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "2899448e3404ec82734fd1c0cc9ed1df";

export default node;
