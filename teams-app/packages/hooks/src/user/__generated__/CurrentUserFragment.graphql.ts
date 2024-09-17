/**
 * @generated SignedSource<<421326e63f847eb5e89d9543fc4e1b81>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type CurrentUserFragment$data = {
  readonly viewer: {
    readonly apiKeys: ReadonlyArray<{
      readonly createdAt: string;
      readonly id: string;
      readonly name: string;
    }>;
    readonly email: string;
    readonly id: string;
    readonly name: string;
    readonly picture: string | null;
    readonly role: UserRole;
  } | null;
  readonly " $fragmentType": "CurrentUserFragment";
};
export type CurrentUserFragment$key = {
  readonly " $data"?: CurrentUserFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"CurrentUserFragment">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": require('./CurrentUserFragmentQuery.graphql')
    }
  },
  "name": "CurrentUserFragment",
  "selections": [
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
          "concreteType": "APIKey",
          "kind": "LinkedField",
          "name": "apiKeys",
          "plural": true,
          "selections": [
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "createdAt",
              "storageKey": null
            },
            (v0/*: any*/),
            (v1/*: any*/)
          ],
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "picture",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "role",
          "storageKey": null
        },
        (v1/*: any*/),
        (v0/*: any*/),
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "email",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};
})();

(node as any).hash = "da062923630ec3b7c9d2c543ac245219";

export default node;
