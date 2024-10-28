/**
 * @generated SignedSource<<b180b321c8bc2054c94a18abe16f4823>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type pluginsOperatorEnableDisableMutation$variables = {
  enabled?: boolean | null;
  operatorName: string;
  pluginName: string;
};
export type pluginsOperatorEnableDisableMutation$data = {
  readonly updatePlugin: {
    readonly name: string;
    readonly operators: ReadonlyArray<{
      readonly enabled: boolean;
      readonly name: string;
    }>;
  };
};
export type pluginsOperatorEnableDisableMutation = {
  response: pluginsOperatorEnableDisableMutation$data;
  variables: pluginsOperatorEnableDisableMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "enabled"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "operatorName"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pluginName"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "pluginName"
      },
      {
        "fields": [
          {
            "kind": "Variable",
            "name": "enabled",
            "variableName": "enabled"
          },
          {
            "kind": "Variable",
            "name": "name",
            "variableName": "operatorName"
          }
        ],
        "kind": "ObjectValue",
        "name": "operatorSettings"
      }
    ],
    "concreteType": "Plugin",
    "kind": "LinkedField",
    "name": "updatePlugin",
    "plural": false,
    "selections": [
      (v3/*: any*/),
      {
        "alias": null,
        "args": null,
        "concreteType": "PluginOperator",
        "kind": "LinkedField",
        "name": "operators",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "enabled",
            "storageKey": null
          },
          (v3/*: any*/)
        ],
        "storageKey": null
      }
    ],
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
    "name": "pluginsOperatorEnableDisableMutation",
    "selections": (v4/*: any*/),
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
    "name": "pluginsOperatorEnableDisableMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "70d2f73b6cb891befdf09342902728d4",
    "id": null,
    "metadata": {},
    "name": "pluginsOperatorEnableDisableMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsOperatorEnableDisableMutation(\n  $pluginName: String!\n  $operatorName: String!\n  $enabled: Boolean\n) {\n  updatePlugin(name: $pluginName, operatorSettings: {name: $operatorName, enabled: $enabled}) {\n    name\n    operators {\n      enabled\n      name\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "496f85603c8b7bd326a6102897e5a1dd";

export default node;
