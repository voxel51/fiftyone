/**
 * @generated SignedSource<<0ca01eaa22c870627c5ee01d0f5fc836>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type groupSliceFragment$data = {
  readonly groupSlice: string | null;
  readonly " $fragmentType": "groupSliceFragment";
};
export type groupSliceFragment$key = {
  readonly " $data"?: groupSliceFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"groupSliceFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "groupSliceFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "groupSlice",
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "a6891bedfc51ef0ce664b119878a6f9d";

export default node;
