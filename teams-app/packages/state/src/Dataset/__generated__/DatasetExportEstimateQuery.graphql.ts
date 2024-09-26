/**
 * @generated SignedSource<<9546115a97cdfec1d3cda550cd9abec6>>
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
export type DatasetExportEstimateQuery$variables = {
  datasetIdentifier: string;
  fields?: ReadonlyArray<string> | null;
  includeMedia?: boolean | null;
  viewSelectors: ViewSelectors;
};
export type DatasetExportEstimateQuery$data = {
  readonly dataset: {
    readonly sizeEstimate: number | null;
  } | null;
};
export type DatasetExportEstimateQuery = {
  response: DatasetExportEstimateQuery$data;
  variables: DatasetExportEstimateQuery$variables;
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
  "name": "viewSelectors"
},
v4 = [
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
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetExportEstimateQuery",
    "selections": (v4/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v3/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetExportEstimateQuery",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "d4a4db73f9dc4fae3cbed67d2d248d8d",
    "id": null,
    "metadata": {},
    "name": "DatasetExportEstimateQuery",
    "operationKind": "query",
    "text": "query DatasetExportEstimateQuery(\n  $datasetIdentifier: String!\n  $viewSelectors: ViewSelectors!\n  $fields: [String!]\n  $includeMedia: Boolean\n) {\n  dataset(identifier: $datasetIdentifier) {\n    sizeEstimate(viewSelectors: $viewSelectors, fields: $fields, includeMedia: $includeMedia)\n  }\n}\n"
  }
};
})();

(node as any).hash = "37bf4ee6c28f107825df44d13b5e9d4f";

export default node;
