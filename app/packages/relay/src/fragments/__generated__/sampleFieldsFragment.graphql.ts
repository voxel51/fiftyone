/**
 * @generated SignedSource<<e5669bd316436f39f8f08b9bc57301af>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type sampleFieldsFragment$data = {
  readonly sampleFields: ReadonlyArray<{
    readonly dbField: string | null | undefined;
    readonly description: string | null | undefined;
    readonly embeddedDocType: string | null | undefined;
    readonly ftype: string;
    readonly info: object | null | undefined;
    readonly path: string;
    readonly subfield: string | null | undefined;
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
