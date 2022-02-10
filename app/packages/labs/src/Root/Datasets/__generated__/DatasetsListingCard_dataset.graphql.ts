/**
 * @generated SignedSource<<e40610a1d8c216d533a4e3f2c6e0d0a6>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetsListingCard_dataset$data = {
  readonly id: string;
  readonly name: string;
  readonly " $fragmentType": "DatasetsListingCard_dataset";
};
export type DatasetsListingCard_dataset = DatasetsListingCard_dataset$data;
export type DatasetsListingCard_dataset$key = {
  readonly " $data"?: DatasetsListingCard_dataset$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetsListingCard_dataset">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "DatasetsListingCard_dataset",
  selections: [
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "id",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "name",
      storageKey: null,
    },
  ],
  type: "Dataset",
  abstractKey: null,
};

(node as any).hash = "e724ec813a1e72a966e08ec6d5449bc1";

export default node;
