/**
 * @generated SignedSource<<32da4a60fc1273eb4e2be6cb8cd339a0>>
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
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "340ec12dd851836685d1e800baef63d4";

export default node;
