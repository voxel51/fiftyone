/**
 * @generated SignedSource<<75bbd99c8925c1349d474a80d5711fe7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type colorSchemeFragment$data = {
  readonly colorBy: string | null;
  readonly colorPool: ReadonlyArray<string>;
  readonly colorSeed: number | null;
  readonly fields: ReadonlyArray<{
    readonly colorByAttribute: string | null;
    readonly fieldColor: string | null;
    readonly path: string;
    readonly valueColors: ReadonlyArray<{
      readonly color: string;
      readonly value: string;
    }> | null;
  }> | null;
  readonly opacity: number | null;
  readonly showKeypointSkeleton: boolean | null;
  readonly useMultiColorKeypoints: boolean | null;
  readonly " $fragmentType": "colorSchemeFragment";
};
export type colorSchemeFragment$key = {
  readonly " $data"?: colorSchemeFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"colorSchemeFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "colorSchemeFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "colorPool",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "colorBy",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "colorSeed",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "opacity",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "useMultiColorKeypoints",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "showKeypointSkeleton",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "CustomizeColor",
      "kind": "LinkedField",
      "name": "fields",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "colorByAttribute",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "fieldColor",
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
          "concreteType": "ValueColor",
          "kind": "LinkedField",
          "name": "valueColors",
          "plural": true,
          "selections": [
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "color",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "value",
              "storageKey": null
            }
          ],
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "ColorScheme",
  "abstractKey": null
};

(node as any).hash = "65e6e019dd958bff6f1e37a1b9dfd629";

export default node;
