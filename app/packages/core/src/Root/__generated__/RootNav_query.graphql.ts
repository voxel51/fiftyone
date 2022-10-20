/**
 * @generated SignedSource<<f3de173b06266e2768825fd209430235>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RootNav_query$data = {
  readonly teamsSubmission: boolean;
  readonly " $fragmentType": "RootNav_query";
};
export type RootNav_query$key = {
  readonly " $data"?: RootNav_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"RootNav_query">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "RootNav_query",
  "selections": [
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

(node as any).hash = "24cca3fbea15640c1527e86151f3899e";

export default node;
