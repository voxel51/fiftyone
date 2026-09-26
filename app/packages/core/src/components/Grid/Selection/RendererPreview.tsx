import {
  createSampleRendererRenderContext,
  getComponent,
  getMatchingSampleRenderer,
  getSampleRendererComponent,
  hasSampleRendererSource,
  PluginComponentType,
  useActivePlugins,
  type SampleRendererSampleLike,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import type { GridSampleNode } from "@fiftyone/state/src/selection";
import { useMemo, type ReactNode } from "react";
import styles from "./SelectionTray.module.css";

const noop = () => undefined;

/**
 * Draws a captured sample with the same plugin renderer, media, and node the
 * grid tile uses, so a multimodal preview matches its tile exactly.
 */
export default function RendererPreview({
  node,
  fallback,
}: {
  node: GridSampleNode;
  fallback: ReactNode;
}) {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useSampleSchema();
  const selectedMediaField = fos.useSelectedMediaFieldGrid();
  const modalActive = fos.useModalActive();
  const activatorCtx = useMemo(() => ({ dataset, schema }), [dataset, schema]);
  const renderers = useActivePlugins(
    PluginComponentType.SampleRenderer,
    activatorCtx,
  );
  const resolved = useMemo(() => {
    if (!dataset) return null;
    // The node carries the grid's sample document verbatim; the renderer
    // types describe only the fields it reads.
    const sample = node as unknown as SampleRendererSampleLike;
    const ctx = createSampleRendererRenderContext(
      sample,
      selectedMediaField,
      dataset,
      schema,
      "grid",
    );
    const registration = getMatchingSampleRenderer(renderers, ctx);
    const canonical = registration ? getComponent(registration.name) : null;
    if (!registration || !canonical || !hasSampleRendererSource(ctx.media))
      return null;
    return {
      ctx,
      Renderer: getSampleRendererComponent(registration, "grid", canonical),
    };
  }, [dataset, schema, selectedMediaField, renderers, node]);
  if (!resolved) return <>{fallback}</>;
  return (
    <div className={styles.rendererHost} data-grid-tile="">
      <resolved.Renderer
        ctx={resolved.ctx}
        isGridActive={!modalActive}
        onRetainedBytesChange={noop}
      />
    </div>
  );
}
