/**
 * @generated SignedSource<<ca5322a4a795355153c28d505e7d15c4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type manageDatasetDefaultAccessInfoQuery$variables = {
  identifier: string;
};
export type manageDatasetDefaultAccessInfoQuery$data = {
  readonly dataset: {
    readonly defaultPermission: DatasetPermission;
    readonly usersCount: number;
  } | null;
};
export type manageDatasetDefaultAccessInfoQuery = {
  response: manageDatasetDefaultAccessInfoQuery$data;
  variables: manageDatasetDefaultAccessInfoQuery$variables;
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
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultPermission",
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
    "name": "manageDatasetDefaultAccessInfoQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetDefaultAccessInfoQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "e4a503408ca7bfc721b2947a8f53b00f",
    "id": null,
    "metadata": {},
    "name": "manageDatasetDefaultAccessInfoQuery",
    "operationKind": "query",
    "text": "query manageDatasetDefaultAccessInfoQuery(\n  $identifier: String!\n) {\n  dataset(identifier: $identifier) {\n    usersCount(filter: {userRole: {in: [ADMIN, MEMBER]}})\n    defaultPermission\n  }\n}\n"
  }
};
})();

(node as any).hash = "0c1b394da89fc11c36705f63aee176b0";

export default node;
