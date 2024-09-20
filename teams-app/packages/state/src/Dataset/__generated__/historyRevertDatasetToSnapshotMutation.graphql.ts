/**
 * @generated SignedSource<<bdaec8e1248869ac3982bdd4e82b87f9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type historyRevertDatasetToSnapshotMutation$variables = {
  datasetIdentifier: string;
  snapshotName: string;
};
export type historyRevertDatasetToSnapshotMutation$data = {
  readonly revertDatasetToSnapshot: {
    readonly id: string;
  };
};
export type historyRevertDatasetToSnapshotMutation = {
  response: historyRevertDatasetToSnapshotMutation$data;
  variables: historyRevertDatasetToSnapshotMutation$variables;
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
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "revertDatasetToSnapshot",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
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
    "name": "historyRevertDatasetToSnapshotMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "historyRevertDatasetToSnapshotMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "f0f1b8d60a9135432d7fb1c3d05a8886",
    "id": null,
    "metadata": {},
    "name": "historyRevertDatasetToSnapshotMutation",
    "operationKind": "mutation",
    "text": "mutation historyRevertDatasetToSnapshotMutation(\n  $datasetIdentifier: String!\n  $snapshotName: String!\n) {\n  revertDatasetToSnapshot(datasetIdentifier: $datasetIdentifier, snapshotName: $snapshotName) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "cee5363fe5b784abab080b802f5b9280";

export default node;
