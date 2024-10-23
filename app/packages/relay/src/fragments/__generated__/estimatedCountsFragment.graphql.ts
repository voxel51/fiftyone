/**
 * @generated SignedSource<<7f7e5448668dba5a46cbd016ef2c2ce5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type estimatedCountsFragment$data = {
  readonly estimatedFrameCount: number | null;
  readonly estimatedSampleCount: number;
  readonly " $fragmentType": "estimatedCountsFragment";
};
export type estimatedCountsFragment$key = {
  readonly " $data"?: estimatedCountsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"estimatedCountsFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "estimatedCountsFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "estimatedFrameCount",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "estimatedSampleCount",
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "1fda6b6acd4cd2a2b77bdf8d3cb44cd2";

export default node;
