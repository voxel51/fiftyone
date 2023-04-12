/**
 * @generated SignedSource<<7ce083342d0050e1d6b70fd0eda2108c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type ColorBy = "field" | "instance" | "label" | "%future added value";
export type SidebarMode = "all" | "best" | "fast" | "%future added value";
export type Theme = "browser" | "dark" | "light" | "%future added value";
export type configQuery$variables = {};
export type configQuery$data = {
  readonly colorscale: ReadonlyArray<ReadonlyArray<number>> | null;
  readonly config: {
    readonly colorBy: ColorBy;
    readonly colorPool: ReadonlyArray<string>;
    readonly colorscale: string;
    readonly customizedColors: ReadonlyArray<{
      readonly attributeForColor: string | null;
      readonly attributeForOpacity: string | null;
      readonly field: string;
      readonly fieldColor: string | null;
      readonly labelColors: ReadonlyArray<{
        readonly color: string | null;
        readonly name: string | null;
      } | null> | null;
      readonly useFieldColor: boolean | null;
      readonly useLabelColors: boolean | null;
      readonly useOpacity: boolean | null;
    } | null> | null;
    readonly gridZoom: number;
    readonly loopVideos: boolean;
    readonly notebookHeight: number;
    readonly plugins: object | null;
    readonly showConfidence: boolean;
    readonly showIndex: boolean;
    readonly showLabel: boolean;
    readonly showSkeletons: boolean;
    readonly showTooltip: boolean;
    readonly sidebarMode: SidebarMode;
    readonly theme: Theme;
    readonly timezone: string | null;
    readonly useFrameNumber: boolean;
  };
};
export type configQuery = {
  response: configQuery$data;
  variables: configQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorscale",
  "storageKey": null
},
v1 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "AppConfig",
    "kind": "LinkedField",
    "name": "config",
    "plural": false,
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
        "concreteType": "CustomizeColor",
        "kind": "LinkedField",
        "name": "customizedColors",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "field",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "useFieldColor",
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
            "name": "attributeForColor",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "useOpacity",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "attributeForOpacity",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "useLabelColors",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "LabelSetting",
            "kind": "LinkedField",
            "name": "labelColors",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "name",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "color",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      (v0/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "gridZoom",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "loopVideos",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "notebookHeight",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "plugins",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "showConfidence",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "showIndex",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "showLabel",
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
        "kind": "ScalarField",
        "name": "showTooltip",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "sidebarMode",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "theme",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "timezone",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "useFrameNumber",
        "storageKey": null
      }
    ],
    "storageKey": null
  },
  (v0/*: any*/)
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "configQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "configQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "f07b7a721a1a85d176a74bc448542e53",
    "id": null,
    "metadata": {},
    "name": "configQuery",
    "operationKind": "query",
    "text": "query configQuery {\n  config {\n    colorBy\n    colorPool\n    customizedColors {\n      field\n      useFieldColor\n      fieldColor\n      attributeForColor\n      useOpacity\n      attributeForOpacity\n      useLabelColors\n      labelColors {\n        name\n        color\n      }\n    }\n    colorscale\n    gridZoom\n    loopVideos\n    notebookHeight\n    plugins\n    showConfidence\n    showIndex\n    showLabel\n    showSkeletons\n    showTooltip\n    sidebarMode\n    theme\n    timezone\n    useFrameNumber\n  }\n  colorscale\n}\n"
  }
};
})();

(node as any).hash = "b80c7a89d3502122e5548eb4d742365c";

export default node;
