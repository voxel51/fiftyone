/**
 * @generated SignedSource<<d45ccfd64a28d2b3de6f0a145530ad1f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RootGA_query$data = {
  readonly context: string;
  readonly dev: boolean;
  readonly doNotTrack: boolean;
  readonly uid: string;
  readonly version: string;
  readonly " $fragmentType": "RootGA_query";
};
export type RootGA_query$key = {
  readonly " $data"?: RootGA_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"RootGA_query">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "RootGA_query",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "context",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "dev",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "doNotTrack",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "uid",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "version",
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "40d5fec94e7227a5e638ff2fec41458e";

export default node;
