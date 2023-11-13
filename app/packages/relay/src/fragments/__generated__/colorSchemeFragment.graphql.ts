/**
 * @generated SignedSource<<c30221a82ab854e70ebea0579d4e5415>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type ColorBy = "field" | "instance" | "value" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type colorSchemeFragment$data = {
  readonly colorBy: ColorBy | null;
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
  readonly labelTags: {
    readonly fieldColor: string | null;
    readonly valueColors: ReadonlyArray<{
      readonly color: string;
      readonly value: string;
    }> | null;
  } | null;
  readonly multicolorKeypoints: boolean | null;
  readonly opacity: number | null;
  readonly showSkeletons: boolean | null;
  readonly " $fragmentType": "colorSchemeFragment";
};
export type colorSchemeFragment$key = {
  readonly " $data"?: colorSchemeFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"colorSchemeFragment">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "fieldColor",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "colorSchemeFragment",
  "selections": [
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
      "name": "colorPool",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "multicolorKeypoints",
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
      "name": "showSkeletons",
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
        (v0/*: any*/),
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
            (v1/*: any*/),
            (v2/*: any*/)
          ],
          "storageKey": null
        }
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "LabelTagColor",
      "kind": "LinkedField",
      "name": "labelTags",
      "plural": false,
      "selections": [
        (v0/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "ValueColor",
          "kind": "LinkedField",
          "name": "valueColors",
          "plural": true,
          "selections": [
            (v2/*: any*/),
            (v1/*: any*/)
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
})();

(node as any).hash = "29217c42c48b886de4eea10f26116f80";

export default node;
