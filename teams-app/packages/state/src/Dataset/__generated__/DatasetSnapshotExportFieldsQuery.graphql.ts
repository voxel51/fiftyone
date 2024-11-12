/**
 * @generated SignedSource<<02422c61e52dd5ec9dcf7b49d7591ee2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetSnapshotExportFieldsQuery$variables = {
  datasetIdentifier: string;
  exportFormat: string;
  snapshot: string;
};
export type DatasetSnapshotExportFieldsQuery$data = {
  readonly dataset: {
    readonly snapshot: {
      readonly createdAt: string | null;
      readonly createdBy: {
        readonly name: string;
        readonly picture: string | null;
      } | null;
      readonly exportFields: ReadonlyArray<string>;
      readonly id: string;
      readonly name: string;
    } | null;
  } | null;
};
export type DatasetSnapshotExportFieldsQuery = {
  response: DatasetSnapshotExportFieldsQuery$data;
  variables: DatasetSnapshotExportFieldsQuery$variables;
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
    "name": "exportFormat"
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
        "variableName": "datasetIdentifier"
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
          {
            "alias": null,
            "args": [
              {
                "kind": "Variable",
                "name": "exportFormat",
                "variableName": "exportFormat"
              }
            ],
            "kind": "ScalarField",
            "name": "exportFields",
            "storageKey": null
          },
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
    "name": "DatasetSnapshotExportFieldsQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetSnapshotExportFieldsQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "2de044c119e3cf20fbfb36f50c7127b5",
    "id": null,
    "metadata": {},
    "name": "DatasetSnapshotExportFieldsQuery",
    "operationKind": "query",
    "text": "query DatasetSnapshotExportFieldsQuery(\n  $datasetIdentifier: String!\n  $exportFormat: String!\n  $snapshot: String!\n) {\n  dataset(identifier: $datasetIdentifier) {\n    snapshot(snapshot: $snapshot) {\n      exportFields(exportFormat: $exportFormat)\n      name\n      id\n      createdBy {\n        name\n        picture\n      }\n      createdAt\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "9ecc5ab4e37ae2df20644efe331c905f";

export default node;
