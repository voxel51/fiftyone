/**
 * @generated SignedSource<<0d17cf24ce75f2a4295ec9f1663c2202>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type groupUsersFragment$data = {
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly picture: string | null;
  readonly role: UserRole;
  readonly " $fragmentType": "groupUsersFragment";
};
export type groupUsersFragment$key = {
  readonly " $data"?: groupUsersFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"groupUsersFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "groupUsersFragment",
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
      "name": "email",
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
    }
  ],
  "type": "User",
  "abstractKey": null
};

(node as any).hash = "dbfd1da8c6c2bf4739c20225bd2f9e58";

export default node;
