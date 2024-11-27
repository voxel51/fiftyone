/**
 * @generated SignedSource<<9b8ed1464314003b55942b13ae077b9e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type runsMarkRunFailedMutation$variables = {
  operationId: string;
};
export type runsMarkRunFailedMutation$data = {
  readonly setDelegatedOperationFailed: {
    readonly id: string;
    readonly runState: string;
  };
};
export type runsMarkRunFailedMutation = {
  response: runsMarkRunFailedMutation$data;
  variables: runsMarkRunFailedMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "operationId"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "operationId",
        "variableName": "operationId"
      }
    ],
    "concreteType": "DelegatedOperation",
    "kind": "LinkedField",
    "name": "setDelegatedOperationFailed",
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
        "name": "runState",
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
    "name": "runsMarkRunFailedMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsMarkRunFailedMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "229b1a87cf002ffc851cace8439c2d8e",
    "id": null,
    "metadata": {},
    "name": "runsMarkRunFailedMutation",
    "operationKind": "mutation",
    "text": "mutation runsMarkRunFailedMutation(\n  $operationId: String!\n) {\n  setDelegatedOperationFailed(operationId: $operationId) {\n    id\n    runState\n  }\n}\n"
  }
};
})();

(node as any).hash = "b816c6fc58e4e48a3da461abd6fdbc8a";

export default node;
