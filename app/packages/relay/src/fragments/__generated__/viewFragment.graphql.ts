/**
 * @generated SignedSource<<482864a2dd553ff812f6b6138b893bd9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewFragment$data = {
  readonly stages: Array | null;
  readonly viewCls: string | null;
  readonly viewName: string | null;
  readonly " $fragmentType": "viewFragment";
};
export type viewFragment$key = {
  readonly " $data"?: viewFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"viewFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [
    {
      "kind": "RootArgument",
      "name": "savedViewSlug"
    },
    {
      "kind": "RootArgument",
      "name": "view"
    }
  ],
  "kind": "Fragment",
  "metadata": null,
  "name": "viewFragment",
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "slug",
          "variableName": "savedViewSlug"
        },
        {
          "kind": "Variable",
          "name": "view",
          "variableName": "view"
        }
      ],
      "kind": "ScalarField",
      "name": "stages",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "viewCls",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "viewName",
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "9fd7005e9bb2ad89b1257bdb60f9e435";

export default node;
