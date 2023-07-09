/**
 * @generated SignedSource<<ec645a528a7933a78f3144718f29a3d7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type groupSliceFragment$data = {
  readonly defaultGroupSlice: string | null;
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
      "name": "defaultGroupSlice",
      "storageKey": null
    },
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

(node as any).hash = "450fa0bf24ab03e576bc9b576b0b0af2";

export default node;
