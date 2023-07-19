/**
 * @generated SignedSource<<496dfd61142e0d5ed7f1487b4460cd66>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type ColorSchemeInput = {
  colorPool: ReadonlyArray<string>;
  fields: ReadonlyArray<CustomizeColorInput>;
};
export type CustomizeColorInput = {
  colorByAttribute?: string | null;
  fieldColor?: string | null;
  path: string;
  valueColors: ReadonlyArray<ValueColorInput>;
};
export type ValueColorInput = {
  color: string;
  value: string;
};
export type setDatasetColorSchemeMutation$variables = {
  colorScheme?: ColorSchemeInput | null;
  datasetName: string;
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
        "name": "datasetName",
        "variableName": "datasetName"
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
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setDatasetColorSchemeMutation",
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
    "name": "setDatasetColorSchemeMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "359e8edcc2f9e562833826a13e31c74d",
    "id": null,
    "metadata": {},
    "name": "setDatasetColorSchemeMutation",
    "operationKind": "mutation",
    "text": "mutation setDatasetColorSchemeMutation(\n  $datasetName: String!\n  $colorScheme: ColorSchemeInput\n) {\n  setDatasetColorScheme(datasetName: $datasetName, colorScheme: $colorScheme)\n}\n"
  }
};
})();

(node as any).hash = "c78c676792e19c6ceb5bbb85e5c6280e";

export default node;
