/**
 * @generated SignedSource<<8ed05607c301fe618387332a17cf9179>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type UuidExampleQuery$variables = {
  uuid: string;
};
export type UuidExampleQuery$data = {
  readonly example: string;
  readonly viewer: {
    readonly " $fragmentSpreads": FragmentRefs<"UuidExampleFragment_viewer">;
  } | null;
};
export type UuidExampleQuery = {
  response: UuidExampleQuery$data;
  variables: UuidExampleQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "uuid"
  }
],
v1 = {
  "alias": null,
  "args": [
    {
      "kind": "Variable",
      "name": "uuid",
      "variableName": "uuid"
    }
  ],
  "kind": "ScalarField",
  "name": "example",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "UuidExampleQuery",
    "selections": [
      (v1/*: any*/),
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "UuidExampleFragment_viewer"
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "UuidExampleQuery",
    "selections": [
      (v1/*: any*/),
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "60310117f896f943e88d0a5ec784019e",
    "id": null,
    "metadata": {},
    "name": "UuidExampleQuery",
    "operationKind": "query",
    "text": "query UuidExampleQuery(\n  $uuid: String!\n) {\n  example(uuid: $uuid)\n  viewer {\n    ...UuidExampleFragment_viewer\n  }\n}\n\nfragment UuidExampleFragment_viewer on User {\n  id\n}\n"
  }
};
})();

(node as any).hash = "05c9ca854b894ceaba74ca102b4f3f5c";

export default node;
