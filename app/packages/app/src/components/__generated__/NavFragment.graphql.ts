/**
 * @generated SignedSource<<96f99b77fbb5a6f868b73cde087898d9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type NavFragment$data = {
  readonly teamsSubmission: boolean;
  readonly " $fragmentSpreads": FragmentRefs<"NavDatasets" | "NavGA">;
  readonly " $fragmentType": "NavFragment";
};
export type NavFragment$key = {
  readonly " $data"?: NavFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"NavFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "NavFragment",
  "selections": [
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "NavDatasets"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "NavGA"
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "teamsSubmission",
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "7cbd09bfdfce2f5c3b283eb3fec3a78b";

export default node;
