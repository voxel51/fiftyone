/**
 * @generated SignedSource<<d45beef9de949355fd84e520200eff13>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetsListCard_dataset$data = {
  readonly id: string;
  readonly name: string;
  readonly " $fragmentType": "DatasetsListCard_dataset";
};
export type DatasetsListCard_dataset = DatasetsListCard_dataset$data;
export type DatasetsListCard_dataset$key = {
  readonly " $data"?: DatasetsListCard_dataset$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetsListCard_dataset">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "DatasetsListCard_dataset",
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

(node as any).hash = "c7bb98866d3f6d8ba512a39d2aae6efe";

export default node;
