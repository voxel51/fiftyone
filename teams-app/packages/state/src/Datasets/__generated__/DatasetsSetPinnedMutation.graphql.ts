/**
 * @generated SignedSource<<476e0f396e7f6f6f944997e005628732>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetsSetPinnedMutation$variables = {
  datasetIdentifier: string;
  pinned?: boolean | null;
  userId?: string | null;
};
export type DatasetsSetPinnedMutation$data = {
  readonly setDatasetPinned: {
    readonly __typename: "Dataset";
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly viewer: {
      readonly pinned: boolean;
    };
  };
};
export type DatasetsSetPinnedMutation = {
  response: DatasetsSetPinnedMutation$data;
  variables: DatasetsSetPinnedMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetIdentifier"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pinned"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "userId"
},
v3 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "datasetIdentifier",
        "variableName": "datasetIdentifier"
      },
      {
        "kind": "Variable",
        "name": "pinned",
        "variableName": "pinned"
      },
      {
        "kind": "Variable",
        "name": "userId",
        "variableName": "userId"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "setDatasetPinned",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "__typename",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "slug",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "DatasetUser",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "pinned",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetsSetPinnedMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetsSetPinnedMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "ffc32ec6ebdc547b7718fe6fd4f51c19",
    "id": null,
    "metadata": {},
    "name": "DatasetsSetPinnedMutation",
    "operationKind": "mutation",
    "text": "mutation DatasetsSetPinnedMutation(\n  $datasetIdentifier: String!\n  $userId: String\n  $pinned: Boolean\n) {\n  setDatasetPinned(datasetIdentifier: $datasetIdentifier, userId: $userId, pinned: $pinned) {\n    __typename\n    id\n    name\n    slug\n    viewer {\n      pinned\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "c1cb91867fd4b8f7aa295647d2d0fb89";

export default node;
