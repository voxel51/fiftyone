/**
 * @generated SignedSource<<9f394a1f73d31a34f7ac54327d672871>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetExportFormatsQuery$variables = {
  datasetIdentifier: string;
  includeMedia: boolean;
};
export type DatasetExportFormatsQuery$data = {
  readonly dataset: {
    readonly exportFormats: ReadonlyArray<{
      readonly allowMultiFieldSelect: boolean | null;
      readonly datasetType: string;
      readonly displayName: string;
      readonly frameLabelTypes: ReadonlyArray<string> | null;
      readonly labelTypes: ReadonlyArray<string> | null;
      readonly mediaTypes: ReadonlyArray<string>;
      readonly name: string;
    }>;
  } | null;
};
export type DatasetExportFormatsQuery = {
  response: DatasetExportFormatsQuery$data;
  variables: DatasetExportFormatsQuery$variables;
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
  }
],
v1 = [
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
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "name",
            "storageKey": null
          },
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
    "name": "DatasetExportFormatsQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetExportFormatsQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "bd9b9bca2247f7f41c06c4dd8ee66d7a",
    "id": null,
    "metadata": {},
    "name": "DatasetExportFormatsQuery",
    "operationKind": "query",
    "text": "query DatasetExportFormatsQuery(\n  $datasetIdentifier: String!\n  $includeMedia: Boolean!\n) {\n  dataset(identifier: $datasetIdentifier) {\n    exportFormats(includeMedia: $includeMedia) {\n      displayName\n      name\n      datasetType\n      frameLabelTypes\n      labelTypes\n      mediaTypes\n      allowMultiFieldSelect\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "bf7bb470a1043ced69ec7701166c74ad";

export default node;
