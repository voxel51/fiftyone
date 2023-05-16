/**
 * @generated SignedSource<<ce66a186bc81ad6e60fb7e27afd5e6f3>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type searchSelectFieldsMutation$variables = {
  datasetName: string;
  metaFilter?: object | null;
};
export type searchSelectFieldsMutation$data = {
  readonly searchSelectFields: ReadonlyArray<{
    readonly path: string;
  }>;
};
export type searchSelectFieldsMutation = {
  response: searchSelectFieldsMutation$data;
  variables: searchSelectFieldsMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "datasetName"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "metaFilter"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "datasetName",
        "variableName": "datasetName"
      },
      {
        "kind": "Variable",
        "name": "metaFilter",
        "variableName": "metaFilter"
      }
    ],
    "concreteType": "SampleField",
    "kind": "LinkedField",
    "name": "searchSelectFields",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "path",
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
    "name": "searchSelectFieldsMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "searchSelectFieldsMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "1eaeda342a4af68822fa0cf50597efbe",
    "id": null,
    "metadata": {},
    "name": "searchSelectFieldsMutation",
    "operationKind": "mutation",
    "text": "mutation searchSelectFieldsMutation(\n  $datasetName: String!\n  $metaFilter: JSON = null\n) {\n  searchSelectFields(datasetName: $datasetName, metaFilter: $metaFilter) {\n    path\n  }\n}\n"
  }
};
})();

(node as any).hash = "7509f7695fcde68a5b04b389f16164a6";

export default node;
