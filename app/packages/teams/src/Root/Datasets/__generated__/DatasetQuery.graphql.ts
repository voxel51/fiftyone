/**
 * @generated SignedSource<<61f0cd6ea5e5e48be11e40af6f7a4a3f>>
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
};
export type DatasetQueryVariables = DatasetQuery$variables;
export type DatasetQuery$data = {
  readonly datasets: {
    readonly edges: ReadonlyArray<{
      readonly cursor: string;
      readonly node: {
        readonly name: string;
      };
    }>;
  };
  readonly dataset: {
    readonly id: string;
    readonly name: string;
    readonly mediaType: MediaType;
    readonly sampleFields: ReadonlyArray<{
      readonly ftype: string;
      readonly subfield: string | null;
      readonly embeddedDocType: string | null;
      readonly path: string;
      readonly dbField: string | null;
    }>;
    readonly frameFields: ReadonlyArray<{
      readonly ftype: string;
      readonly subfield: string | null;
      readonly embeddedDocType: string | null;
      readonly path: string;
      readonly dbField: string | null;
    }>;
    readonly appSidebarGroups: ReadonlyArray<{
      readonly name: string;
      readonly paths: ReadonlyArray<string>;
    }> | null;
    readonly maskTargets: ReadonlyArray<{
      readonly name: string;
      readonly targets: ReadonlyArray<{
        readonly target: number;
        readonly value: string;
      }>;
    }>;
    readonly defaultMaskTargets: ReadonlyArray<{
      readonly target: number;
      readonly value: string;
    }> | null;
    readonly evaluations: ReadonlyArray<{
      readonly key: string;
      readonly version: string;
      readonly timestamp: string;
      readonly viewStages: ReadonlyArray<string>;
      readonly config: {
        readonly cls: string;
        readonly predField: string;
        readonly gtField: string;
      };
    }>;
    readonly brainMethods: ReadonlyArray<{
      readonly key: string;
      readonly version: string;
      readonly timestamp: string;
      readonly viewStages: ReadonlyArray<string>;
      readonly config: {
        readonly cls: string;
        readonly embeddingsField: string | null;
        readonly method: string;
        readonly patchesField: string | null;
      };
    }>;
    readonly lastLoadedAt: string;
    readonly createdAt: string;
    readonly version: string;
  };
  readonly viewer: {
    readonly config: {
      readonly timezone: string;
      readonly colorscale: string;
      readonly colorPool: ReadonlyArray<string>;
      readonly gridZoom: number;
      readonly loopVideos: boolean;
      readonly notebookHeight: number;
      readonly showConfidence: boolean;
      readonly showIndex: boolean;
      readonly showLabel: boolean;
      readonly showTooltip: boolean;
      readonly useFrameNumber: boolean;
    };
    readonly colorscale: ReadonlyArray<ReadonlyArray<number>> | null;
  };
};
export type DatasetQueryResponse = DatasetQuery$data;
export type DatasetQuery = {
  variables: DatasetQueryVariables;
  response: DatasetQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "name",
      },
    ],
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "cursor",
      storageKey: null,
    },
    v2 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "name",
      storageKey: null,
    },
    v3 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "__typename",
      storageKey: null,
    },
    v4 = {
      alias: null,
      args: null,
      concreteType: "PageInfo",
      kind: "LinkedField",
      name: "pageInfo",
      plural: false,
      selections: [
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "endCursor",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "hasNextPage",
          storageKey: null,
        },
      ],
      storageKey: null,
    },
    v5 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "id",
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
      args: [
        {
          kind: "Variable",
          name: "name",
          variableName: "name",
        },
      ],
      concreteType: "Dataset",
      kind: "LinkedField",
      name: "dataset",
      plural: false,
      selections: [
        v5 /*: any*/,
        v2 /*: any*/,
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
          concreteType: "SidebarGroup",
          kind: "LinkedField",
          name: "appSidebarGroups",
          plural: true,
          selections: [
            v2 /*: any*/,
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
            v2 /*: any*/,
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
      ],
      storageKey: null,
    },
    v14 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "colorscale",
      storageKey: null,
    },
    v15 = {
      alias: null,
      args: null,
      concreteType: "AppConfig",
      kind: "LinkedField",
      name: "config",
      plural: false,
      selections: [
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "timezone",
          storageKey: null,
        },
        v14 /*: any*/,
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "colorPool",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "gridZoom",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "loopVideos",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "notebookHeight",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "showConfidence",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "showIndex",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "showLabel",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "showTooltip",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "useFrameNumber",
          storageKey: null,
        },
      ],
      storageKey: null,
    },
    v16 = [
      {
        kind: "Literal",
        name: "first",
        value: 1000,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "DatasetQuery",
      selections: [
        {
          alias: "datasets",
          args: null,
          concreteType: "DatasetConnection",
          kind: "LinkedField",
          name: "__Dataset_query_datasets_connection",
          plural: false,
          selections: [
            {
              alias: null,
              args: null,
              concreteType: "DatasetEdge",
              kind: "LinkedField",
              name: "edges",
              plural: true,
              selections: [
                v1 /*: any*/,
                {
                  alias: null,
                  args: null,
                  concreteType: "Dataset",
                  kind: "LinkedField",
                  name: "node",
                  plural: false,
                  selections: [v2 /*: any*/, v3 /*: any*/],
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
            v4 /*: any*/,
          ],
          storageKey: null,
        },
        v13 /*: any*/,
        {
          alias: null,
          args: null,
          concreteType: "User",
          kind: "LinkedField",
          name: "viewer",
          plural: false,
          selections: [v15 /*: any*/, v14 /*: any*/],
          storageKey: null,
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "DatasetQuery",
      selections: [
        {
          alias: null,
          args: v16 /*: any*/,
          concreteType: "DatasetConnection",
          kind: "LinkedField",
          name: "datasets",
          plural: false,
          selections: [
            {
              alias: null,
              args: null,
              concreteType: "DatasetEdge",
              kind: "LinkedField",
              name: "edges",
              plural: true,
              selections: [
                v1 /*: any*/,
                {
                  alias: null,
                  args: null,
                  concreteType: "Dataset",
                  kind: "LinkedField",
                  name: "node",
                  plural: false,
                  selections: [v2 /*: any*/, v5 /*: any*/, v3 /*: any*/],
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
            v4 /*: any*/,
          ],
          storageKey: "datasets(first:1000)",
        },
        {
          alias: null,
          args: v16 /*: any*/,
          filters: null,
          handle: "connection",
          key: "Dataset_query_datasets",
          kind: "LinkedHandle",
          name: "datasets",
        },
        v13 /*: any*/,
        {
          alias: null,
          args: null,
          concreteType: "User",
          kind: "LinkedField",
          name: "viewer",
          plural: false,
          selections: [v15 /*: any*/, v14 /*: any*/, v5 /*: any*/],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: "8c3114e7c2fe6fe75749c5aab46213c5",
      id: null,
      metadata: {
        connection: [
          {
            count: null,
            cursor: null,
            direction: "forward",
            path: ["datasets"],
          },
        ],
      },
      name: "DatasetQuery",
      operationKind: "query",
      text:
        "query DatasetQuery(\n  $name: String!\n) {\n  datasets(first: 1000) {\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n  dataset(name: $name) {\n    id\n    name\n    mediaType\n    sampleFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    frameFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    appSidebarGroups {\n      name\n      paths\n    }\n    maskTargets {\n      name\n      targets {\n        target\n        value\n      }\n    }\n    defaultMaskTargets {\n      target\n      value\n    }\n    evaluations {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        predField\n        gtField\n      }\n    }\n    brainMethods {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        embeddingsField\n        method\n        patchesField\n      }\n    }\n    lastLoadedAt\n    createdAt\n    version\n  }\n  viewer {\n    config {\n      timezone\n      colorscale\n      colorPool\n      gridZoom\n      loopVideos\n      notebookHeight\n      showConfidence\n      showIndex\n      showLabel\n      showTooltip\n      useFrameNumber\n    }\n    colorscale\n    id\n  }\n}\n",
    },
  };
})();

(node as any).hash = "62923f9f5e656c945c4ac033c18c732f";

export default node;
