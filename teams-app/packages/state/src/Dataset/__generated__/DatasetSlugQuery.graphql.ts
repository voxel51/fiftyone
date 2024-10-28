/**
 * @generated SignedSource<<b4ec9c331bb18b29d8f3031af1d4101a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetSlugQuery$variables = {
  name: string;
  skip: boolean;
};
export type DatasetSlugQuery$data = {
  readonly datasetSlug?: {
    readonly available: boolean;
    readonly slug: string;
  };
};
export type DatasetSlugQuery = {
  response: DatasetSlugQuery$data;
  variables: DatasetSlugQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "name"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "skip"
  }
],
v1 = [
  {
    "condition": "skip",
    "kind": "Condition",
    "passingValue": false,
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "name",
            "variableName": "name"
          }
        ],
        "concreteType": "DatasetSlug",
        "kind": "LinkedField",
        "name": "datasetSlug",
        "plural": false,
        "selections": [
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
            "name": "available",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetSlugQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetSlugQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "9de072d2133a7dd4c9203afe0d25dd92",
    "id": null,
    "metadata": {},
    "name": "DatasetSlugQuery",
    "operationKind": "query",
    "text": "query DatasetSlugQuery(\n  $name: String!\n  $skip: Boolean!\n) {\n  datasetSlug(name: $name) @skip(if: $skip) {\n    slug\n    available\n  }\n}\n"
  }
};
})();

(node as any).hash = "b4976073ce540768b744a8287d33a557";

export default node;
