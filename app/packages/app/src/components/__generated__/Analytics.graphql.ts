/**
 * @generated SignedSource<<814914ffd53575969ca480cdc6f3d1f0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type Analytics$data = {
  readonly context: string;
  readonly dev: boolean;
  readonly doNotTrack: boolean;
  readonly uid: string;
  readonly version: string;
  readonly " $fragmentType": "Analytics";
};
export type Analytics$key = {
  readonly " $data"?: Analytics$data;
  readonly " $fragmentSpreads": FragmentRefs<"Analytics">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "Analytics",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "context",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "dev",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "doNotTrack",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "uid",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "version",
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "042d0c5e3b5c588fc852e8a26d260126";

export default node;
