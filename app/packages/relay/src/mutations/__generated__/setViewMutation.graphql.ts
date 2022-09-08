/**
 * @generated SignedSource<<b75ac5979a2526790501ced743a5fe6a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from "relay-runtime";
export type MediaType =
  | "group"
  | "image"
  | "point_cloud"
  | "video"
  | "%future added value";
export type setViewMutation$variables = {
  dataset: string;
  session?: string | null;
  subscription: string;
  view: Array;
};
export type setViewMutation$data = {
  readonly setView: {
    readonly dataset: {
      readonly appConfig: {
        readonly gridMediaField: string | null;
        readonly mediaFields: ReadonlyArray<string>;
        readonly plugins: object | null;
        readonly sidebarGroups: ReadonlyArray<{
          readonly name: string;
          readonly paths: ReadonlyArray<string> | null;
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
    };
    readonly view: Array;
  };
};
export type setViewMutation = {
  response: setViewMutation$data;
  variables: setViewMutation$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "dataset",
    },
    v1 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "session",
    },
    v2 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "subscription",
    },
    v3 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "view",
    },
    v4 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "name",
      storageKey: null,
    },
    v5 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "mediaType",
      storageKey: null,
    },
    v6 = [
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
    v7 = [
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
    v8 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "key",
      storageKey: null,
    },
    v9 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "version",
      storageKey: null,
    },
    v10 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "timestamp",
      storageKey: null,
    },
    v11 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "viewStages",
      storageKey: null,
    },
    v12 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "cls",
      storageKey: null,
    },
    v13 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "labels",
      storageKey: null,
    },
    v14 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "edges",
      storageKey: null,
    },
    v15 = [
      {
        alias: null,
        args: [
          {
            kind: "Variable",
            name: "dataset",
            variableName: "dataset",
          },
          {
            kind: "Variable",
            name: "session",
            variableName: "session",
          },
          {
            kind: "Variable",
            name: "subscription",
            variableName: "subscription",
          },
          {
            kind: "Variable",
            name: "view",
            variableName: "view",
          },
        ],
        concreteType: "ViewResponse",
        kind: "LinkedField",
        name: "setView",
        plural: false,
        selections: [
          {
            alias: null,
            args: null,
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
              v4 /*: any*/,
              v5 /*: any*/,
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
                selections: [v4 /*: any*/, v5 /*: any*/],
                storageKey: null,
              },
              {
                alias: null,
                args: null,
                concreteType: "SampleField",
                kind: "LinkedField",
                name: "sampleFields",
                plural: true,
                selections: v6 /*: any*/,
                storageKey: null,
              },
              {
                alias: null,
                args: null,
                concreteType: "SampleField",
                kind: "LinkedField",
                name: "frameFields",
                plural: true,
                selections: v6 /*: any*/,
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
                  v4 /*: any*/,
                  {
                    alias: null,
                    args: null,
                    concreteType: "Target",
                    kind: "LinkedField",
                    name: "targets",
                    plural: true,
                    selections: v7 /*: any*/,
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
                selections: v7 /*: any*/,
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
                  v8 /*: any*/,
                  v9 /*: any*/,
                  v10 /*: any*/,
                  v11 /*: any*/,
                  {
                    alias: null,
                    args: null,
                    concreteType: "EvaluationRunConfig",
                    kind: "LinkedField",
                    name: "config",
                    plural: false,
                    selections: [
                      v12 /*: any*/,
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
                  v8 /*: any*/,
                  v9 /*: any*/,
                  v10 /*: any*/,
                  v11 /*: any*/,
                  {
                    alias: null,
                    args: null,
                    concreteType: "BrainRunConfig",
                    kind: "LinkedField",
                    name: "config",
                    plural: false,
                    selections: [
                      v12 /*: any*/,
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
              v9 /*: any*/,
              {
                alias: null,
                args: null,
                kind: "ScalarField",
                name: "viewCls",
                storageKey: null,
              },
              {
                alias: null,
                args: null,
                concreteType: "NamedKeypointSkeleton",
                kind: "LinkedField",
                name: "skeletons",
                plural: true,
                selections: [v4 /*: any*/, v13 /*: any*/, v14 /*: any*/],
                storageKey: null,
              },
              {
                alias: null,
                args: null,
                concreteType: "KeypointSkeleton",
                kind: "LinkedField",
                name: "defaultSkeleton",
                plural: false,
                selections: [v13 /*: any*/, v14 /*: any*/],
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
                      v4 /*: any*/,
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
            ],
            storageKey: null,
          },
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "view",
            storageKey: null,
          },
        ],
        storageKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: [
        v0 /*: any*/,
        v1 /*: any*/,
        v2 /*: any*/,
        v3 /*: any*/,
      ],
      kind: "Fragment",
      metadata: null,
      name: "setViewMutation",
      selections: v15 /*: any*/,
      type: "Mutation",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [
        v2 /*: any*/,
        v1 /*: any*/,
        v3 /*: any*/,
        v0 /*: any*/,
      ],
      kind: "Operation",
      name: "setViewMutation",
      selections: v15 /*: any*/,
    },
    params: {
      cacheID: "f77b81843ce4ed15c179538fdfe952e1",
      id: null,
      metadata: {},
      name: "setViewMutation",
      operationKind: "mutation",
      text: "mutation setViewMutation(\n  $subscription: String!\n  $session: String\n  $view: BSONArray!\n  $dataset: String!\n) {\n  setView(subscription: $subscription, session: $session, view: $view, dataset: $dataset) {\n    dataset {\n      id\n      name\n      mediaType\n      defaultGroupSlice\n      groupField\n      groupMediaTypes {\n        name\n        mediaType\n      }\n      sampleFields {\n        ftype\n        subfield\n        embeddedDocType\n        path\n        dbField\n      }\n      frameFields {\n        ftype\n        subfield\n        embeddedDocType\n        path\n        dbField\n      }\n      maskTargets {\n        name\n        targets {\n          target\n          value\n        }\n      }\n      defaultMaskTargets {\n        target\n        value\n      }\n      evaluations {\n        key\n        version\n        timestamp\n        viewStages\n        config {\n          cls\n          predField\n          gtField\n        }\n      }\n      brainMethods {\n        key\n        version\n        timestamp\n        viewStages\n        config {\n          cls\n          embeddingsField\n          method\n          patchesField\n        }\n      }\n      lastLoadedAt\n      createdAt\n      version\n      viewCls\n      skeletons {\n        name\n        labels\n        edges\n      }\n      defaultSkeleton {\n        labels\n        edges\n      }\n      appConfig {\n        gridMediaField\n        mediaFields\n        plugins\n        sidebarGroups {\n          name\n          paths\n        }\n      }\n    }\n    view\n  }\n}\n",
    },
  };
})();

(node as any).hash = "c2b00a920afa465428f16cc24fbd6508";

export default node;
