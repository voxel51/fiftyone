/**
 * @generated SignedSource<<ea7090707b551821172fa62691e0d1f0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetSnapshotStatus = "LOADED" | "LOADING" | "UNLOADED" | "%future added value";
export type historySnapshotsQuery$variables = {
  page: number;
  pageSize: number;
  slug: string;
};
export type historySnapshotsQuery$data = {
  readonly dataset: {
    readonly latestChanges: {
      readonly numSamplesAdded: number;
      readonly numSamplesChanged: number;
      readonly numSamplesDeleted: number;
      readonly totalSamples: number;
      readonly updatedAt: string | null;
    } | null;
    readonly snapshotsPage: {
      readonly nodes: ReadonlyArray<{
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
        readonly slug: string;
      }>;
      readonly pageTotal: number;
    };
  } | null;
};
export type historySnapshotsQuery = {
  response: historySnapshotsQuery$data;
  variables: historySnapshotsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "page"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pageSize"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "slug"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "numSamplesAdded",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "numSamplesChanged",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "numSamplesDeleted",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "totalSamples",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v8 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "identifier",
        "variableName": "slug"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "dataset",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "SampleChangeSummary",
        "kind": "LinkedField",
        "name": "latestChanges",
        "plural": false,
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          (v5/*: any*/),
          (v6/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "updatedAt",
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": [
          {
            "kind": "Literal",
            "name": "order",
            "value": {
              "direction": "DESC",
              "field": "createdAt"
            }
          },
          {
            "kind": "Variable",
            "name": "page",
            "variableName": "page"
          },
          {
            "kind": "Variable",
            "name": "pageSize",
            "variableName": "pageSize"
          }
        ],
        "concreteType": "DatasetSnapshotPage",
        "kind": "LinkedField",
        "name": "snapshotsPage",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "pageTotal",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetSnapshot",
            "kind": "LinkedField",
            "name": "nodes",
            "plural": true,
            "selections": [
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
                "kind": "ScalarField",
                "name": "description",
                "storageKey": null
              },
              (v7/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "slug",
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
                "concreteType": "User",
                "kind": "LinkedField",
                "name": "createdBy",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "picture",
                    "storageKey": null
                  },
                  (v7/*: any*/)
                ],
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": "SampleChangeSummary",
                "kind": "LinkedField",
                "name": "linearChangeSummary",
                "plural": false,
                "selections": [
                  (v3/*: any*/),
                  (v4/*: any*/),
                  (v5/*: any*/),
                  (v6/*: any*/)
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
    "name": "historySnapshotsQuery",
    "selections": (v8/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "historySnapshotsQuery",
    "selections": (v8/*: any*/)
  },
  "params": {
    "cacheID": "208261ef4ed7ee47b2231b561d051fc3",
    "id": null,
    "metadata": {},
    "name": "historySnapshotsQuery",
    "operationKind": "query",
    "text": "query historySnapshotsQuery(\n  $slug: String!\n  $pageSize: Int!\n  $page: Int!\n) {\n  dataset(identifier: $slug) {\n    latestChanges {\n      numSamplesAdded\n      numSamplesChanged\n      numSamplesDeleted\n      totalSamples\n      updatedAt\n    }\n    snapshotsPage(pageSize: $pageSize, page: $page, order: {field: createdAt, direction: DESC}) {\n      pageTotal\n      nodes {\n        id\n        description\n        name\n        slug\n        createdAt\n        createdBy {\n          picture\n          name\n        }\n        linearChangeSummary {\n          numSamplesAdded\n          numSamplesChanged\n          numSamplesDeleted\n          totalSamples\n        }\n        loadStatus\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "154825c2cca2dcc216e0c91af087f922";

export default node;
