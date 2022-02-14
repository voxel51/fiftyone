/**
 * @generated SignedSource<<74163cc8da775d24aaae04f0a61f35e8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetsListingCard_dataset$data = {
  readonly id: string;
  readonly name: string;
  readonly sampleFields: ReadonlyArray<{
    readonly path: string;
  }>;
  readonly " $fragmentType": "DatasetsListingCard_dataset";
};
export type DatasetsListingCard_dataset = DatasetsListingCard_dataset$data;
export type DatasetsListingCard_dataset$key = {
  readonly " $data"?: DatasetsListingCard_dataset$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetsListingCard_dataset">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "DatasetsListingCard_dataset",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "name",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "sampleFields",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "path",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "c60b883aa8b17a7b68a55793cfbf7a91";

export default node;
