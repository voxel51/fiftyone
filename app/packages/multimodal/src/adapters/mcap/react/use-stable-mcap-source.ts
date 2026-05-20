import type { SampleRendererProps } from "@fiftyone/plugins";
import { useRef } from "react";
import type { ByteSourceDescriptor } from "../../../client/resources";
import { byteSourceAccessKey } from "../../../client/resources/cache";
import { getMcapSourceDescriptor } from "../sample";

/**
 * Returns a stable MCAP byte source object for the current sample renderer
 * context.
 */
export function useStableMcapSource(
  ctx: SampleRendererProps["ctx"]
): ByteSourceDescriptor | null {
  const nextSource = getMcapSourceDescriptor(ctx);
  const nextSourceKey = nextSource ? byteSourceAccessKey(nextSource) : "";
  const sourceRef = useRef<{
    readonly source: ByteSourceDescriptor | null;
    readonly sourceKey: string;
  }>();

  if (!sourceRef.current || sourceRef.current.sourceKey !== nextSourceKey) {
    sourceRef.current = {
      source: nextSource,
      sourceKey: nextSourceKey,
    };
  }

  return sourceRef.current.source;
}
