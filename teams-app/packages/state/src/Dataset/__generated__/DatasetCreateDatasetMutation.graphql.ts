/**
 * @generated SignedSource<<796b8f228deb5848f688c74b426d23cd>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetCreateDatasetMutation$variables = {
  description?: string | null;
  name: string;
  tags?: ReadonlyArray<string> | null;
};
export type DatasetCreateDatasetMutation$data = {
  readonly createDataset: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
};
export type DatasetCreateDatasetMutation = {
  response: DatasetCreateDatasetMutation$data;
  variables: DatasetCreateDatasetMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "tags"
},
v3 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "description",
        "variableName": "description"
      },
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "name"
      },
      {
        "kind": "Variable",
        "name": "tags",
        "variableName": "tags"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "createDataset",
    "plural": false,
    "selections": [
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
    "name": "DatasetCreateDatasetMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetCreateDatasetMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "2e34f6c0d1221666ea1660d8baf9b1a0",
    "id": null,
    "metadata": {},
    "name": "DatasetCreateDatasetMutation",
    "operationKind": "mutation",
    "text": "mutation DatasetCreateDatasetMutation(\n  $name: String!\n  $description: String\n  $tags: [String!]\n) {\n  createDataset(name: $name, description: $description, tags: $tags) {\n    id\n    name\n    slug\n  }\n}\n"
  }
};
})();

(node as any).hash = "85b1fce975ec140a13e2ff566d1e649f";

export default node;
