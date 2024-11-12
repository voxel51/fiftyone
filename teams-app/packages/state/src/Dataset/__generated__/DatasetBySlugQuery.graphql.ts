/**
 * @generated SignedSource<<a79f8daf20095f2abe38a4d6a5fd571e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type MediaTypeOption = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
export type DatasetBySlugQuery$variables = {
  identifier: string;
};
export type DatasetBySlugQuery$data = {
  readonly dataset: {
    readonly createdAt: string | null;
    readonly createdBy: {
      readonly id: string;
      readonly name: string;
    } | null;
    readonly description: string | null;
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
      readonly permission: DatasetPermission;
      readonly pinned: boolean;
      readonly userPermission: DatasetPermission | null;
    };
  } | null;
};
export type DatasetBySlugQuery = {
  response: DatasetBySlugQuery$data;
  variables: DatasetBySlugQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "identifier"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v3 = [
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
      (v1/*: any*/),
      (v2/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
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
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "permission",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "activePermission",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "userPermission",
            "storageKey": null
          }
        ],
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
        "name": "slug",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "createdBy",
        "plural": false,
        "selections": [
          (v1/*: any*/),
          (v2/*: any*/)
        ],
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
    "name": "DatasetBySlugQuery",
    "selections": (v3/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetBySlugQuery",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "f403cb5ead44fbf3dad57b8e5d55a841",
    "id": null,
    "metadata": {},
    "name": "DatasetBySlugQuery",
    "operationKind": "query",
    "text": "query DatasetBySlugQuery(\n  $identifier: String!\n) {\n  dataset(identifier: $identifier) {\n    id\n    name\n    description\n    lastLoadedAt\n    viewer {\n      pinned\n      permission\n      activePermission\n      userPermission\n    }\n    samplesCount\n    sampleFieldsCount\n    tags\n    mediaType\n    createdAt\n    slug\n    createdBy {\n      id\n      name\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "fc03eab101ecea5d21394fe3b5ce39ad";

export default node;
