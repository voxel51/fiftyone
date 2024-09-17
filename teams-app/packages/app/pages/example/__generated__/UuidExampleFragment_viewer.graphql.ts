/**
 * @generated SignedSource<<0adaaafc8d2fc5cdf02d946568a95b03>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type UuidExampleFragment_viewer$data = {
  readonly id: string;
  readonly " $fragmentType": "UuidExampleFragment_viewer";
};
export type UuidExampleFragment_viewer$key = {
  readonly " $data"?: UuidExampleFragment_viewer$data;
  readonly " $fragmentSpreads": FragmentRefs<"UuidExampleFragment_viewer">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "UuidExampleFragment_viewer",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    }
  ],
  "type": "User",
  "abstractKey": null
};

(node as any).hash = "f2feba74b1bedbf1d3cbab43dfb6cee3";

export default node;
