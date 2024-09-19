/**
 * @generated SignedSource<<c08582a6421ab2c37f920c195da14216>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type manageDatasetDefaultAccessUsersCountQuery$variables = {
  identifier: string;
};
export type manageDatasetDefaultAccessUsersCountQuery$data = {
  readonly dataset: {
    readonly usersCount: number;
  } | null;
};
export type manageDatasetDefaultAccessUsersCountQuery = {
  response: manageDatasetDefaultAccessUsersCountQuery$data;
  variables: manageDatasetDefaultAccessUsersCountQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "identifier"
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
        "args": [
          {
            "kind": "Literal",
            "name": "filter",
            "value": {
              "userRole": {
                "in": [
                  "ADMIN",
                  "MEMBER"
                ]
              }
            }
          }
        ],
        "kind": "ScalarField",
        "name": "usersCount",
        "storageKey": "usersCount(filter:{\"userRole\":{\"in\":[\"ADMIN\",\"MEMBER\"]}})"
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
    "name": "manageDatasetDefaultAccessUsersCountQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetDefaultAccessUsersCountQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "d8d08ffd104debbed6cf9561b1df495b",
    "id": null,
    "metadata": {},
    "name": "manageDatasetDefaultAccessUsersCountQuery",
    "operationKind": "query",
    "text": "query manageDatasetDefaultAccessUsersCountQuery(\n  $identifier: String!\n) {\n  dataset(identifier: $identifier) {\n    usersCount(filter: {userRole: {in: [ADMIN, MEMBER]}})\n  }\n}\n"
  }
};
})();

(node as any).hash = "e7cee4830ba19077a7a9a6d746620eb1";

export default node;
