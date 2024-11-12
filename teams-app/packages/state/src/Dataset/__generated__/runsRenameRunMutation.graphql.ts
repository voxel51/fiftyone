/**
 * @generated SignedSource<<53b5eeeb3bc93612d2a6fc774b40f930>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type runsRenameRunMutation$variables = {
  label: string;
  operationId: string;
};
export type runsRenameRunMutation$data = {
  readonly setDelegatedOperationLabel: {
    readonly id: string;
    readonly label: string | null;
  };
};
export type runsRenameRunMutation = {
  response: runsRenameRunMutation$data;
  variables: runsRenameRunMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "label"
  },
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
        "name": "label",
        "variableName": "label"
      },
      {
        "kind": "Variable",
        "name": "operationId",
        "variableName": "operationId"
      }
    ],
    "concreteType": "DelegatedOperation",
    "kind": "LinkedField",
    "name": "setDelegatedOperationLabel",
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
        "name": "label",
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
    "name": "runsRenameRunMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsRenameRunMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "f5f676f899aae760bae5d8afedf03251",
    "id": null,
    "metadata": {},
    "name": "runsRenameRunMutation",
    "operationKind": "mutation",
    "text": "mutation runsRenameRunMutation(\n  $label: String!\n  $operationId: String!\n) {\n  setDelegatedOperationLabel(label: $label, operationId: $operationId) {\n    id\n    label\n  }\n}\n"
  }
};
})();

(node as any).hash = "c5af1936987bee03e2d8c9e4d28a505f";

export default node;
