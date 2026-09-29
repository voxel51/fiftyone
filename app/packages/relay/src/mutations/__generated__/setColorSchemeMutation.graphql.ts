/**
 * @generated SignedSource<<b35126820272b52322db063312955dde>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ColorSchemeInput = {
  colorBy?: string | null | undefined;
  colorPool: ReadonlyArray<string>;
  colorscales?: ReadonlyArray<ColorscaleInput> | null | undefined;
  defaultColorscale?: DefaultColorscaleInput | null | undefined;
  defaultMaskTargetsColors?: ReadonlyArray<MaskColorInput> | null | undefined;
  fields?: ReadonlyArray<CustomizeColorInput> | null | undefined;
  id?: string | null | undefined;
  labelTags?: LabelTagColorInput | null | undefined;
  multicolorKeypoints?: boolean | null | undefined;
  opacity?: number | null | undefined;
  showSkeletons?: boolean | null | undefined;
  temporalTags?: TemporalTagColorInput | null | undefined;
};
export type CustomizeColorInput = {
  colorByAttribute?: string | null | undefined;
  fieldColor?: string | null | undefined;
  maskTargetsColors?: ReadonlyArray<MaskColorInput> | null | undefined;
  path: string;
  valueColors?: ReadonlyArray<ValueColorInput> | null | undefined;
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
  fieldColor?: string | null | undefined;
  valueColors?: ReadonlyArray<ValueColorInput> | null | undefined;
};
export type TemporalTagColorInput = {
  fieldColor?: string | null | undefined;
  valueColors?: ReadonlyArray<ValueColorInput> | null | undefined;
};
export type ColorscaleInput = {
  list?: ReadonlyArray<ColorscaleListInput> | null | undefined;
  name?: string | null | undefined;
  path: string;
};
export type ColorscaleListInput = {
  color: string;
  value?: number | null | undefined;
};
export type DefaultColorscaleInput = {
  list?: ReadonlyArray<ColorscaleListInput> | null | undefined;
  name?: string | null | undefined;
};
export type setColorSchemeMutation$variables = {
  colorScheme: ColorSchemeInput;
  subscription: string;
};
export type setColorSchemeMutation$data = {
  readonly setColorScheme: {
    readonly " $fragmentSpreads": FragmentRefs<"colorSchemeFragment">;
  };
};
export type setColorSchemeMutation = {
  response: setColorSchemeMutation$data;
  variables: setColorSchemeMutation$variables;
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
  "name": "subscription"
},
v2 = [
  {
    "kind": "Variable",
    "name": "colorScheme",
    "variableName": "colorScheme"
  },
  {
    "kind": "Variable",
    "name": "subscription",
    "variableName": "subscription"
  }
],
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "fieldColor",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
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
    (v4/*:: as any*/),
    (v5/*:: as any*/)
  ],
  "storageKey": null
},
v7 = [
  (v3/*:: as any*/),
  (v6/*:: as any*/)
],
v8 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "intTarget",
    "storageKey": null
  },
  (v4/*:: as any*/)
],
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "concreteType": "ColorscaleList",
  "kind": "LinkedField",
  "name": "list",
  "plural": true,
  "selections": [
    (v5/*:: as any*/),
    (v4/*:: as any*/)
  ],
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "rgb",
  "storageKey": null
},
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*:: as any*/),
      (v1/*:: as any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setColorSchemeMutation",
    "selections": [
      {
        "alias": null,
        "args": (v2/*:: as any*/),
        "concreteType": "ColorScheme",
        "kind": "LinkedField",
        "name": "setColorScheme",
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
      (v1/*:: as any*/),
      (v0/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "setColorSchemeMutation",
    "selections": [
      {
        "alias": null,
        "args": (v2/*:: as any*/),
        "concreteType": "ColorScheme",
        "kind": "LinkedField",
        "name": "setColorScheme",
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
            "selections": (v7/*:: as any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "TemporalTagColor",
            "kind": "LinkedField",
            "name": "temporalTags",
            "plural": false,
            "selections": (v7/*:: as any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "MaskColor",
            "kind": "LinkedField",
            "name": "defaultMaskTargetsColors",
            "plural": true,
            "selections": (v8/*:: as any*/),
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
              (v9/*:: as any*/),
              (v10/*:: as any*/),
              (v11/*:: as any*/)
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
              (v12/*:: as any*/),
              (v9/*:: as any*/),
              (v10/*:: as any*/),
              (v11/*:: as any*/)
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
              (v3/*:: as any*/),
              (v12/*:: as any*/),
              (v6/*:: as any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "MaskColor",
                "kind": "LinkedField",
                "name": "maskTargetsColors",
                "plural": true,
                "selections": (v8/*:: as any*/),
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
    "cacheID": "ed59b1bb8659a1f2b79464bcef67f212",
    "id": null,
    "metadata": {},
    "name": "setColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setColorSchemeMutation(\n  $subscription: String!\n  $colorScheme: ColorSchemeInput!\n) {\n  setColorScheme(subscription: $subscription, colorScheme: $colorScheme) {\n    ...colorSchemeFragment\n    id\n  }\n}\n\nfragment colorSchemeFragment on ColorScheme {\n  id\n  colorBy\n  colorPool\n  multicolorKeypoints\n  opacity\n  showSkeletons\n  labelTags {\n    fieldColor\n    valueColors {\n      color\n      value\n    }\n  }\n  temporalTags {\n    fieldColor\n    valueColors {\n      color\n      value\n    }\n  }\n  defaultMaskTargetsColors {\n    intTarget\n    color\n  }\n  defaultColorscale {\n    name\n    list {\n      value\n      color\n    }\n    rgb\n  }\n  colorscales {\n    path\n    name\n    list {\n      value\n      color\n    }\n    rgb\n  }\n  fields {\n    colorByAttribute\n    fieldColor\n    path\n    valueColors {\n      color\n      value\n    }\n    maskTargetsColors {\n      intTarget\n      color\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "f9bb3615310638c1b1d8d6743b51a28d";

export default node;
