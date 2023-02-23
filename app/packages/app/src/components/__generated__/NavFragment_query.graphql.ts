/**
 * @generated SignedSource<<7c574b4b7d9e86077d4ac10ca805fedb>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type NavFragment_query$data = {
  readonly teamsSubmission: boolean;
  readonly " $fragmentSpreads": FragmentRefs<"NavDatasets_query" | "NavGA_query">;
  readonly " $fragmentType": "NavFragment_query";
};
export type NavFragment_query$key = {
  readonly " $data"?: NavFragment_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"NavFragment_query">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "NavFragment_query",
  "selections": [
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "NavDatasets_query"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "NavGA_query"
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

(node as any).hash = "9d226c57cf06cd4de5553c15947267e6";

export default node;
