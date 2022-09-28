/**
 * @generated SignedSource<<20ff7661f25cda39f0261ef3be845f4e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from "relay-runtime";
export type MediaType =
  | "group"
  | "image"
  | "point_cloud"
  | "video"
  | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type DatasetData_query$data = {
  readonly dataset: {
    readonly appConfig: {
      readonly gridMediaField: string;
      readonly mediaFields: ReadonlyArray<string>;
      readonly plugins: object | null;
      readonly sidebarGroups: ReadonlyArray<{
        readonly name: string;
        readonly paths: ReadonlyArray<string>;
      }> | null;
    } | null;
    readonly brainMethods: ReadonlyArray<{
      readonly config: {
        readonly cls: string;
        readonly embeddingsField: string | null;
        readonly method: string | null;
        readonly patchesField: string | null;
      } | null;
      readonly key: string;
      readonly timestamp: string | null;
      readonly version: string | null;
      readonly viewStages: ReadonlyArray<string> | null;
    }>;
    readonly createdAt: string | null;
    readonly defaultGroupSlice: string | null;
    readonly defaultMaskTargets: ReadonlyArray<{
      readonly target: number;
      readonly value: string;
    }> | null;
    readonly defaultSkeleton: {
      readonly edges: ReadonlyArray<ReadonlyArray<number>>;
      readonly labels: ReadonlyArray<string> | null;
    } | null;
    readonly evaluations: ReadonlyArray<{
      readonly config: {
        readonly cls: string;
        readonly gtField: string | null;
        readonly predField: string | null;
      } | null;
      readonly key: string;
      readonly timestamp: string | null;
      readonly version: string | null;
      readonly viewStages: ReadonlyArray<string> | null;
    }>;
    readonly frameFields: ReadonlyArray<{
      readonly dbField: string | null;
      readonly embeddedDocType: string | null;
      readonly ftype: string;
      readonly path: string;
      readonly subfield: string | null;
    }>;
    readonly groupField: string | null;
    readonly groupMediaTypes: ReadonlyArray<{
      readonly mediaType: MediaType;
      readonly name: string;
    }> | null;
    readonly id: string;
    readonly lastLoadedAt: string | null;
    readonly maskTargets: ReadonlyArray<{
      readonly name: string;
      readonly targets: ReadonlyArray<{
        readonly target: number;
        readonly value: string;
      }>;
    }>;
    readonly mediaType: MediaType | null;
    readonly name: string;
    readonly sampleFields: ReadonlyArray<{
      readonly dbField: string | null;
      readonly embeddedDocType: string | null;
      readonly ftype: string;
      readonly path: string;
      readonly subfield: string | null;
    }>;
    readonly skeletons: ReadonlyArray<{
      readonly edges: ReadonlyArray<ReadonlyArray<number>>;
      readonly labels: ReadonlyArray<string> | null;
      readonly name: string;
    }>;
    readonly version: string | null;
    readonly viewCls: string | null;
  } | null;
  readonly " $fragmentType": "DatasetData_query";
};
export type DatasetData_query$key = {
  readonly " $data"?: DatasetData_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetData_query">;
};

import DatasetDataQuery_graphql from "./DatasetDataQuery.graphql";

const node: ReaderFragment = (function () {
  var v0 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "name",
      storageKey: null,
    },
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "mediaType",
      storageKey: null,
    },
    v2 = [
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "ftype",
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "subfield",
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "embeddedDocType",
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "path",
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "dbField",
        storageKey: null,
      },
    ],
    v3 = [
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "target",
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "value",
        storageKey: null,
      },
    ],
    v4 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "key",
      storageKey: null,
    },
    v5 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "version",
      storageKey: null,
    },
    v6 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "timestamp",
      storageKey: null,
    },
    v7 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "viewStages",
      storageKey: null,
    },
    v8 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "cls",
      storageKey: null,
    },
    v9 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "labels",
      storageKey: null,
    },
    v10 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "edges",
      storageKey: null,
    };
  return {
    argumentDefinitions: [
      {
        kind: "RootArgument",
        name: "name",
      },
      {
        kind: "RootArgument",
        name: "view",
      },
    ],
    kind: "Fragment",
    metadata: {
      refetch: {
        connection: null,
        fragmentPathInResult: [],
        operation: DatasetDataQuery_graphql,
      },
    },
    name: "DatasetData_query",
    selections: [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "name",
            variableName: "name",
          },
          {
            kind: "Variable",
            name: "view",
            variableName: "view",
          },
        ],
        concreteType: "Dataset",
        kind: "LinkedField",
        name: "dataset",
        plural: false,
        selections: [
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "id",
            storageKey: null,
          },
          v0 /*: any*/,
          v1 /*: any*/,
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "defaultGroupSlice",
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "groupField",
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "Group",
            kind: "LinkedField",
            name: "groupMediaTypes",
            plural: true,
            selections: [v0 /*: any*/, v1 /*: any*/],
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "DatasetAppConfig",
            kind: "LinkedField",
            name: "appConfig",
            plural: false,
            selections: [
              {
                alias: null,
                args: null,
                kind: "ScalarField",
                name: "gridMediaField",
                storageKey: null,
              },
              {
                alias: null,
                args: null,
                kind: "ScalarField",
                name: "mediaFields",
                storageKey: null,
              },
              {
                alias: null,
                args: null,
                kind: "ScalarField",
                name: "plugins",
                storageKey: null,
              },
              {
                alias: null,
                args: null,
                concreteType: "SidebarGroup",
                kind: "LinkedField",
                name: "sidebarGroups",
                plural: true,
                selections: [
                  v0 /*: any*/,
                  {
                    alias: null,
                    args: null,
                    kind: "ScalarField",
                    name: "paths",
                    storageKey: null,
                  },
                ],
                storageKey: null,
              },
            ],
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "SampleField",
            kind: "LinkedField",
            name: "sampleFields",
            plural: true,
            selections: v2 /*: any*/,
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "SampleField",
            kind: "LinkedField",
            name: "frameFields",
            plural: true,
            selections: v2 /*: any*/,
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "NamedTargets",
            kind: "LinkedField",
            name: "maskTargets",
            plural: true,
            selections: [
              v0 /*: any*/,
              {
                alias: null,
                args: null,
                concreteType: "Target",
                kind: "LinkedField",
                name: "targets",
                plural: true,
                selections: v3 /*: any*/,
                storageKey: null,
              },
            ],
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "Target",
            kind: "LinkedField",
            name: "defaultMaskTargets",
            plural: true,
            selections: v3 /*: any*/,
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "EvaluationRun",
            kind: "LinkedField",
            name: "evaluations",
            plural: true,
            selections: [
              v4 /*: any*/,
              v5 /*: any*/,
              v6 /*: any*/,
              v7 /*: any*/,
              {
                alias: null,
                args: null,
                concreteType: "EvaluationRunConfig",
                kind: "LinkedField",
                name: "config",
                plural: false,
                selections: [
                  v8 /*: any*/,
                  {
                    alias: null,
                    args: null,
                    kind: "ScalarField",
                    name: "predField",
                    storageKey: null,
                  },
                  {
                    alias: null,
                    args: null,
                    kind: "ScalarField",
                    name: "gtField",
                    storageKey: null,
                  },
                ],
                storageKey: null,
              },
            ],
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "BrainRun",
            kind: "LinkedField",
            name: "brainMethods",
            plural: true,
            selections: [
              v4 /*: any*/,
              v5 /*: any*/,
              v6 /*: any*/,
              v7 /*: any*/,
              {
                alias: null,
                args: null,
                concreteType: "BrainRunConfig",
                kind: "LinkedField",
                name: "config",
                plural: false,
                selections: [
                  v8 /*: any*/,
                  {
                    alias: null,
                    args: null,
                    kind: "ScalarField",
                    name: "embeddingsField",
                    storageKey: null,
                  },
                  {
                    alias: null,
                    args: null,
                    kind: "ScalarField",
                    name: "method",
                    storageKey: null,
                  },
                  {
                    alias: null,
                    args: null,
                    kind: "ScalarField",
                    name: "patchesField",
                    storageKey: null,
                  },
                ],
                storageKey: null,
              },
            ],
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "lastLoadedAt",
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "createdAt",
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "NamedKeypointSkeleton",
            kind: "LinkedField",
            name: "skeletons",
            plural: true,
            selections: [v0 /*: any*/, v9 /*: any*/, v10 /*: any*/],
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            concreteType: "KeypointSkeleton",
            kind: "LinkedField",
            name: "defaultSkeleton",
            plural: false,
            selections: [v9 /*: any*/, v10 /*: any*/],
            storageKey: null,
          },
          v5 /*: any*/,
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "viewCls",
            storageKey: null,
          },
        ],
        storageKey: null,
      },
    ],
    type: "Query",
    abstractKey: null,
  };
})();

(node as any).hash = "91a003d606f6f1cfc53cc8ed4db8983c";

export default node;
