/**
 * @generated SignedSource<<94f4e2440a2b7380f82dfe4c09c00930>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type NavGA$data = {
  readonly context: string;
  readonly dev: boolean;
  readonly doNotTrack: boolean;
  readonly uid: string;
  readonly version: string;
  readonly " $fragmentType": "NavGA";
};
export type NavGA$key = {
  readonly " $data"?: NavGA$data;
  readonly " $fragmentSpreads": FragmentRefs<"NavGA">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "NavGA",
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

(node as any).hash = "a2d13e827ff06e46baffc9244d708b0a";

export default node;
