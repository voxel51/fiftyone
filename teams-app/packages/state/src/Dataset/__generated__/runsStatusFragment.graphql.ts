/**
 * @generated SignedSource<<688f8ee66d120db5400c2561c2f825fb>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type runsStatusFragment$data = {
  readonly status: any | null;
  readonly " $fragmentType": "runsStatusFragment";
};
export type runsStatusFragment$key = {
  readonly " $data"?: runsStatusFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"runsStatusFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "runsStatusFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "status",
      "storageKey": null
    }
  ],
  "type": "DelegatedOperation",
  "abstractKey": null
};

(node as any).hash = "7b486582b24dcfb3f947d203544a9df7";

export default node;
