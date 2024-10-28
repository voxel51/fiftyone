/**
 * @generated SignedSource<<4331fa6c8a8d4c60d6b096f1b237fab7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetSnapshotStatus = "LOADED" | "LOADING" | "UNLOADED" | "%future added value";
export type historySnapshotQuery$variables = {
  dataset: string;
  snapshot: string;
};
export type historySnapshotQuery$data = {
  readonly dataset: {
    readonly snapshot: {
      readonly createdAt: string | null;
      readonly createdBy: {
        readonly name: string;
        readonly picture: string | null;
      } | null;
      readonly id: string;
      readonly loadStatus: DatasetSnapshotStatus;
      readonly name: string;
    } | null;
  } | null;
};
export type historySnapshotQuery = {
  response: historySnapshotQuery$data;
  variables: historySnapshotQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "dataset"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "snapshot"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "identifier",
        "variableName": "dataset"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "dataset",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "snapshot",
            "variableName": "snapshot"
          }
        ],
        "concreteType": "DatasetSnapshot",
        "kind": "LinkedField",
        "name": "snapshot",
        "plural": false,
        "selections": [
          (v1/*: any*/),
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
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "createdBy",
            "plural": false,
            "selections": [
              (v1/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "picture",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "createdAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "loadStatus",
            "storageKey": null
          }
        ],
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
    "name": "historySnapshotQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "historySnapshotQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "463f065a6753ac21f905056174664b9b",
    "id": null,
    "metadata": {},
    "name": "historySnapshotQuery",
    "operationKind": "query",
    "text": "query historySnapshotQuery(\n  $dataset: String!\n  $snapshot: String!\n) {\n  dataset(identifier: $dataset) {\n    snapshot(snapshot: $snapshot) {\n      name\n      id\n      createdBy {\n        name\n        picture\n      }\n      createdAt\n      loadStatus\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "59dce2f93d60f3c5ea6f9d43b0fff1ec";

export default node;
