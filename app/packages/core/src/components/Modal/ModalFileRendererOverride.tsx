import {
  getMatchingRenderClaimsPanel,
  getRawComponent,
  getRenderClaimsContext,
  PluginComponentType,
  type RenderClaimsContext,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { MetadataLooker } from "./MetadataLooker";

type ModalFileRendererOverrideProps = {
  sample: fos.ModalSample;
  modalMediaField: string;
  isAnnotate: boolean;
};

/**
 * Error boundary for modal render-claims renderers.
 * On error, renders the provided fallback and logs the failure.
 */
class ModalRenderClaimsErrorBoundary extends React.Component<
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
      "Modal renderClaims renderer failed, falling back to MetadataLooker:",
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
 * Renders a plugin-claimed renderer for non-native media in the modal,
 * or falls back to MetadataLooker when no matching plugin is found.
 */
export const ModalFileRendererOverride = React.memo(
  ({ sample, modalMediaField, isAnnotate }: ModalFileRendererOverrideProps) => {
    const dataset = useRecoilValue(fos.dataset);
    const schema = useRecoilValue(
      fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
    );
    const panelCtx = useMemo(() => ({ schema, dataset }), [schema, dataset]);
    const panelPlugins = useActivePlugins(PluginComponentType.Panel, panelCtx);

    const fallback = <MetadataLooker sample={sample} />;

    if (!dataset) {
      return fallback;
    }

    const renderClaimsContext = getRenderClaimsContext(
      sample,
      modalMediaField,
      dataset,
      schema
    );

    const matchedPanel = getMatchingRenderClaimsPanel(
      panelPlugins,
      renderClaimsContext,
      { surface: "modal", isAnnotate }
    );

    if (!matchedPanel || !renderClaimsContext.selectedMediaUrl) {
      return fallback;
    }

    const RawRenderer = getRawComponent(matchedPanel.name) as
      | React.ComponentType<{ ctx: RenderClaimsContext; url: string }>
      | undefined;

    if (!RawRenderer) {
      return fallback;
    }

    // Include sample ID so the error boundary resets when navigating between samples
    const rendererKey = `${matchedPanel.name}-${sample.sample.id}`;

    return (
      <ModalRenderClaimsErrorBoundary key={rendererKey} fallback={fallback}>
        <RawRenderer
          ctx={renderClaimsContext}
          url={renderClaimsContext.selectedMediaUrl}
        />
      </ModalRenderClaimsErrorBoundary>
    );
  }
);
