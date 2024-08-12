import { ErrorBoundary } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense, useEffect } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import Group from "./Group";
import { useModalContext } from "./hooks";
import { Sample2D } from "./Sample2D";
import { Sample3d } from "./Sample3d";

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding-top: 5px;
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: hidden;
`;

export const ModalSample = React.memo(() => {
  const isGroup = useRecoilValue(fos.isGroup);
  const is3D = useRecoilValue(fos.is3DDataset);

  const tooltip = fos.useTooltip();
  const setIsTooltipLocked = useSetRecoilState(fos.isTooltipLocked);
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);

  const tooltipEventHandler = useRecoilCallback(
    ({ snapshot, set }) =>
      (e) => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (e.detail) {
          set(fos.tooltipDetail, e.detail);
          if (!isTooltipLocked && e.detail?.coordinates) {
            tooltip.setCoords(e.detail.coordinates);
          }
        } else if (!isTooltipLocked) {
          set(fos.tooltipDetail, null);
        }
      },
    [tooltip]
  );

  const { activeLookerRef, onLookerSetSubscribers } = useModalContext();

  useEffect(() => {
    onLookerSetSubscribers.current.push((looker) => {
      looker.addEventListener("tooltip", tooltipEventHandler);
    });

    return () => {
      activeLookerRef?.current?.removeEventListener(
        "tooltip",
        tooltipEventHandler
      );
    };
  }, [activeLookerRef, onLookerSetSubscribers, tooltipEventHandler]);

  useEffect(() => {
    // reset tooltip state when modal is closed
    setIsTooltipLocked(false);

    return () => {
      setTooltipDetail(null);
    };
  }, []);

  return (
    <ContentColumn>
      <ErrorBoundary onReset={() => {}}>
        <Suspense>
          {isGroup ? <Group /> : is3D ? <Sample3d /> : <Sample2D />}
        </Suspense>
      </ErrorBoundary>
    </ContentColumn>
  );
});

/**
 * DELETE ME - THIS IS FOR TESTING ONLY
 */

const TrivialModalPanel = () => {
  // the following a trigger grid rerender, super weird
  // const thisSample = useRecoilValue(fos.modalSample);

  return (
    <div>
      <h2>Modal Panel</h2>
      Basic panel
    </div>
  );
};

const RerunIframe = () => {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <iframe
        src="https://rerun.io/viewer?url=https%3A%2F%2Fapp.rerun.io%2Fversion%2F0.17.0%2Fexamples%2Farkit_scenes.rrd"
        width="100%"
        height="100%"
      />
    </div>
  );
};

registerComponent({
  name: "rerun",
  component: RerunIframe,
  label: "rerun",
  type: PluginComponentType.Panel,
  surfaces: "modal",
  helpMarkdown: `
###### Rerun Tab

Use \`Ctrl + drag\` to do something cool.

What is this plugin?

- We're embedding Rerun's ARKit Scene in Fiftyone panel.

- Learn more at [fiftyone.ai](https://fiftyone.ai).
    `,
  activator: () => true,
});

registerComponent({
  name: "foo-modal-2",
  component: TrivialModalPanel,
  label: "foo-modal-2",
  type: PluginComponentType.Panel,
  surfaces: "modal",
  helpMarkdown: `
###### My Modal 2

Use \`Ctrl + drag\` to do something cool.

What is this plugin?

- It's a modal plugin
- It's a simple plugin
- It's a foo plugin
- It's a bar plugin
- Learn more at [fiftyone.ai](https://fiftyone.ai).
    `,
  activator: () => true,
});
