/**
 * @generated SignedSource<<2704582c80feeed75775aaa50c65bd18>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type sampleFieldsFragment$data = {
  readonly sampleFields: ReadonlyArray<{
    readonly dbField: string | null;
    readonly description: string | null;
    readonly embeddedDocType: string | null;
    readonly ftype: string;
    readonly info: object | null;
    readonly path: string;
    readonly subfield: string | null;
  }>;
  readonly " $fragmentType": "sampleFieldsFragment";
};
export type sampleFieldsFragment$key = {
  readonly " $data"?: sampleFieldsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"sampleFieldsFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "sampleFieldsFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "sampleFields",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "ftype",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "subfield",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "embeddedDocType",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "path",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "dbField",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "description",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "info",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "ffdbf616a16f2da63d32f177edbb948d";

export default node;
