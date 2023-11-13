/**
 * @generated SignedSource<<09272144bff4e04a74d39a3a37f4efb2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ColorSchemeInput = {
  colorBy?: string | null;
  colorPool: ReadonlyArray<string>;
  colorscales?: ReadonlyArray<ColorscaleInput> | null;
  defaultColorscale?: DefaultColorscaleInput | null;
  defaultMaskTargetsColors?: ReadonlyArray<MaskColorInput> | null;
  fields?: ReadonlyArray<CustomizeColorInput> | null;
  id: string;
  labelTags?: LabelTagColorInput | null;
  multicolorKeypoints?: boolean | null;
  opacity?: number | null;
  showSkeletons?: boolean | null;
};
export type CustomizeColorInput = {
  colorByAttribute?: string | null;
  fieldColor?: string | null;
  maskTargetsColors?: ReadonlyArray<MaskColorInput> | null;
  path: string;
  valueColors?: ReadonlyArray<ValueColorInput> | null;
};
export type ValueColorInput = {
  color: string;
  value: string;
};
export type MaskColorInput = {
  color: string;
  intTarget: number;
};
export type LabelTagColorInput = {
  fieldColor?: string | null;
  valueColors?: ReadonlyArray<ValueColorInput> | null;
};
export type ColorscaleInput = {
  list?: ReadonlyArray<ColorscaleListInput> | null;
  name?: string | null;
  path: string;
};
export type ColorscaleListInput = {
  color: string;
  value?: number | null;
};
export type DefaultColorscaleInput = {
  list?: ReadonlyArray<ColorscaleListInput> | null;
  name?: string | null;
};
export type setDatasetColorSchemeMutation$variables = {
  colorScheme?: ColorSchemeInput | null;
  datasetName: string;
  subscription: string;
};
export type setDatasetColorSchemeMutation$data = {
  readonly setDatasetColorScheme: {
    readonly " $fragmentSpreads": FragmentRefs<"colorSchemeFragment">;
  };
};
export type setDatasetColorSchemeMutation = {
  response: setDatasetColorSchemeMutation$data;
  variables: setDatasetColorSchemeMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "colorScheme"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetName"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v3 = [
  {
    "kind": "Variable",
    "name": "colorScheme",
    "variableName": "colorScheme"
  },
  {
    "kind": "Variable",
    "name": "datasetName",
    "variableName": "datasetName"
  },
  {
    "kind": "Variable",
    "name": "subscription",
    "variableName": "subscription"
  }
],
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "fieldColor",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "concreteType": "ValueColor",
  "kind": "LinkedField",
  "name": "valueColors",
  "plural": true,
  "selections": [
    (v5/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "value",
      "storageKey": null
    }
  ],
  "storageKey": null
},
v7 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "intTarget",
    "storageKey": null
  },
  (v5/*: any*/)
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setDatasetColorSchemeMutation",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": "ColorScheme",
        "kind": "LinkedField",
        "name": "setDatasetColorScheme",
        "plural": false,
        "selections": [
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "colorSchemeFragment"
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "setDatasetColorSchemeMutation",
    "selections": [
      {
        "alias": null,
        "args": (v3/*: any*/),
        "concreteType": "ColorScheme",
        "kind": "LinkedField",
        "name": "setDatasetColorScheme",
        "plural": false,
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
            "selections": [
              (v4/*: any*/),
              (v6/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "MaskColor",
            "kind": "LinkedField",
            "name": "defaultMaskTargetsColors",
            "plural": true,
            "selections": (v7/*: any*/),
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
              (v4/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "path",
                "storageKey": null
              },
              (v6/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "MaskColor",
                "kind": "LinkedField",
                "name": "maskTargetsColors",
                "plural": true,
                "selections": (v7/*: any*/),
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "8fa2698e3189b3e6c0ce4c1dbdc9a01e",
    "id": null,
    "metadata": {},
    "name": "setDatasetColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setDatasetColorSchemeMutation(\n  $subscription: String!\n  $datasetName: String!\n  $colorScheme: ColorSchemeInput\n) {\n  setDatasetColorScheme(subscription: $subscription, datasetName: $datasetName, colorScheme: $colorScheme) {\n    ...colorSchemeFragment\n    id\n  }\n}\n\nfragment colorSchemeFragment on ColorScheme {\n  id\n  colorBy\n  colorPool\n  multicolorKeypoints\n  opacity\n  showSkeletons\n  labelTags {\n    fieldColor\n    valueColors {\n      color\n      value\n    }\n  }\n  defaultMaskTargetsColors {\n    intTarget\n    color\n  }\n  fields {\n    colorByAttribute\n    fieldColor\n    path\n    valueColors {\n      color\n      value\n    }\n    maskTargetsColors {\n      intTarget\n      color\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "34bbc63c5f6ffb1a739e5c2930e790f9";

export default node;
