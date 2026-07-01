import {
  createSampleRendererRenderContext,
  getComponent,
  getMatchingSampleRenderer,
  getSampleRendererComponent,
  PluginComponentType,
  SampleRendererProps,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
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
      error,
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
    const dataset = fos.useCurrentDataset();
    const schema = fos.useModalSampleSchema();
    const { isDisabled: isDatasetRendererDisabled } =
      fos.useGridCustomRendererFailover(dataset?.name);

    const activatorCtx = useMemo(
      () => ({ dataset, schema }),
      [dataset, schema],
    );
    const sampleRenderers = useActivePlugins(
      PluginComponentType.SampleRenderer,
      activatorCtx,
    );

    if (!dataset) {
      throw new Error("no dataset");
    }

    if (isDatasetRendererDisabled) {
      return <MetadataLooker sample={sample} />;
    }

    const ctx = createSampleRendererRenderContext(
      sample,
      modalMediaField,
      dataset,
      schema,
      "modal",
    );
    const matchedRenderer = getMatchingSampleRenderer(sampleRenderers, ctx);
    const canonicalRenderer = matchedRenderer
      ? getComponent<SampleRendererProps>(matchedRenderer.name)
      : null;

    if (!matchedRenderer || !ctx.media.url || !canonicalRenderer) {
      return <MetadataLooker sample={sample} />;
    }

    const Renderer = getSampleRendererComponent(
      matchedRenderer,
      "modal",
      canonicalRenderer,
    );

    // Include sample ID so the error boundary resets when navigating between samples
    const rendererKey = `${matchedRenderer.name}-${sample.sample.id}`;

    return (
      <ModalSampleRendererErrorBoundary
        key={rendererKey}
        fallback={<MetadataLooker sample={sample} />}
      >
        <Renderer ctx={ctx} />
      </ModalSampleRendererErrorBoundary>
    );
  },
);
