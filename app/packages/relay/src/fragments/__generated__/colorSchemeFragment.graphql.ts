/**
 * @generated SignedSource<<91ba239e2c3d4d2548fe6883d2b50056>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type ColorBy = "field" | "instance" | "value" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type colorSchemeFragment$data = {
  readonly colorBy: ColorBy | null | undefined;
  readonly colorPool: ReadonlyArray<string> | null | undefined;
  readonly colorscales: ReadonlyArray<{
    readonly list: ReadonlyArray<{
      readonly color: string;
      readonly value: number;
    }> | null | undefined;
    readonly name: string | null | undefined;
    readonly path: string;
    readonly rgb: ReadonlyArray<ReadonlyArray<number>> | null | undefined;
  }> | null | undefined;
  readonly defaultColorscale: {
    readonly list: ReadonlyArray<{
      readonly color: string;
      readonly value: number;
    }> | null | undefined;
    readonly name: string | null | undefined;
    readonly rgb: ReadonlyArray<ReadonlyArray<number>> | null | undefined;
  } | null | undefined;
  readonly defaultMaskTargetsColors: ReadonlyArray<{
    readonly color: string;
    readonly intTarget: number;
  }> | null | undefined;
  readonly fields: ReadonlyArray<{
    readonly colorByAttribute: string | null | undefined;
    readonly fieldColor: string | null | undefined;
    readonly maskTargetsColors: ReadonlyArray<{
      readonly color: string;
      readonly intTarget: number;
    }> | null | undefined;
    readonly path: string;
    readonly valueColors: ReadonlyArray<{
      readonly color: string;
      readonly value: string;
    }> | null | undefined;
  }> | null | undefined;
  readonly id: string;
  readonly labelTags: {
    readonly fieldColor: string | null | undefined;
    readonly valueColors: ReadonlyArray<{
      readonly color: string;
      readonly value: string;
    }> | null | undefined;
  } | null | undefined;
  readonly multicolorKeypoints: boolean | null | undefined;
  readonly opacity: number | null | undefined;
  readonly showSkeletons: boolean | null | undefined;
  readonly temporalTags: {
    readonly fieldColor: string | null | undefined;
    readonly valueColors: ReadonlyArray<{
      readonly color: string;
      readonly value: string;
    }> | null | undefined;
  } | null | undefined;
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
},
v3 = {
  "alias": null,
  "args": null,
  "concreteType": "ValueColor",
  "kind": "LinkedField",
  "name": "valueColors",
  "plural": true,
  "selections": [
    (v1/*:: as any*/),
    (v2/*:: as any*/)
  ],
  "storageKey": null
},
v4 = [
  (v0/*:: as any*/),
  (v3/*:: as any*/)
],
v5 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "intTarget",
    "storageKey": null
  },
  (v1/*:: as any*/)
],
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "concreteType": "ColorscaleList",
  "kind": "LinkedField",
  "name": "list",
  "plural": true,
  "selections": [
    (v2/*:: as any*/),
    (v1/*:: as any*/)
  ],
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "rgb",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
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
      "name": "id",
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
      "concreteType": "LabelTagColor",
      "kind": "LinkedField",
      "name": "labelTags",
      "plural": false,
      "selections": (v4/*:: as any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "TemporalTagColor",
      "kind": "LinkedField",
      "name": "temporalTags",
      "plural": false,
      "selections": (v4/*:: as any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "MaskColor",
      "kind": "LinkedField",
      "name": "defaultMaskTargetsColors",
      "plural": true,
      "selections": (v5/*:: as any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "DefaultColorscale",
      "kind": "LinkedField",
      "name": "defaultColorscale",
      "plural": false,
      "selections": [
        (v6/*:: as any*/),
        (v7/*:: as any*/),
        (v8/*:: as any*/)
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "Colorscale",
      "kind": "LinkedField",
      "name": "colorscales",
      "plural": true,
      "selections": [
        (v9/*:: as any*/),
        (v6/*:: as any*/),
        (v7/*:: as any*/),
        (v8/*:: as any*/)
      ],
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
        (v0/*:: as any*/),
        (v9/*:: as any*/),
        (v3/*:: as any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "MaskColor",
          "kind": "LinkedField",
          "name": "maskTargetsColors",
          "plural": true,
          "selections": (v5/*:: as any*/),
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

(node as any).hash = "a99a0687254882b429a29287ad0fe7b9";

export default node;
