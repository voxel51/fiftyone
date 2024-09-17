/**
 * @generated SignedSource<<de8ec0ee17fc94fd1b28507df06676a9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type manageDatasetDefaultPermissionQuery$variables = {
  identifier: string;
};
export type manageDatasetDefaultPermissionQuery$data = {
  readonly dataset: {
    readonly defaultPermission: DatasetPermission;
  } | null;
};
export type manageDatasetDefaultPermissionQuery = {
  response: manageDatasetDefaultPermissionQuery$data;
  variables: manageDatasetDefaultPermissionQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "identifier"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "identifier",
        "variableName": "identifier"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "dataset",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultPermission",
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
    "name": "manageDatasetDefaultPermissionQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetDefaultPermissionQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "e73093b3877ddae57138bd82f4a6c335",
    "id": null,
    "metadata": {},
    "name": "manageDatasetDefaultPermissionQuery",
    "operationKind": "query",
    "text": "query manageDatasetDefaultPermissionQuery(\n  $identifier: String!\n) {\n  dataset(identifier: $identifier) {\n    defaultPermission\n  }\n}\n"
  }
};
})();

(node as any).hash = "a3db612a2471bcfc82a5367d0f62fe8e";

export default node;
