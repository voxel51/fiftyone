/**
 * @generated SignedSource<<0cde7695d9022c2ce06b613c3fb683e1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetsPinnedQuery$variables = {};
export type DatasetsPinnedQuery$data = {
  readonly datasets: ReadonlyArray<{
    readonly name: string;
    readonly samplesCount: number;
  }>;
};
export type DatasetsPinnedQuery = {
  response: DatasetsPinnedQuery$data;
  variables: DatasetsPinnedQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Literal",
        "name": "filter",
        "value": {
          "userPinned": true
        }
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "datasets",
    "plural": true,
    "selections": [
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
        "name": "samplesCount",
        "storageKey": null
      }
    ],
    "storageKey": "datasets(filter:{\"userPinned\":true})"
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetsPinnedQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "DatasetsPinnedQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "2caccb7377e10b2c80e7de592c594c2c",
    "id": null,
    "metadata": {},
    "name": "DatasetsPinnedQuery",
    "operationKind": "query",
    "text": "query DatasetsPinnedQuery {\n  datasets(filter: {userPinned: true}) {\n    name\n    samplesCount\n  }\n}\n"
  }
};
})();

(node as any).hash = "1b070c6c3a9d7e793cb6a0546e7844bc";

export default node;
