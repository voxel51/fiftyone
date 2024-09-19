/**
 * @generated SignedSource<<0a5307e568c81caa69d04136fcf631b7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type manageDatasetGetAccessPage_datasetFrag$data = {
  readonly defaultPermission: DatasetPermission;
  readonly slug: string;
  readonly " $fragmentType": "manageDatasetGetAccessPage_datasetFrag";
};
export type manageDatasetGetAccessPage_datasetFrag$key = {
  readonly " $data"?: manageDatasetGetAccessPage_datasetFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_datasetFrag">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "manageDatasetGetAccessPage_datasetFrag",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "slug",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "defaultPermission",
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "b842c0806e606b8f999920411e130bc9";

export default node;
