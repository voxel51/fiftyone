/**
 * @generated SignedSource<<1144d672ae8c59160671021499a3afed>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetUpdateMutation$variables = {
  description?: string | null;
  identifier: string;
  name: string;
  tags?: ReadonlyArray<string> | null;
};
export type DatasetUpdateMutation$data = {
  readonly updateDataset: {
    readonly description: string | null;
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly tags: ReadonlyArray<string>;
  };
};
export type DatasetUpdateMutation = {
  response: DatasetUpdateMutation$data;
  variables: DatasetUpdateMutation$variables;
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
  "name": "identifier"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "tags"
},
v4 = [
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
        "name": "identifier",
        "variableName": "identifier"
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
    "name": "updateDataset",
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
      },
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
        "name": "tags",
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
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetUpdateMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetUpdateMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "2784ebcdbe0b8b9aebf28fe68091d60d",
    "id": null,
    "metadata": {},
    "name": "DatasetUpdateMutation",
    "operationKind": "mutation",
    "text": "mutation DatasetUpdateMutation(\n  $identifier: String!\n  $name: String!\n  $description: String\n  $tags: [String!]\n) {\n  updateDataset(identifier: $identifier, name: $name, description: $description, tags: $tags) {\n    id\n    name\n    slug\n    description\n    tags\n  }\n}\n"
  }
};
})();

(node as any).hash = "b4479a0b1677efd24935a196c0e24511";

export default node;
