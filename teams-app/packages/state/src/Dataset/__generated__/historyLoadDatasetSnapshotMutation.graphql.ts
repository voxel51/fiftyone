/**
 * @generated SignedSource<<0f231bfb924e2a18153c3050cd9a5b27>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type historyLoadDatasetSnapshotMutation$variables = {
  datasetIdentifier: string;
  snapshotName: string;
};
export type historyLoadDatasetSnapshotMutation$data = {
  readonly loadDatasetSnapshot: string;
};
export type historyLoadDatasetSnapshotMutation = {
  response: historyLoadDatasetSnapshotMutation$data;
  variables: historyLoadDatasetSnapshotMutation$variables;
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
    "name": "loadDatasetSnapshot",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "historyLoadDatasetSnapshotMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "historyLoadDatasetSnapshotMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "4c931cb9e1a46184a0d9def89fdc624f",
    "id": null,
    "metadata": {},
    "name": "historyLoadDatasetSnapshotMutation",
    "operationKind": "mutation",
    "text": "mutation historyLoadDatasetSnapshotMutation(\n  $datasetIdentifier: String!\n  $snapshotName: String!\n) {\n  loadDatasetSnapshot(datasetIdentifier: $datasetIdentifier, snapshotName: $snapshotName)\n}\n"
  }
};
})();

(node as any).hash = "43bd5276a9a29c66fd16a6b2296b4b04";

export default node;
