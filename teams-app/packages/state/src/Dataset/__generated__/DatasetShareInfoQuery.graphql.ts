/**
 * @generated SignedSource<<5aef61fe6f58473863b8e1fe35015f8b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type DatasetShareInfoQuery$variables = {
  identifier: string;
  usersLimit: number;
};
export type DatasetShareInfoQuery$data = {
  readonly dataset: {
    readonly collaboratorCount: number;
    readonly defaultPermission: DatasetPermission;
    readonly guestCount: number;
    readonly users: ReadonlyArray<{
      readonly user: {
        readonly id: string;
        readonly name: string;
        readonly picture: string | null;
      };
    }>;
    readonly usersCount: number;
    readonly usersWithSpecialAccessCount: number;
  } | null;
};
export type DatasetShareInfoQuery = {
  response: DatasetShareInfoQuery$data;
  variables: DatasetShareInfoQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "identifier"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "usersLimit"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "identifier",
        "variableName": "identifier"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "dataset",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultPermission",
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
        "alias": "usersWithSpecialAccessCount",
        "args": [
          {
            "kind": "Literal",
            "name": "filter",
            "value": {
              "userPermission": {
                "ne": null
              }
            }
          }
        ],
        "kind": "ScalarField",
        "name": "usersCount",
        "storageKey": "usersCount(filter:{\"userPermission\":{\"ne\":null}})"
      },
      {
        "alias": "guestCount",
        "args": [
          {
            "kind": "Literal",
            "name": "filter",
            "value": {
              "userRole": {
                "eq": "GUEST"
              }
            }
          }
        ],
        "kind": "ScalarField",
        "name": "usersCount",
        "storageKey": "usersCount(filter:{\"userRole\":{\"eq\":\"GUEST\"}})"
      },
      {
        "alias": "collaboratorCount",
        "args": [
          {
            "kind": "Literal",
            "name": "filter",
            "value": {
              "userRole": {
                "eq": "COLLABORATOR"
              }
            }
          }
        ],
        "kind": "ScalarField",
        "name": "usersCount",
        "storageKey": "usersCount(filter:{\"userRole\":{\"eq\":\"COLLABORATOR\"}})"
      },
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "first",
            "variableName": "usersLimit"
          }
        ],
        "concreteType": "DatasetUser",
        "kind": "LinkedField",
        "name": "users",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "user",
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
                "name": "name",
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
    "name": "DatasetShareInfoQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetShareInfoQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "eeba301183139c528915c1ae75bd2822",
    "id": null,
    "metadata": {},
    "name": "DatasetShareInfoQuery",
    "operationKind": "query",
    "text": "query DatasetShareInfoQuery(\n  $identifier: String!\n  $usersLimit: Int!\n) {\n  dataset(identifier: $identifier) {\n    defaultPermission\n    usersCount\n    usersWithSpecialAccessCount: usersCount(filter: {userPermission: {ne: null}})\n    guestCount: usersCount(filter: {userRole: {eq: GUEST}})\n    collaboratorCount: usersCount(filter: {userRole: {eq: COLLABORATOR}})\n    users(first: $usersLimit) {\n      user {\n        id\n        name\n        picture\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "db83880454509365548761e3ac108f5a";

export default node;
