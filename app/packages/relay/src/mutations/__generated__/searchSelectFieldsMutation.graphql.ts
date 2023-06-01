/**
 * @generated SignedSource<<df98c751611c995dbe42ded64d84fb20>>
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
  readonly searchSelectFields: ReadonlyArray<string>;
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
    "kind": "ScalarField",
    "name": "searchSelectFields",
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
    "cacheID": "563c5fb8729433da04289cddf9fd098d",
    "id": null,
    "metadata": {},
    "name": "searchSelectFieldsMutation",
    "operationKind": "mutation",
    "text": "mutation searchSelectFieldsMutation(\n  $datasetName: String!\n  $metaFilter: JSON = null\n) {\n  searchSelectFields(datasetName: $datasetName, metaFilter: $metaFilter)\n}\n"
  }
};
})();

(node as any).hash = "ef3d8ce2a3313c0632a8b88efaa71b1a";

export default node;
