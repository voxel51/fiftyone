/**
 * Shared transport and client-side types for the multimodal workspace renderer.
 */

export type MultimodalPanelArchetype = "image" | "3d";
export type MultimodalStreamKind =
  | "image"
  | "3d"
  | "transform"
  | "location"
  | "other";
export type MultimodalLocationMode = "position" | "pose" | "navsat";
export type MultimodalFollowMode = "off" | "position" | "pose";
export type MultimodalUpAxis = "x" | "y" | "z";
export type MultimodalBufferMode = "raw";
export type MultimodalSyncTimestampSource =
  | "header.stamp"
  | "publish_time"
  | "log_time";
export type MultimodalSyncFallback = "publish_time" | "log_time";
export type MultimodalSyncMode = "nearest" | "strict" | "latest";

export type MultimodalTimeRange = {
  startNs: number;
  endNs: number;
};

export type MultimodalStreamDescriptor = {
  streamId: string;
  topic: string;
  schemaName: string;
  schemaEncoding: string;
  messageEncoding: string;
  kind: MultimodalStreamKind;
  frameId: string | null;
  affordances: string[];
  compatiblePanels: MultimodalPanelArchetype[];
  channelId: number;
  schemaId: number;
  timeRange: MultimodalTimeRange;
  messageCount: number | null;
};

export type MultimodalFrameDescriptor = {
  frameId: string;
};

export type MultimodalTransformDescriptor = {
  topic: string;
  parentFrameId: string;
  childFrameId: string;
  isStatic: boolean;
};

export type MultimodalLocationTopicDescriptor = {
  streamId: string;
  topic: string;
  mode: MultimodalLocationMode;
  frameId: string | null;
};

export type MultimodalCatalog = {
  sceneId: string;
  datasetId: string;
  sampleId: string;
  mediaField: string;
  mediaPath: string;
  sourceKind: string;
  catalogVersion: string;
  timeRange: MultimodalTimeRange;
  streams: MultimodalStreamDescriptor[];
  frames: MultimodalFrameDescriptor[];
  transforms: MultimodalTransformDescriptor[];
  locationTopics: MultimodalLocationTopicDescriptor[];
};

export type MultimodalSyncConfig = {
  timestampSource: MultimodalSyncTimestampSource;
  fallback: MultimodalSyncFallback;
  mode: MultimodalSyncMode;
};

export type MultimodalFrameConfig = {
  fixedFrameId: string | null;
  displayFrameId: string | null;
  followMode: MultimodalFollowMode;
  locationStreamId: string | null;
  enuFrameId: string | null;
};

export type MultimodalSceneConfig = {
  upAxis: MultimodalUpAxis;
  backgroundColor: string;
};

/** Default grid placement for one multimodal workspace panel. */
export type MultimodalPanelLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MultimodalPanelPlan = {
  panelId: string;
  archetype: MultimodalPanelArchetype;
  title: string;
  renderStreamId: string | null;
  visibleStreamIds: string[];
  frameConfig: MultimodalFrameConfig;
  sceneConfig: MultimodalSceneConfig;
  layout: MultimodalPanelLayout;
};

export type MultimodalRenderingPlan = {
  sceneId: string;
  mediaField: string;
  sourceKind: string;
  sync: MultimodalSyncConfig;
  panels: MultimodalPanelPlan[];
};

export type MultimodalWorkspaceResponse = {
  catalog: MultimodalCatalog;
  renderingPlan: MultimodalRenderingPlan;
};

export type MultimodalWorkspaceState = {
  sceneId: string;
  sync: MultimodalSyncConfig;
  activePanelId: string | null;
  maximizedPanelId: string | null;
  sidebarCollapsed: boolean;
  panels: MultimodalPanelLayoutState[];
};

export type MultimodalPanelLayoutState = MultimodalPanelPlan;

export type FetchMultimodalWorkspaceParams = {
  datasetId: string;
  sampleId: string;
  mediaField: string;
  sourceKind?: string;
};

export type MultimodalStreamWindowRequest = {
  mediaField: string;
  sourceKind?: string;
  streamIds: string[];
  startTimeNs: number;
  endTimeNs: number;
  maxMessagesPerStream?: number;
  mode?: MultimodalBufferMode;
};

export type FetchMultimodalBufferParams = {
  datasetId: string;
  sampleId: string;
  request: MultimodalStreamWindowRequest;
};

/** Request payload for the small boot-time raw window used for first paint. */
export type MultimodalBootstrapWindowRequest = {
  mediaField: string;
  sourceKind?: string;
  anchorTimeNs: number;
  renderStreamIds: string[];
  transformStreamIds: string[];
  locationStreamIds: string[];
  transformWindowNs?: number;
};

/** Route params for one boot-time raw window fetch. */
export type FetchMultimodalBootstrapWindowParams = {
  datasetId: string;
  sampleId: string;
  request: MultimodalBootstrapWindowRequest;
};

export type MultimodalTimelineIndexRequest = {
  mediaField: string;
  sourceKind?: string;
  streamIds?: string[];
  timestampSource?: MultimodalSyncTimestampSource;
  fallback?: MultimodalSyncFallback;
};

export type MultimodalTimelineSample = {
  timestampNs: number;
  logTimeNs: number;
  publishTimeNs: number;
};

export type MultimodalTimelineStream = {
  streamId: string;
  samples: MultimodalTimelineSample[];
};

export type MultimodalTimelineIndexResponse = {
  sceneId: string;
  timestampSource: MultimodalSyncTimestampSource;
  timestampsNs: number[];
  streams: MultimodalTimelineStream[];
};

export type FetchMultimodalTimelineParams = {
  datasetId: string;
  sampleId: string;
  request: MultimodalTimelineIndexRequest;
};

export type MultimodalRawMessageTransport = {
  messageId: string;
  syncTimestampNs: number;
  logTimeNs: number;
  publishTimeNs: number;
  payloadB64: string;
};

export type MultimodalRawMessage = Omit<
  MultimodalRawMessageTransport,
  "payloadB64"
> & {
  payload: Uint8Array;
};

export type MultimodalRawBufferTransportResponse = {
  sceneId: string;
  window: {
    startTimeNs: number;
    endTimeNs: number;
  };
  streams: {
    streamId: string;
    schemaName: string;
    messageEncoding: string;
    messages: MultimodalRawMessageTransport[];
  }[];
};

export type MultimodalRawBufferResponse = Omit<
  MultimodalRawBufferTransportResponse,
  "streams"
> & {
  streams: {
    streamId: string;
    schemaName: string;
    messageEncoding: string;
    messages: MultimodalRawMessage[];
  }[];
};
