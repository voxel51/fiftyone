/**
 * @generated SignedSource<<87d5fcf15f78b5b1f082312afde50070>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type SidebarMode = "all" | "best" | "disabled" | "fast" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type datasetAppConfigFragment$data = {
  readonly colorScheme: {
    readonly " $fragmentSpreads": FragmentRefs<"colorSchemeFragment">;
  } | null;
  readonly disableFrameFiltering: boolean | null;
  readonly gridMediaField: string;
  readonly mediaFallback: boolean;
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
          "args": null,
          "kind": "FragmentSpread",
          "name": "colorSchemeFragment"
        }
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaFallback",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "disableFrameFiltering",
      "storageKey": null
    }
  ],
  "type": "DatasetAppConfig",
  "abstractKey": null
};

(node as any).hash = "55835770b58a479f155023cd49d24397";

export default node;
