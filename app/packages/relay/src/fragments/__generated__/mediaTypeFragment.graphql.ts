/**
 * @generated SignedSource<<731932d054263aebf4143c0d4b01dd45>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type mediaTypeFragment$data = {
  readonly mediaType: string | null;
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
