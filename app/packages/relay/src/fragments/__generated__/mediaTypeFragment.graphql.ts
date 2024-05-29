/**
 * @generated SignedSource<<2bfaeff6556c1054f23aba005470ba3b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type MediaType = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type mediaTypeFragment$data = {
  readonly mediaType: MediaType | null;
  readonly " $fragmentType": "mediaTypeFragment";
};
export type mediaTypeFragment$key = {
  readonly " $data"?: mediaTypeFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"mediaTypeFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "mediaTypeFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaType",
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "9802746759cfac8641524eb511c0e838";

export default node;
