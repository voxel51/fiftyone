/**
 * @generated SignedSource<<5d2114f1b4ad9d7dd02276dd1bb677ef>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type runsPinMutation$variables = {
  operationId: string;
  pinned: boolean;
};
export type runsPinMutation$data = {
  readonly setDelegatedOperationPinned: {
    readonly id: string;
    readonly pinned: boolean | null;
  };
};
export type runsPinMutation = {
  response: runsPinMutation$data;
  variables: runsPinMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "operationId"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "pinned"
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
      },
      {
        "kind": "Variable",
        "name": "pinned",
        "variableName": "pinned"
      }
    ],
    "concreteType": "DelegatedOperation",
    "kind": "LinkedField",
    "name": "setDelegatedOperationPinned",
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
        "name": "pinned",
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
    "name": "runsPinMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsPinMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "d0fdaee3124cd695479204a0066260f0",
    "id": null,
    "metadata": {},
    "name": "runsPinMutation",
    "operationKind": "mutation",
    "text": "mutation runsPinMutation(\n  $operationId: String!\n  $pinned: Boolean!\n) {\n  setDelegatedOperationPinned(operationId: $operationId, pinned: $pinned) {\n    id\n    pinned\n  }\n}\n"
  }
};
})();

(node as any).hash = "4a80af440e989fffb1d50350089f01af";

export default node;
