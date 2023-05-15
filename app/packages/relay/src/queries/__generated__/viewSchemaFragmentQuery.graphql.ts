/**
 * @generated SignedSource<<53e1f2a36751db81d104e98860cb0ca7>>
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
            "name": "subfield",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "embeddedDocType",
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
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "e977c7f98e83df0f47b63b26a056de21",
    "id": null,
    "metadata": {},
    "name": "viewSchemaFragmentQuery",
    "operationKind": "query",
    "text": "query viewSchemaFragmentQuery(\n  $name: String!\n  $viewStages: BSONArray!\n) {\n  ...viewSchemaFragment\n}\n\nfragment viewSchemaFragment on Query {\n  schemaForViewStages(datasetName: $name, viewStages: $viewStages) {\n    path\n    ftype\n    subfield\n    embeddedDocType\n    info\n    description\n  }\n}\n"
  }
};
})();

(node as any).hash = "f0d986e992cfda1ea89e036a79e55e81";

export default node;
