/**
 * @generated SignedSource<<46385c140146f2317005e105dd92f070>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type NavFragment$data = {
  readonly " $fragmentSpreads": FragmentRefs<"Analytics" | "NavDatasets">;
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
      "name": "Analytics"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "NavDatasets"
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "b4c1e5cfb810c869d7f48d036fc48cad";

export default node;
