/**
 * @generated SignedSource<<d7ae8264474577fa07f3f605f2124929>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetDataQuery$variables = {
  name: string;
  view?: Array | null;
};
export type DatasetDataQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"DatasetData_query">;
};
export type DatasetDataQuery = {
  response: DatasetDataQuery$data;
  variables: DatasetDataQuery$variables;
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
    v2 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "mediaType",
      storageKey: null,
    },
    v3 = [
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
    v4 = [
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
    v5 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "key",
      storageKey: null,
    },
    v6 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "version",
      storageKey: null,
    },
    v7 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "timestamp",
      storageKey: null,
    },
    v8 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "viewStages",
      storageKey: null,
    },
    v9 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "cls",
      storageKey: null,
    },
    v10 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "labels",
      storageKey: null,
    },
    v11 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "edges",
      storageKey: null,
    };
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "DatasetDataQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "DatasetData_query",
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "DatasetDataQuery",
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
            v1 /*: any*/,
            v2 /*: any*/,
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
              selections: [v1 /*: any*/, v2 /*: any*/],
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
              selections: v3 /*: any*/,
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: "SampleField",
              kind: "LinkedField",
              name: "frameFields",
              plural: true,
              selections: v3 /*: any*/,
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
                  selections: v4 /*: any*/,
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
              selections: v4 /*: any*/,
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
                v5 /*: any*/,
                v6 /*: any*/,
                v7 /*: any*/,
                v8 /*: any*/,
                {
                  alias: null,
                  args: null,
                  concreteType: "EvaluationRunConfig",
                  kind: "LinkedField",
                  name: "config",
                  plural: false,
                  selections: [
                    v9 /*: any*/,
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
                v5 /*: any*/,
                v6 /*: any*/,
                v7 /*: any*/,
                v8 /*: any*/,
                {
                  alias: null,
                  args: null,
                  concreteType: "BrainRunConfig",
                  kind: "LinkedField",
                  name: "config",
                  plural: false,
                  selections: [
                    v9 /*: any*/,
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
              selections: [v1 /*: any*/, v10 /*: any*/, v11 /*: any*/],
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: "KeypointSkeleton",
              kind: "LinkedField",
              name: "defaultSkeleton",
              plural: false,
              selections: [v10 /*: any*/, v11 /*: any*/],
              storageKey: null,
            },
            v6 /*: any*/,
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
    },
    params: {
      cacheID: "4956af9acea1e4c5667b913ca0ebb857",
      id: null,
      metadata: {},
      name: "DatasetDataQuery",
      operationKind: "query",
      text: "query DatasetDataQuery(\n  $name: String!\n  $view: BSONArray\n) {\n  ...DatasetData_query\n}\n\nfragment DatasetData_query on Query {\n  dataset(name: $name, view: $view) {\n    id\n    name\n    mediaType\n    defaultGroupSlice\n    groupField\n    groupMediaTypes {\n      name\n      mediaType\n    }\n    appConfig {\n      gridMediaField\n      mediaFields\n      plugins\n      sidebarGroups {\n        name\n        paths\n      }\n    }\n    sampleFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    frameFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    maskTargets {\n      name\n      targets {\n        target\n        value\n      }\n    }\n    defaultMaskTargets {\n      target\n      value\n    }\n    evaluations {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        predField\n        gtField\n      }\n    }\n    brainMethods {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        embeddingsField\n        method\n        patchesField\n      }\n    }\n    lastLoadedAt\n    createdAt\n    skeletons {\n      name\n      labels\n      edges\n    }\n    defaultSkeleton {\n      labels\n      edges\n    }\n    version\n    viewCls\n  }\n}\n",
    },
  };
})();

(node as any).hash = "91a003d606f6f1cfc53cc8ed4db8983c";

export default node;
