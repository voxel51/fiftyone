/**
 * @generated SignedSource<<b3df6bfbb118ec7bd55dad61f8bcca10>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
export type MediaType = "image" | "video" | "%future added value";
export type DatasetQuery$variables = {
  name: string;
  view?: Array | null;
};
export type DatasetQuery$data = {
  readonly dataset: {
    readonly appSidebarGroups: ReadonlyArray<{
      readonly name: string;
      readonly paths: ReadonlyArray<string>;
    }> | null;
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
};
export type DatasetQuery = {
  response: DatasetQuery$data;
  variables: DatasetQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "name",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "view",
      },
    ],
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "name",
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
    },
    v11 = [
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
          v1 /*: any*/,
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "mediaType",
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
            concreteType: "SidebarGroup",
            kind: "LinkedField",
            name: "appSidebarGroups",
            plural: true,
            selections: [
              v1 /*: any*/,
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
          {
            alias: null,
            args: null,
            concreteType: "NamedTargets",
            kind: "LinkedField",
            name: "maskTargets",
            plural: true,
            selections: [
              v1 /*: any*/,
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
            selections: [v1 /*: any*/, v9 /*: any*/, v10 /*: any*/],
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
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "DatasetQuery",
      selections: v11 /*: any*/,
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "DatasetQuery",
      selections: v11 /*: any*/,
    },
    params: {
      cacheID: "2e788a38f5add212d3ac68a4ea5c3b00",
      id: null,
      metadata: {},
      name: "DatasetQuery",
      operationKind: "query",
      text: "query DatasetQuery(\n  $name: String!\n  $view: BSONArray\n) {\n  dataset(name: $name, view: $view) {\n    id\n    name\n    mediaType\n    sampleFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    frameFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    appSidebarGroups {\n      name\n      paths\n    }\n    maskTargets {\n      name\n      targets {\n        target\n        value\n      }\n    }\n    defaultMaskTargets {\n      target\n      value\n    }\n    evaluations {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        predField\n        gtField\n      }\n    }\n    brainMethods {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        embeddingsField\n        method\n        patchesField\n      }\n    }\n    lastLoadedAt\n    createdAt\n    skeletons {\n      name\n      labels\n      edges\n    }\n    defaultSkeleton {\n      labels\n      edges\n    }\n    version\n    viewCls\n  }\n}\n",
    },
  };
})();

(node as any).hash = "8db4b5cfa990a8b34fd487168771584c";

export default node;
