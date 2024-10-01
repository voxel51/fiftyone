/**
 * @generated SignedSource<<413a693cdbf9f40ba2c10cb8d3340dbd>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type ViewSelectors = {
  filters?: any | null;
  sampleIds?: ReadonlyArray<string> | null;
  viewStages?: any | null;
};
export type DatasetSnapshotExportEstimateQuery$variables = {
  datasetIdentifier: string;
  fields?: ReadonlyArray<string> | null;
  includeMedia?: boolean | null;
  snapshot: string;
  viewSelectors: ViewSelectors;
};
export type DatasetSnapshotExportEstimateQuery$data = {
  readonly dataset: {
    readonly snapshot: {
      readonly createdAt: string | null;
      readonly createdBy: {
        readonly name: string;
        readonly picture: string | null;
      } | null;
      readonly id: string;
      readonly name: string;
      readonly sizeEstimate: number | null;
    } | null;
  } | null;
};
export type DatasetSnapshotExportEstimateQuery = {
  response: DatasetSnapshotExportEstimateQuery$data;
  variables: DatasetSnapshotExportEstimateQuery$variables;
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
  "name": "fields"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "includeMedia"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "snapshot"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewSelectors"
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v6 = [
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
                "name": "fields",
                "variableName": "fields"
              },
              {
                "kind": "Variable",
                "name": "includeMedia",
                "variableName": "includeMedia"
              },
              {
                "kind": "Variable",
                "name": "viewSelectors",
                "variableName": "viewSelectors"
              }
            ],
            "kind": "ScalarField",
            "name": "sizeEstimate",
            "storageKey": null
          },
          (v5/*: any*/),
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
              (v5/*: any*/),
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
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetSnapshotExportEstimateQuery",
    "selections": (v6/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v4/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetSnapshotExportEstimateQuery",
    "selections": (v6/*: any*/)
  },
  "params": {
    "cacheID": "388687ddeb827c15de10ffe378f23127",
    "id": null,
    "metadata": {},
    "name": "DatasetSnapshotExportEstimateQuery",
    "operationKind": "query",
    "text": "query DatasetSnapshotExportEstimateQuery(\n  $datasetIdentifier: String!\n  $viewSelectors: ViewSelectors!\n  $fields: [String!]\n  $includeMedia: Boolean\n  $snapshot: String!\n) {\n  dataset(identifier: $datasetIdentifier) {\n    snapshot(snapshot: $snapshot) {\n      sizeEstimate(viewSelectors: $viewSelectors, fields: $fields, includeMedia: $includeMedia)\n      name\n      id\n      createdBy {\n        name\n        picture\n      }\n      createdAt\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "03bbb59ee058df5e000b291f3e7c2cdc";

export default node;
