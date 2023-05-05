/**
 * @generated SignedSource<<c528c6af3406f64cd78c9c6f05f154f4>>
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
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "f49ee74851c69ba66e9f44a401f97ca7",
    "id": null,
    "metadata": {},
    "name": "viewSchemaFragmentQuery",
    "operationKind": "query",
    "text": "query viewSchemaFragmentQuery(\n  $name: String!\n  $viewStages: BSONArray!\n) {\n  ...viewSchemaFragment\n}\n\nfragment viewSchemaFragment on Query {\n  schemaForViewStages(datasetName: $name, viewStages: $viewStages) {\n    path\n    ftype\n    info\n    description\n  }\n}\n"
  }
};
})();

(node as any).hash = "673bea7343f270036bcba960c14919f8";

export default node;
