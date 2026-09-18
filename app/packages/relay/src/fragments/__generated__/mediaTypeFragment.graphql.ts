/**
 * @generated SignedSource<<48ce54398d6a15c0228df0c8bdb50a6f>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type mediaTypeFragment$data = {
  readonly mediaType: string | null | undefined;
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
