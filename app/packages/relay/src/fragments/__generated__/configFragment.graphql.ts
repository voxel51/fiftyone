/**
 * @generated SignedSource<<76dbde31ca65ef52a90158b76e0a57d1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type ColorBy = "field" | "instance" | "value" | "%future added value";
export type Theme = "browser" | "dark" | "light" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type configFragment$data = {
  readonly colorscale: ReadonlyArray<ReadonlyArray<number>> | null;
  readonly config: {
    readonly colorBy: ColorBy;
    readonly colorPool: ReadonlyArray<string>;
    readonly colorscale: string;
    readonly defaultQueryPerformance: boolean;
    readonly disableFrameFiltering: boolean;
    readonly enableQueryPerformance: boolean;
    readonly gridPageSize: number;
    readonly gridPagination: boolean;
    readonly gridZoom: number;
    readonly loopVideos: boolean;
    readonly maxQueryTime: number | null;
    readonly mediaFallback: boolean;
    readonly multicolorKeypoints: boolean;
    readonly notebookHeight: number;
    readonly plugins: object | null;
    readonly showConfidence: boolean;
    readonly showIndex: boolean;
    readonly showLabel: boolean;
    readonly showSkeletons: boolean;
    readonly showTooltip: boolean;
    readonly theme: Theme;
    readonly timezone: string | null;
    readonly useFrameNumber: boolean;
  };
  readonly " $fragmentType": "configFragment";
};
export type configFragment$key = {
  readonly " $data"?: configFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"configFragment">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorscale",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "configFragment",
  "selections": [
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
        (v0/*: any*/),
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "disableFrameFiltering",
          "storageKey": null
        },
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
          "name": "gridPagination",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "gridPageSize",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "enableQueryPerformance",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "defaultQueryPerformance",
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
          "name": "mediaFallback",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "maxQueryTime",
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
  ],
  "type": "Query",
  "abstractKey": null
};
})();

(node as any).hash = "d51a4f4f4c7ec6cc608d83197f263f04";

export default node;
