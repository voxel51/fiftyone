/**
 * @generated SignedSource<<371bf751bf6cc5b86d7da62c92b35879>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type historyOffloadDatasetSnapshotMutation$variables = {
  datasetIdentifier: string;
  snapshotName: string;
};
export type historyOffloadDatasetSnapshotMutation$data = {
  readonly offloadDatasetSnapshot: any | null;
};
export type historyOffloadDatasetSnapshotMutation = {
  response: historyOffloadDatasetSnapshotMutation$data;
  variables: historyOffloadDatasetSnapshotMutation$variables;
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
    "name": "offloadDatasetSnapshot",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "historyOffloadDatasetSnapshotMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "historyOffloadDatasetSnapshotMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "711b8aee4c377b0d433f2b0f7e42572c",
    "id": null,
    "metadata": {},
    "name": "historyOffloadDatasetSnapshotMutation",
    "operationKind": "mutation",
    "text": "mutation historyOffloadDatasetSnapshotMutation(\n  $datasetIdentifier: String!\n  $snapshotName: String!\n) {\n  offloadDatasetSnapshot(datasetIdentifier: $datasetIdentifier, snapshotName: $snapshotName)\n}\n"
  }
};
})();

(node as any).hash = "01d5930f6d1f0fc2ddb7dfa8b6dfb6a4";

export default node;
