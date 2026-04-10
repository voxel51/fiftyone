/**
 * Shared transport and client-side types for the experimental MCAP backend.
 */

/** Supported MCAP stream roles recognized by the first backend adapter slice. */
export type McapStreamRole = "image_stream" | "pointcloud_stream";

/** Supported panel surface types for MCAP playback panels. */
export type McapPanelType = "2d" | "3d";

/** Supported content types rendered inside MCAP playback panels. */
export type McapContentType = "image" | "pointcloud";

/** Supported sidebar identifiers returned by the MCAP playback plan. */
export type McapSidebarType = "panel_config" | "stream_metadata";

/** Transport modes supported by the MCAP buffer contract. */
export type McapBufferMode = "raw" | "decoded";

/** Nanosecond time bounds for a scene, stream, or buffer window. */
export type McapTimeRange = {
  startNs: number;
  endNs: number;
};

/** Describes a single supported MCAP topic exposed by the backend adapter. */
export type McapStreamDescriptor = {
  streamId: string;
  topic: string;
  schemaName: string;
  schemaEncoding: string;
  messageEncoding: string;
  role: McapStreamRole;
  channelId: number;
  schemaId: number;
  timeRange: McapTimeRange;
  messageCount: number | null;
};

/** Describes how a supported MCAP stream should be opened as a panel. */
export type McapPanelPlan = {
  panelId: string;
  panelType: McapPanelType;
  contentType: McapContentType;
  streamId: string;
};

/** Describes a sample-backed MCAP scene resolved by the backend. */
export type McapSceneDescriptor = {
  sceneId: string;
  datasetId: string;
  sampleId: string;
  mediaField: string;
  mediaPath: string;
  timeRange: McapTimeRange;
  streams: McapStreamDescriptor[];
};

/** Describes default synchronization and panel layout for an MCAP scene. */
export type McapPlaybackPlan = {
  sceneId: string;
  sync: {
    timestampSource: "header.stamp";
    fallback: "log_time";
    mode: "nearest";
  };
  panels: McapPanelPlan[];
  sidebars: {
    left: McapSidebarType;
    right: McapSidebarType;
  };
};

/** Full scene-open payload returned by the MCAP scene endpoint. */
export type McapSceneOpenResponse = {
  scene: McapSceneDescriptor;
  playbackPlan: McapPlaybackPlan;
};

/** Required sample-scoped inputs for fetching an MCAP scene document. */
export type FetchMcapSceneParams = {
  datasetId: string;
  sampleId: string;
  mediaField: string;
};

/** Buffer request envelope sent to the MCAP buffer endpoint. */
export type McapBufferRequest = {
  mediaField: string;
  streamIds: string[];
  window: McapTimeRange;
  mode: McapBufferMode;
};

/** Required sample-scoped inputs for fetching an MCAP message window. */
export type FetchMcapBufferParams = {
  datasetId: string;
  sampleId: string;
  request: McapBufferRequest;
};

/** Timestamp-only timeline request sent to the MCAP timeline endpoint. */
export type McapTimelineRequest = {
  mediaField: string;
  streamIds: string[];
};

/** Per-stream playback timestamps returned by the MCAP timeline endpoint. */
export type McapTimelineStream = {
  streamId: string;
  timestampsNs: number[];
};

/** Shared playback clock and per-stream indexes for an MCAP scene. */
export type McapTimelineIndex = {
  timestampSource: "log_time";
  timestampsNs: number[];
  streams: McapTimelineStream[];
};

/** Timeline payload returned by the sample-scoped MCAP timeline endpoint. */
export type McapTimelineResponse = {
  sceneId: string;
  timeline: McapTimelineIndex;
};

/** Required sample-scoped inputs for fetching an MCAP timeline index. */
export type FetchMcapTimelineParams = {
  datasetId: string;
  sampleId: string;
  request: McapTimelineRequest;
};

/** Raw message transport record returned before payload normalization. */
export type McapRawMessageTransport = {
  messageId: string;
  logTimeNs: number;
  publishTimeNs: number;
  payloadB64: string;
};

/** Raw-mode transport response returned directly by the backend. */
export type McapRawBufferTransportResponse = {
  mode: "raw";
  sceneId: string;
  window: McapTimeRange;
  streams: {
    streamId: string;
    schemaName: string;
    messageEncoding: string;
    messages: McapRawMessageTransport[];
  }[];
};

/** Raw message record with decoded payload bytes for worker consumers. */
export type McapRawMessage = Omit<McapRawMessageTransport, "payloadB64"> & {
  payload: Uint8Array;
};

/** Normalized raw buffer response exposed by the frontend client. */
export type McapRawBufferResponse = Omit<
  McapRawBufferTransportResponse,
  "streams"
> & {
  streams: {
    streamId: string;
    schemaName: string;
    messageEncoding: string;
    messages: McapRawMessage[];
  }[];
};
