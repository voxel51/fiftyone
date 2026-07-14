import {
  createSampleRendererRenderContext,
  getComponent,
  getMatchingSampleRenderer,
  getSampleRendererComponent,
  isSampleRendererModalPersistent,
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

type ModalSampleRendererErrorBoundaryProps = React.PropsWithChildren<{
  fallback: React.ReactNode;
  /**
   * Identity of the current sample. A persistent renderer's boundary
   * survives navigation, so an error on one sample must not pin every
   * following sample to the fallback.
   */
  resetKey: string;
}>;

/**
 * Error boundary for modal sample renderers.
 * On error, renders the provided fallback and logs the failure.
 */
class ModalSampleRendererErrorBoundary extends React.Component<
  ModalSampleRendererErrorBoundaryProps,
  { hasError: boolean }
> {
  constructor(props: ModalSampleRendererErrorBoundaryProps) {
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

  componentDidUpdate(prevProps: ModalSampleRendererErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
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

    // Persistent renderers own their per-sample state, so keying by
    // renderer keeps the subtree mounted across sample navigation (the
    // boundary resets itself via resetKey). Everything else includes the
    // sample ID so navigation remounts renderer and boundary together.
    const rendererKey = isSampleRendererModalPersistent(matchedRenderer)
      ? matchedRenderer.name
      : `${matchedRenderer.name}-${sample.sample.id}`;

    return (
      <ModalSampleRendererErrorBoundary
        key={rendererKey}
        resetKey={sample.sample.id}
        fallback={<MetadataLooker sample={sample} />}
      >
        <Renderer ctx={ctx} />
      </ModalSampleRendererErrorBoundary>
    );
  },
);
