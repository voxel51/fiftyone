/**
 * @generated SignedSource<<0aaaa5d5f8894e18995de73a4b8ec20b>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type frameFieldsFragment$data = {
  readonly frameFields: ReadonlyArray<{
    readonly dbField: string | null | undefined;
    readonly description: string | null | undefined;
    readonly embeddedDocType: string | null | undefined;
    readonly ftype: string;
    readonly info: object | null | undefined;
    readonly path: string;
    readonly subfield: string | null | undefined;
  }> | null | undefined;
  readonly " $fragmentType": "frameFieldsFragment";
};
export type frameFieldsFragment$key = {
  readonly " $data"?: frameFieldsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"frameFieldsFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "frameFieldsFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "frameFields",
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

(node as any).hash = "2127dbdf29c6c99f99aa81bc3ba14ae1";

export default node;
