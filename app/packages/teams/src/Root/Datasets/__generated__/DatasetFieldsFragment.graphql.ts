/**
 * @generated SignedSource<<728e4dc526ecf2f426b2341083b7f5bb>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetFieldsFragment$data = {
  readonly ftype: string;
  readonly subfield: string | null;
  readonly embeddedDocType: string | null;
  readonly path: string;
  readonly dbField: string | null;
  readonly " $fragmentType": "DatasetFieldsFragment";
};
export type DatasetFieldsFragment = DatasetFieldsFragment$data;
export type DatasetFieldsFragment$key = {
  readonly " $data"?: DatasetFieldsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetFieldsFragment">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "DatasetFieldsFragment",
  selections: [
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "ftype",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "subfield",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "embeddedDocType",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "path",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "dbField",
      storageKey: null,
    },
  ],
  type: "SampleField",
  abstractKey: null,
};

(node as any).hash = "a63d45ae07f692f86a2a78a28bc875f4";

export default node;
