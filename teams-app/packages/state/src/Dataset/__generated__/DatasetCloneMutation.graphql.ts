/**
 * @generated SignedSource<<f2c3937b7c9c60d8c64c7f6b101f9b6d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type MediaTypeOption = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
export type DatasetCloneMutation$variables = {
  name: string;
  snapshot?: string | null;
  sourceIdentifier: string;
};
export type DatasetCloneMutation$data = {
  readonly cloneDataset: {
    readonly createdAt: string | null;
    readonly defaultPermission: DatasetPermission;
    readonly id: string;
    readonly lastLoadedAt: string | null;
    readonly mediaType: MediaTypeOption | null;
    readonly name: string;
    readonly sampleFieldsCount: number;
    readonly samplesCount: number;
    readonly slug: string;
    readonly tags: ReadonlyArray<string>;
    readonly viewer: {
      readonly activePermission: DatasetPermission;
      readonly pinned: boolean;
      readonly pinnedAt: string | null;
      readonly user: {
        readonly email: string;
        readonly id: string;
      };
    };
  };
};
export type DatasetCloneMutation = {
  response: DatasetCloneMutation$data;
  variables: DatasetCloneMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "snapshot"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sourceIdentifier"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "name"
      },
      {
        "kind": "Variable",
        "name": "snapshot",
        "variableName": "snapshot"
      },
      {
        "kind": "Variable",
        "name": "sourceIdentifier",
        "variableName": "sourceIdentifier"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "cloneDataset",
    "plural": false,
    "selections": [
      (v3/*: any*/),
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
        "kind": "ScalarField",
        "name": "mediaType",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "createdAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "lastLoadedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultPermission",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "samplesCount",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "sampleFieldsCount",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "tags",
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
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "user",
            "plural": false,
            "selections": [
              (v3/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "email",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "pinned",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "pinnedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "activePermission",
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
    "name": "DatasetCloneMutation",
    "selections": (v4/*: any*/),
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
    "name": "DatasetCloneMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "08745526f6e3df1ec42446b9a06c2bb3",
    "id": null,
    "metadata": {},
    "name": "DatasetCloneMutation",
    "operationKind": "mutation",
    "text": "mutation DatasetCloneMutation(\n  $name: String!\n  $sourceIdentifier: String!\n  $snapshot: String\n) {\n  cloneDataset(name: $name, sourceIdentifier: $sourceIdentifier, snapshot: $snapshot) {\n    id\n    name\n    slug\n    mediaType\n    createdAt\n    lastLoadedAt\n    defaultPermission\n    samplesCount\n    sampleFieldsCount\n    tags\n    viewer {\n      user {\n        id\n        email\n      }\n      pinned\n      pinnedAt\n      activePermission\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "c46275561b7a76dc43c74d49bf3a2124";

export default node;
