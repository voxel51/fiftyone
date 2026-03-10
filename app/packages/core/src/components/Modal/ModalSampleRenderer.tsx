import {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getRawComponent,
  getSampleRendererComponent,
  PluginComponentType,
  type SampleRendererProps,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { MetadataLooker } from "./MetadataLooker";

type ModalSampleRendererProps = {
  sample: fos.ModalSample;
  modalMediaField: string;
};

/**
 * Error boundary for modal sample renderers.
 * On error, renders the provided fallback and logs the failure.
 */
class ModalSampleRendererErrorBoundary extends React.Component<
  React.PropsWithChildren<{ fallback: React.ReactNode }>,
  { hasError: boolean }
> {
  constructor(props: React.PropsWithChildren<{ fallback: React.ReactNode }>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(
      "Modal sample renderer failed, falling back to the built-in metadata renderer:",
      error
    );
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

/**
 * Renders a matched sample renderer for non-native modal media, or falls back
 * to the built-in metadata renderer when no renderer is available.
 */
export const ModalSampleRenderer = React.memo(
  ({ sample, modalMediaField }: ModalSampleRendererProps) => {
    const dataset = useRecoilValue(fos.dataset);
    const schema = useRecoilValue(
      fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
    );
    const pluginCtx = useMemo(() => ({ schema, dataset }), [schema, dataset]);
    const sampleRenderers = useActivePlugins(
      PluginComponentType.SampleRenderer,
      pluginCtx
    );

    const fallback = <MetadataLooker sample={sample} />;

    if (!dataset) {
      return fallback;
    }

    const ctx = createSampleRendererRenderContext(
      sample,
      modalMediaField,
      dataset,
      schema,
      "modal"
    );
    const matchedRenderer = getMatchingSampleRenderer(sampleRenderers, ctx);
    const canonicalRenderer = matchedRenderer
      ? getRawComponent(matchedRenderer.name)
      : null;

    if (!matchedRenderer || !ctx.media.url || !canonicalRenderer) {
      return fallback;
    }

    const Renderer = getSampleRendererComponent(
      matchedRenderer,
      "modal",
      canonicalRenderer as React.ComponentType<SampleRendererProps>
    );

    // Include sample ID so the error boundary resets when navigating between samples
    const rendererKey = `${matchedRenderer.name}-${sample.sample.id}`;

    return (
      <ModalSampleRendererErrorBoundary key={rendererKey} fallback={fallback}>
        <Renderer ctx={ctx} />
      </ModalSampleRendererErrorBoundary>
    );
  }
);
