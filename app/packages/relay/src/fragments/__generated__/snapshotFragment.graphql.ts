/**
 * @generated SignedSource<<d09beb92c62548f0b5f97894375058c0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type snapshotFragment$data = {
  readonly headName: string | null;
  readonly snapshotName: string | null;
  readonly " $fragmentType": "snapshotFragment";
};
export type snapshotFragment$key = {
  readonly " $data"?: snapshotFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"snapshotFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "snapshotFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "headName",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "snapshotName",
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "49ac30440e69e671e11107d9e9d20678";

export default node;
