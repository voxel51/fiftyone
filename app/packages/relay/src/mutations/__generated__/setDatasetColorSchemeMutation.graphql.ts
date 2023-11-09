/**
 * @generated SignedSource<<79c214d1f898e98a662b89f682babe47>>
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
  intTarget: number;
};
export type LabelTagColorInput = {
  fieldColor?: string | null;
  valueColors?: ReadonlyArray<ValueColorInput> | null;
};
export type setDatasetColorSchemeMutation$variables = {
  colorScheme?: ColorSchemeInput | null;
  datasetName: string;
  subscription: string;
};
export type setDatasetColorSchemeMutation$data = {
  readonly setDatasetColorScheme: any | null;
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
    "alias": null,
    "args": [
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
    "kind": "ScalarField",
    "name": "setDatasetColorScheme",
    "storageKey": null
  }
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
    "selections": (v3/*: any*/),
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
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "29b9e740886b717bb79fd9d0607dd577",
    "id": null,
    "metadata": {},
    "name": "setDatasetColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setDatasetColorSchemeMutation(\n  $subscription: String!\n  $datasetName: String!\n  $colorScheme: ColorSchemeInput\n) {\n  setDatasetColorScheme(subscription: $subscription, datasetName: $datasetName, colorScheme: $colorScheme)\n}\n"
  }
};
})();

(node as any).hash = "94e7b8a19aa593d4538989f2d25d91cb";

export default node;
