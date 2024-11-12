/**
 * @generated SignedSource<<5016bdda2b0f35c57bd36c05bb5aeb68>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetSnapshotStatus = "LOADED" | "LOADING" | "UNLOADED" | "%future added value";
export type historySnapshotsConnectionQuery$variables = {
  first: number;
  identifier: string;
};
export type historySnapshotsConnectionQuery$data = {
  readonly dataset: {
    readonly snapshots: ReadonlyArray<{
      readonly createdAt: string | null;
      readonly createdBy: {
        readonly name: string;
        readonly picture: string | null;
      } | null;
      readonly description: string | null;
      readonly id: string;
      readonly linearChangeSummary: {
        readonly numSamplesAdded: number;
        readonly numSamplesChanged: number;
        readonly numSamplesDeleted: number;
        readonly totalSamples: number;
      } | null;
      readonly loadStatus: DatasetSnapshotStatus;
      readonly name: string;
    }>;
  } | null;
};
export type historySnapshotsConnectionQuery = {
  response: historySnapshotsConnectionQuery$data;
  variables: historySnapshotsConnectionQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "first"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "identifier"
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v3 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "identifier",
        "variableName": "identifier"
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
            "name": "first",
            "variableName": "first"
          },
          {
            "kind": "Literal",
            "name": "order",
            "value": {
              "direction": "DESC",
              "field": "createdAt"
            }
          }
        ],
        "concreteType": "DatasetSnapshot",
        "kind": "LinkedField",
        "name": "snapshots",
        "plural": true,
        "selections": [
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
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "createdBy",
            "plural": false,
            "selections": [
              (v2/*: any*/),
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
            "name": "description",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          },
          (v2/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleChangeSummary",
            "kind": "LinkedField",
            "name": "linearChangeSummary",
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
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "historySnapshotsConnectionQuery",
    "selections": (v3/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "historySnapshotsConnectionQuery",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "be7a26e50d883a68a9c49ebdbf51e581",
    "id": null,
    "metadata": {},
    "name": "historySnapshotsConnectionQuery",
    "operationKind": "query",
    "text": "query historySnapshotsConnectionQuery(\n  $identifier: String!\n  $first: Int!\n) {\n  dataset(identifier: $identifier) {\n    snapshots(first: $first, order: {field: createdAt, direction: DESC}) {\n      createdAt\n      createdBy {\n        name\n        picture\n      }\n      description\n      id\n      name\n      linearChangeSummary {\n        numSamplesAdded\n        numSamplesChanged\n        numSamplesDeleted\n        totalSamples\n      }\n      loadStatus\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "6045b77e5fba01ac421400ec0ebbb045";

export default node;
