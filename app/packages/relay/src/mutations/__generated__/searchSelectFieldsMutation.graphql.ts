/**
 * @generated SignedSource<<baea2066fdebab43ec0365314966a807>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type searchSelectFieldsMutation$variables = {
  datasetName: string;
  metaFilter?: object | null | undefined;
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
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "searchSelectFieldsMutation",
    "selections": (v1/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Operation",
    "name": "searchSelectFieldsMutation",
    "selections": (v1/*:: as any*/)
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
