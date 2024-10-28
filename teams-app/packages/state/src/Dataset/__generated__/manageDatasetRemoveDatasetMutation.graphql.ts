/**
 * @generated SignedSource<<86c9911cd6e181007dc056cac0567095>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type manageDatasetRemoveDatasetMutation$variables = {
  identifier: string;
};
export type manageDatasetRemoveDatasetMutation$data = {
  readonly deleteDataset: any | null;
};
export type manageDatasetRemoveDatasetMutation = {
  response: manageDatasetRemoveDatasetMutation$data;
  variables: manageDatasetRemoveDatasetMutation$variables;
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
    "kind": "ScalarField",
    "name": "deleteDataset",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "manageDatasetRemoveDatasetMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetRemoveDatasetMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "0f47ea88e838c671fc010a20e01df606",
    "id": null,
    "metadata": {},
    "name": "manageDatasetRemoveDatasetMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetRemoveDatasetMutation(\n  $identifier: String!\n) {\n  deleteDataset(identifier: $identifier)\n}\n"
  }
};
})();

(node as any).hash = "cdbe3b1bf77668262d17ad1f6b897672";

export default node;
