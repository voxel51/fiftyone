/**
 * @generated SignedSource<<3b1567795f61a784e69ff54dbf060a15>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type SidebarMode = "all" | "best" | "fast" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type datasetAppConfigFragment$data = {
  readonly colorScheme: {
    readonly colorPool: ReadonlyArray<string>;
    readonly fields: ReadonlyArray<{
      readonly colorByAttribute: boolean;
      readonly fieldColor: string;
      readonly path: string;
      readonly valueColors: ReadonlyArray<{
        readonly color: string;
        readonly value: string;
      }>;
    }> | null;
  } | null;
  readonly gridMediaField: string;
  readonly mediaFields: ReadonlyArray<string> | null;
  readonly modalMediaField: string;
  readonly plugins: object | null;
  readonly sidebarMode: SidebarMode | null;
  readonly " $fragmentType": "datasetAppConfigFragment";
};
export type datasetAppConfigFragment$key = {
  readonly " $data"?: datasetAppConfigFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"datasetAppConfigFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "datasetAppConfigFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "gridMediaField",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaFields",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "modalMediaField",
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
      "name": "sidebarMode",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "ColorScheme",
      "kind": "LinkedField",
      "name": "colorScheme",
      "plural": false,
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
      "storageKey": null
    }
  ],
  "type": "DatasetAppConfig",
  "abstractKey": null
};

(node as any).hash = "9107945720b5add44f990a9861853cf9";

export default node;
