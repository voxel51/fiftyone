/**
 * @generated SignedSource<<cb2657c8a52f1bdc2ddae608f6bf3af1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type historyCalculateDatasetLatestChangesMutation$variables = {
  datasetIdentifier: string;
};
export type historyCalculateDatasetLatestChangesMutation$data = {
  readonly calculateDatasetLatestChanges: {
    readonly numSamplesAdded: number;
    readonly numSamplesChanged: number;
    readonly numSamplesDeleted: number;
    readonly totalSamples: number;
  } | null;
};
export type historyCalculateDatasetLatestChangesMutation = {
  response: historyCalculateDatasetLatestChangesMutation$data;
  variables: historyCalculateDatasetLatestChangesMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "datasetIdentifier"
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
      }
    ],
    "concreteType": "SampleChangeSummary",
    "kind": "LinkedField",
    "name": "calculateDatasetLatestChanges",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "numSamplesAdded",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "numSamplesChanged",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "numSamplesDeleted",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "totalSamples",
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
    "name": "historyCalculateDatasetLatestChangesMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "historyCalculateDatasetLatestChangesMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "f282e452ccb6c6f0e87fc393c98dc84d",
    "id": null,
    "metadata": {},
    "name": "historyCalculateDatasetLatestChangesMutation",
    "operationKind": "mutation",
    "text": "mutation historyCalculateDatasetLatestChangesMutation(\n  $datasetIdentifier: String!\n) {\n  calculateDatasetLatestChanges(datasetIdentifier: $datasetIdentifier) {\n    numSamplesAdded\n    numSamplesChanged\n    numSamplesDeleted\n    totalSamples\n  }\n}\n"
  }
};
})();

(node as any).hash = "3edb6194cfa943719a73f532c9b41046";

export default node;
