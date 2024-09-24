/**
 * @generated SignedSource<<28f8f7b7ba638c297fa95d68ad295599>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type historyDeleteSnapshotMutation$variables = {
  datasetIdentifier: string;
  snapshotName: string;
};
export type historyDeleteSnapshotMutation$data = {
  readonly deleteDatasetSnapshot: any | null;
};
export type historyDeleteSnapshotMutation = {
  response: historyDeleteSnapshotMutation$data;
  variables: historyDeleteSnapshotMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "datasetIdentifier"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "snapshotName"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "datasetIdentifier",
        "variableName": "datasetIdentifier"
      },
      {
        "kind": "Variable",
        "name": "snapshotName",
        "variableName": "snapshotName"
      }
    ],
    "kind": "ScalarField",
    "name": "deleteDatasetSnapshot",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "historyDeleteSnapshotMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "historyDeleteSnapshotMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "1cb3fe4b42767aaec9ee96c934fe97dd",
    "id": null,
    "metadata": {},
    "name": "historyDeleteSnapshotMutation",
    "operationKind": "mutation",
    "text": "mutation historyDeleteSnapshotMutation(\n  $datasetIdentifier: String!\n  $snapshotName: String!\n) {\n  deleteDatasetSnapshot(datasetIdentifier: $datasetIdentifier, snapshotName: $snapshotName)\n}\n"
  }
};
})();

(node as any).hash = "a7d15bb2e72df19eca4a9ba8353ca32c";

export default node;
