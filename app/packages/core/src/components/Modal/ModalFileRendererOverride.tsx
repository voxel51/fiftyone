import {
  ModalFileRendererContext,
  PluginComponentType,
  getRawComponent,
  useActivePlugins,
} from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { MetadataLooker } from "./MetadataLooker";
import {
  getMatchingModalFileRendererPanel,
  getModalFileRendererContext,
} from "./modal-file-renderer";

type ModalFileRendererProps = {
  ctx: ModalFileRendererContext;
  url: string;
};

type ModalFileRendererOverrideProps = {
  sample: fos.ModalSample;
  modalMediaField: string;
  isAnnotate: boolean;
};

class ModalFileRendererErrorBoundary extends React.Component<
  React.PropsWithChildren<{ sample: fos.ModalSample }>,
  { hasError: boolean }
> {
  constructor(props: React.PropsWithChildren<{ sample: fos.ModalSample }>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.log("Modal file renderer failed, falling back to MetadataLooker", {
      error,
    });
  }

  render() {
    if (this.state.hasError) {
      return <MetadataLooker sample={this.props.sample} />;
    }

    return this.props.children;
  }
}

export const ModalFileRendererOverride = React.memo(
  ({ sample, modalMediaField, isAnnotate }: ModalFileRendererOverrideProps) => {
    const dataset = useRecoilValue(fos.dataset);
    const schema = useRecoilValue(
      fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
    );
    const panelCtx = useMemo(() => ({ schema, dataset }), [schema, dataset]);
    const panelPlugins = useActivePlugins(PluginComponentType.Panel, panelCtx);

    const modalFileRendererContext = getModalFileRendererContext(
      sample,
      modalMediaField,
      dataset,
      schema
    );
    const matchedRenderer = getMatchingModalFileRendererPanel(
      panelPlugins,
      modalFileRendererContext,
      { isAnnotate }
    );

    if (matchedRenderer && modalFileRendererContext.selectedMediaUrl) {
      const RawRenderer = getRawComponent(
        matchedRenderer.name
      ) as React.ComponentType<ModalFileRendererProps> | null;

      if (RawRenderer) {
        return (
          <ModalFileRendererErrorBoundary
            key={`${matchedRenderer.name}-${sample.id}-${modalFileRendererContext.selectedMediaUrl}`}
            sample={sample}
          >
            <RawRenderer
              ctx={modalFileRendererContext}
              url={modalFileRendererContext.selectedMediaUrl}
            />
          </ModalFileRendererErrorBoundary>
        );
      }
    }

    return <MetadataLooker sample={sample} />;
  }
);
