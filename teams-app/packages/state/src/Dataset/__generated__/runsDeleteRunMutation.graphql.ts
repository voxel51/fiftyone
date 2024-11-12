/**
 * @generated SignedSource<<bed6341c82074ac7dd8f8d1a94b647e0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type runsDeleteRunMutation$variables = {
  operationId: string;
};
export type runsDeleteRunMutation$data = {
  readonly deleteDelegatedOperation: any | null;
};
export type runsDeleteRunMutation = {
  response: runsDeleteRunMutation$data;
  variables: runsDeleteRunMutation$variables;
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
    "kind": "ScalarField",
    "name": "deleteDelegatedOperation",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "runsDeleteRunMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsDeleteRunMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "f289cae76c19509bfb2783bc5500d856",
    "id": null,
    "metadata": {},
    "name": "runsDeleteRunMutation",
    "operationKind": "mutation",
    "text": "mutation runsDeleteRunMutation(\n  $operationId: String!\n) {\n  deleteDelegatedOperation(operationId: $operationId)\n}\n"
  }
};
})();

(node as any).hash = "7f442097fccb18efad6112177f1448b4";

export default node;
