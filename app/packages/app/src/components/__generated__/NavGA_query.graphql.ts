/**
 * @generated SignedSource<<73330e4b311f54d786195e73ec79b888>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type NavGA_query$data = {
  readonly context: string;
  readonly dev: boolean;
  readonly doNotTrack: boolean;
  readonly uid: string;
  readonly version: string;
  readonly " $fragmentType": "NavGA_query";
};
export type NavGA_query$key = {
  readonly " $data"?: NavGA_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"NavGA_query">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "NavGA_query",
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

(node as any).hash = "cac2624b557f1b191f41a13261db9606";

export default node;
