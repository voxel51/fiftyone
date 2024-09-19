/**
 * @generated SignedSource<<56f16e0deb3e8c136e29c89af768bca3>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type LabelFormatOptionsEnum = "COCODetectionDataset" | "CSVDataset" | "CVATImageDataset" | "CVATVideoDataset" | "FiftyOneDataset" | "FiftyOneImageClassificationDataset" | "FiftyOneImageDetectionDataset" | "FiftyOneTemporalDetectionDataset" | "ImageClassificationDirectoryTree" | "ImageSegmentationDirectory" | "KITTIDetectionDataset" | "TFImageClassificationDataset" | "TFObjectDetectionDataset" | "VOCDetectionDataset" | "VideoClassificationDirectoryTree" | "YOLOv4Dataset" | "YOLOv5Dataset" | "%future added value";
export type ViewSelectors = {
  filters?: any | null;
  sampleIds?: ReadonlyArray<string> | null;
  viewStages?: ReadonlyArray<any> | null;
};
export type LabelFormatOptions = {
  fields: ReadonlyArray<string>;
  format: LabelFormatOptionsEnum;
  labelField?: string | null;
};
export type DatasetExportMutation$variables = {
  cloudStoragePath?: string | null;
  datasetIdentifier: string;
  exportViewSelectors: ViewSelectors;
  includeFilepaths: boolean;
  includeLabels?: LabelFormatOptions | null;
  includeMedia: boolean;
  includeTags: boolean;
  snapshot?: string | null;
};
export type DatasetExportMutation$data = {
  readonly exportView: string | null;
};
export type DatasetExportMutation = {
  response: DatasetExportMutation$data;
  variables: DatasetExportMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "cloudStoragePath"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetIdentifier"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "exportViewSelectors"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "includeFilepaths"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "includeLabels"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "includeMedia"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "includeTags"
},
v7 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "snapshot"
},
v8 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "cloudStoragePath",
        "variableName": "cloudStoragePath"
      },
      {
        "kind": "Variable",
        "name": "datasetIdentifier",
        "variableName": "datasetIdentifier"
      },
      {
        "kind": "Variable",
        "name": "exportViewSelectors",
        "variableName": "exportViewSelectors"
      },
      {
        "kind": "Variable",
        "name": "includeFilepaths",
        "variableName": "includeFilepaths"
      },
      {
        "kind": "Variable",
        "name": "includeLabels",
        "variableName": "includeLabels"
      },
      {
        "kind": "Variable",
        "name": "includeMedia",
        "variableName": "includeMedia"
      },
      {
        "kind": "Variable",
        "name": "includeTags",
        "variableName": "includeTags"
      },
      {
        "kind": "Variable",
        "name": "snapshot",
        "variableName": "snapshot"
      }
    ],
    "kind": "ScalarField",
    "name": "exportView",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/),
      (v7/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetExportMutation",
    "selections": (v8/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v6/*: any*/),
      (v5/*: any*/),
      (v4/*: any*/),
      (v0/*: any*/),
      (v7/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetExportMutation",
    "selections": (v8/*: any*/)
  },
  "params": {
    "cacheID": "1dd867b2b41a9da57e2338f0d25ad2cc",
    "id": null,
    "metadata": {},
    "name": "DatasetExportMutation",
    "operationKind": "mutation",
    "text": "mutation DatasetExportMutation(\n  $datasetIdentifier: String!\n  $exportViewSelectors: ViewSelectors!\n  $includeFilepaths: Boolean!\n  $includeTags: Boolean!\n  $includeMedia: Boolean!\n  $includeLabels: LabelFormatOptions\n  $cloudStoragePath: String = null\n  $snapshot: String = null\n) {\n  exportView(datasetIdentifier: $datasetIdentifier, exportViewSelectors: $exportViewSelectors, includeFilepaths: $includeFilepaths, includeTags: $includeTags, includeMedia: $includeMedia, includeLabels: $includeLabels, cloudStoragePath: $cloudStoragePath, snapshot: $snapshot)\n}\n"
  }
};
})();

(node as any).hash = "c3165d48d89a01aab6c1c534d9bca425";

export default node;
