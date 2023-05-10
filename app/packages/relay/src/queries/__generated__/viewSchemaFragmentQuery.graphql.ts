/**
 * @generated SignedSource<<396bf154fff49eeb66955d8d3633f2a3>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewSchemaFragmentQuery$variables = {
  name: string;
  viewStages: Array;
};
export type viewSchemaFragmentQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"viewSchemaFragment">;
};
export type viewSchemaFragmentQuery = {
  response: viewSchemaFragmentQuery$data;
  variables: viewSchemaFragmentQuery$variables;
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
    "name": "viewStages"
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "viewSchemaFragmentQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "viewSchemaFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "viewSchemaFragmentQuery",
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "datasetName",
            "variableName": "name"
          },
          {
            "kind": "Variable",
            "name": "viewStages",
            "variableName": "viewStages"
          }
        ],
        "concreteType": "SampleField",
        "kind": "LinkedField",
        "name": "schemaForViewStages",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "path",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "ftype",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "info",
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
            "name": "subfield",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "7d37b0615de67c61c580bc74fd72bd91",
    "id": null,
    "metadata": {},
    "name": "viewSchemaFragmentQuery",
    "operationKind": "query",
    "text": "query viewSchemaFragmentQuery(\n  $name: String!\n  $viewStages: BSONArray!\n) {\n  ...viewSchemaFragment\n}\n\nfragment viewSchemaFragment on Query {\n  schemaForViewStages(datasetName: $name, viewStages: $viewStages) {\n    path\n    ftype\n    info\n    description\n    subfield\n  }\n}\n"
  }
};
})();

(node as any).hash = "b4bad82699d83a881a85521f1be83721";

export default node;
