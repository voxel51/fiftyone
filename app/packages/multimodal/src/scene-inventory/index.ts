/**
 * One discoverable data source in the current scene. `type` is the
 * tile kind that knows how to render this id ("camera", "lidar", …).
 * `id` is opaque to the inventory — it's whatever the data domain
 * uses to address the source (an MCAP topic, a stream id, etc.).
 */
export interface SceneSource {
  readonly id: string;
  readonly type: string;
  readonly label: string;
}
