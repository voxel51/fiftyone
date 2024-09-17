/**
 * @generated SignedSource<<dda01d61052e71d21467c7e479b196f9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type historyCreateSnapshotMutation$variables = {
  datasetIdentifier: string;
  description?: string | null;
  snapshotName: string;
};
export type historyCreateSnapshotMutation$data = {
  readonly createDatasetSnapshot: {
    readonly id: string;
  };
};
export type historyCreateSnapshotMutation = {
  response: historyCreateSnapshotMutation$data;
  variables: historyCreateSnapshotMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetIdentifier"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "snapshotName"
},
v3 = [
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
        "name": "description",
        "variableName": "description"
      },
      {
        "kind": "Variable",
        "name": "snapshotName",
        "variableName": "snapshotName"
      }
    ],
    "concreteType": "DatasetSnapshot",
    "kind": "LinkedField",
    "name": "createDatasetSnapshot",
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
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "historyCreateSnapshotMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "historyCreateSnapshotMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "07743e014b2d14685c4d0cd7f48fb6a0",
    "id": null,
    "metadata": {},
    "name": "historyCreateSnapshotMutation",
    "operationKind": "mutation",
    "text": "mutation historyCreateSnapshotMutation(\n  $datasetIdentifier: String!\n  $snapshotName: String!\n  $description: String\n) {\n  createDatasetSnapshot(datasetIdentifier: $datasetIdentifier, snapshotName: $snapshotName, description: $description) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "74a30bb17a6fd74ac88a19cc54431cd0";

export default node;
