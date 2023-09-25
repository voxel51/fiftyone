/**
 * @generated SignedSource<<9148a7e906b703f61641925e8e0f40a8>>
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

(node as any).hash = "8d543dfe22c119526e99339ec285cd7a";

export default node;
