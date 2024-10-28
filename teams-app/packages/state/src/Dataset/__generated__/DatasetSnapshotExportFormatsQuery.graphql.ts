/**
 * @generated SignedSource<<880716ddef216648d2b9a468600bf9d7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetSnapshotExportFormatsQuery$variables = {
  datasetIdentifier: string;
  includeMedia: boolean;
  snapshot: string;
};
export type DatasetSnapshotExportFormatsQuery$data = {
  readonly dataset: {
    readonly snapshot: {
      readonly createdAt: string | null;
      readonly createdBy: {
        readonly name: string;
        readonly picture: string | null;
      } | null;
      readonly exportFormats: ReadonlyArray<{
        readonly allowMultiFieldSelect: boolean | null;
        readonly datasetType: string;
        readonly displayName: string;
        readonly frameLabelTypes: ReadonlyArray<string> | null;
        readonly labelTypes: ReadonlyArray<string> | null;
        readonly mediaTypes: ReadonlyArray<string>;
        readonly name: string;
      }>;
      readonly id: string;
      readonly name: string;
    } | null;
  } | null;
};
export type DatasetSnapshotExportFormatsQuery = {
  response: DatasetSnapshotExportFormatsQuery$data;
  variables: DatasetSnapshotExportFormatsQuery$variables;
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
    "name": "includeMedia"
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
                "name": "includeMedia",
                "variableName": "includeMedia"
              }
            ],
            "concreteType": "ExportFormat",
            "kind": "LinkedField",
            "name": "exportFormats",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "displayName",
                "storageKey": null
              },
              (v1/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "datasetType",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "frameLabelTypes",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "labelTypes",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "mediaTypes",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "allowMultiFieldSelect",
                "storageKey": null
              }
            ],
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
    "name": "DatasetSnapshotExportFormatsQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetSnapshotExportFormatsQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "824a1f24435a24f843186873c73d38b2",
    "id": null,
    "metadata": {},
    "name": "DatasetSnapshotExportFormatsQuery",
    "operationKind": "query",
    "text": "query DatasetSnapshotExportFormatsQuery(\n  $datasetIdentifier: String!\n  $includeMedia: Boolean!\n  $snapshot: String!\n) {\n  dataset(identifier: $datasetIdentifier) {\n    snapshot(snapshot: $snapshot) {\n      exportFormats(includeMedia: $includeMedia) {\n        displayName\n        name\n        datasetType\n        frameLabelTypes\n        labelTypes\n        mediaTypes\n        allowMultiFieldSelect\n      }\n      name\n      id\n      createdBy {\n        name\n        picture\n      }\n      createdAt\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "8c8233980027b4730fa2a2e0fea86278";

export default node;
