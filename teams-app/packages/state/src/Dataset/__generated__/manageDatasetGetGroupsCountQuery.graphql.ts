/**
 * @generated SignedSource<<b583015d0fa9d7acae394a65c93aaed5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type manageDatasetGetGroupsCountQuery$variables = {
  identifier: string;
};
export type manageDatasetGetGroupsCountQuery$data = {
  readonly dataset: {
    readonly userGroupsCount: number;
  } | null;
};
export type manageDatasetGetGroupsCountQuery = {
  response: manageDatasetGetGroupsCountQuery$data;
  variables: manageDatasetGetGroupsCountQuery$variables;
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
        "name": "userGroupsCount",
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
    "name": "manageDatasetGetGroupsCountQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetGetGroupsCountQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "a92b31fab5e94b13f521f24f64f1aa70",
    "id": null,
    "metadata": {},
    "name": "manageDatasetGetGroupsCountQuery",
    "operationKind": "query",
    "text": "query manageDatasetGetGroupsCountQuery(\n  $identifier: String!\n) {\n  dataset(identifier: $identifier) {\n    userGroupsCount\n  }\n}\n"
  }
};
})();

(node as any).hash = "5efc207aca0fe9c41a357cc4a28901a0";

export default node;
