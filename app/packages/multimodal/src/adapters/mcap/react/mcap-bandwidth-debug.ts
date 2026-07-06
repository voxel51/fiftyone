export type McapBandwidthOperation =
  | "background-lookahead"
  | "current-frame"
  | "loopback-lookahead"
  | "playback-prefetch"
  | "startup-lookahead"
  | "transform-bootstrap"
  | "transform-current-window"
  | "transform-runway";

export function recordMcapMessageWindowBandwidth(
  ..._args: readonly unknown[]
): void {
  void _args;
}

export function recordMcapFrameTransformBandwidth(
  ..._args: readonly unknown[]
): void {
  void _args;
}
