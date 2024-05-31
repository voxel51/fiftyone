/**
 * @generated SignedSource<<85bc3d6372c6f08bcdf0a2533aae4d98>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type NavFragment$data = {
  readonly " $fragmentSpreads": FragmentRefs<"NavDatasets" | "NavGA">;
  readonly " $fragmentType": "NavFragment";
};
export type NavFragment$key = {
  readonly " $data"?: NavFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"NavFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "NavFragment",
  "selections": [
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "NavDatasets"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "NavGA"
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "f8b963593ae22123acdf5393b9a8a274";

export default node;
