/**
 * @generated SignedSource<<c3cdcf69424f0ce8b164ced058fb8e27>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type ColorSchemeInput = {
  colorBy?: string | null;
  colorPool: ReadonlyArray<string>;
  defaultMaskTargetsColors?: ReadonlyArray<MaskColorInput> | null;
  fields?: ReadonlyArray<CustomizeColorInput> | null;
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
  idx?: number | null;
};
export type LabelTagColorInput = {
  fieldColor?: string | null;
  valueColors?: ReadonlyArray<ValueColorInput> | null;
};
export type setColorSchemeMutation$variables = {
  colorScheme: ColorSchemeInput;
  subscription: string;
};
export type setColorSchemeMutation$data = {
  readonly setColorScheme: boolean;
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
    "alias": null,
    "args": [
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
    "kind": "ScalarField",
    "name": "setColorScheme",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setColorSchemeMutation",
    "selections": (v2/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "setColorSchemeMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "269c21750ef04dc7db3f08ae29118f9f",
    "id": null,
    "metadata": {},
    "name": "setColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setColorSchemeMutation(\n  $subscription: String!\n  $colorScheme: ColorSchemeInput!\n) {\n  setColorScheme(subscription: $subscription, colorScheme: $colorScheme)\n}\n"
  }
};
})();

(node as any).hash = "9d1fb8d5093bc482e836e5222f4dbd86";

export default node;
