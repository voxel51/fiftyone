/**
 * @generated SignedSource<<8521e36d908eb6b4ad64bad4710862f5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type teamUserQuery$variables = {
  userId: string;
};
export type teamUserQuery$data = {
  readonly user: {
    readonly datasetsCount: number;
    readonly email: string;
    readonly name: string;
    readonly picture: string | null;
  } | null;
};
export type teamUserQuery = {
  response: teamUserQuery$data;
  variables: teamUserQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "userId"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "id",
        "variableName": "userId"
      }
    ],
    "concreteType": "User",
    "kind": "LinkedField",
    "name": "user",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "datasetsCount",
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
    "name": "teamUserQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "teamUserQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "c2af78a6f4fcb3d6923ae6503358ac2f",
    "id": null,
    "metadata": {},
    "name": "teamUserQuery",
    "operationKind": "query",
    "text": "query teamUserQuery(\n  $userId: String!\n) {\n  user(id: $userId) {\n    datasetsCount\n    email\n    name\n    picture\n  }\n}\n"
  }
};
})();

(node as any).hash = "e80fe3f78bc0b79ca0ecb164135acd7e";

export default node;
