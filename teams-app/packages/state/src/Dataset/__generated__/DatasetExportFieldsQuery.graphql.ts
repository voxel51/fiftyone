/**
 * @generated SignedSource<<70d45aa076172c4a2e91a9f38da99948>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetExportFieldsQuery$variables = {
  datasetIdentifier: string;
  exportFormat: string;
};
export type DatasetExportFieldsQuery$data = {
  readonly dataset: {
    readonly exportFields: ReadonlyArray<string>;
  } | null;
};
export type DatasetExportFieldsQuery = {
  response: DatasetExportFieldsQuery$data;
  variables: DatasetExportFieldsQuery$variables;
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
            "name": "exportFormat",
            "variableName": "exportFormat"
          }
        ],
        "kind": "ScalarField",
        "name": "exportFields",
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
    "name": "DatasetExportFieldsQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetExportFieldsQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "de7c0e1a974d4d54d82ffd77edcc709a",
    "id": null,
    "metadata": {},
    "name": "DatasetExportFieldsQuery",
    "operationKind": "query",
    "text": "query DatasetExportFieldsQuery(\n  $datasetIdentifier: String!\n  $exportFormat: String!\n) {\n  dataset(identifier: $datasetIdentifier) {\n    exportFields(exportFormat: $exportFormat)\n  }\n}\n"
  }
};
})();

(node as any).hash = "046f7cd7602588793bd8377cb3003a4a";

export default node;
