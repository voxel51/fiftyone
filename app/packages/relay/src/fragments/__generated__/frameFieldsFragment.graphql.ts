/**
 * @generated SignedSource<<5e14b8684d241250dd05426f4159dcf1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type frameFieldsFragment$data = {
  readonly frameFields: ReadonlyArray<{
    readonly dbField: string | null;
    readonly description: string | null;
    readonly embeddedDocType: string | null;
    readonly ftype: string;
    readonly info: object | null;
    readonly path: string;
    readonly subfield: string | null;
  }> | null;
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
