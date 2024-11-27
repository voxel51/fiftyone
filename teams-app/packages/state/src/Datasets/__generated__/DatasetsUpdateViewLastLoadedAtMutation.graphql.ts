/**
 * @generated SignedSource<<95d41442a4909349d7cd2a24fb830ff2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetsUpdateViewLastLoadedAtMutation$variables = {
  datasetId: string;
  viewId: string;
  viewName: string;
};
export type DatasetsUpdateViewLastLoadedAtMutation$data = {
  readonly updateViewActivity: number | null;
};
export type DatasetsUpdateViewLastLoadedAtMutation = {
  response: DatasetsUpdateViewLastLoadedAtMutation$data;
  variables: DatasetsUpdateViewLastLoadedAtMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "datasetId"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "viewId"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "viewName"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "datasetId",
        "variableName": "datasetId"
      },
      {
        "kind": "Variable",
        "name": "viewId",
        "variableName": "viewId"
      },
      {
        "kind": "Variable",
        "name": "viewName",
        "variableName": "viewName"
      }
    ],
    "kind": "ScalarField",
    "name": "updateViewActivity",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetsUpdateViewLastLoadedAtMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetsUpdateViewLastLoadedAtMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "0d4f624a4583f6f1c4f3436ae7d353c1",
    "id": null,
    "metadata": {},
    "name": "DatasetsUpdateViewLastLoadedAtMutation",
    "operationKind": "mutation",
    "text": "mutation DatasetsUpdateViewLastLoadedAtMutation(\n  $datasetId: String!\n  $viewId: String!\n  $viewName: String!\n) {\n  updateViewActivity(datasetId: $datasetId, viewId: $viewId, viewName: $viewName)\n}\n"
  }
};
})();

(node as any).hash = "059e2377e9693b4dddbf1d02ee2bfc33";

export default node;
