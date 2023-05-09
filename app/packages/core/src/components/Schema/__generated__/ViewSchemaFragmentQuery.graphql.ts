/**
 * @generated SignedSource<<dd9ee76e3761eee0ef623a2e0cde0682>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ViewSchemaFragmentQuery$variables = {
  name: string;
  viewStages: Array;
};
export type ViewSchemaFragmentQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"SchemaSettingsViewSchemaFragment">;
};
export type ViewSchemaFragmentQuery = {
  response: ViewSchemaFragmentQuery$data;
  variables: ViewSchemaFragmentQuery$variables;
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
    "name": "ViewSchemaFragmentQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "SchemaSettingsViewSchemaFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "ViewSchemaFragmentQuery",
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
        "kind": "ScalarField",
        "name": "schemaForViewStages",
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "c426862e317eee9ee300836011ce7096",
    "id": null,
    "metadata": {},
    "name": "ViewSchemaFragmentQuery",
    "operationKind": "query",
    "text": "query ViewSchemaFragmentQuery(\n  $name: String!\n  $viewStages: BSONArray!\n) {\n  ...SchemaSettingsViewSchemaFragment\n}\n\nfragment SchemaSettingsViewSchemaFragment on Query {\n  schemaForViewStages(datasetName: $name, viewStages: $viewStages)\n}\n"
  }
};
})();

(node as any).hash = "cb6d4872180060fd4ba56d77a5cce24c";

export default node;
