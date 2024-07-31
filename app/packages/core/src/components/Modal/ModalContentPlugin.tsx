import { ErrorBoundary, HelpPanel, JSONPanel } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense, useCallback, useEffect, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import Group from "./Group";
import { GroupContextProvider } from "./Group/GroupContextProvider";
import { usePanels as useLookerPanels } from "./hooks";
import ModalNavigation from "./ModalNavigation";
import Sample from "./Sample";
import { Sample3d } from "./Sample3d";

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding-top: 5px;
  width: 100%;
  height: 100%;
  position: relative;
`;

export const ModalContent = React.memo(() => {
  const { jsonPanel, helpPanel, onNavigate } = useLookerPanels();

  const isGroup = useRecoilValue(fos.isGroup);
  const isPcd = useRecoilValue(fos.isPointcloudDataset);
  const is3D = useRecoilValue(fos.is3DDataset);

  const tooltip = fos.useTooltip();
  const [isTooltipLocked, setIsTooltipLocked] = useRecoilState(
    fos.isTooltipLocked
  );
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);

  const tooltipEventHandler = useCallback(
    (e) => {
      if (e.detail) {
        setTooltipDetail(e.detail);
        if (!isTooltipLocked && e.detail?.coordinates) {
          tooltip.setCoords(e.detail.coordinates);
        }
      } else if (!isTooltipLocked) {
        setTooltipDetail(null);
      }
    },
    [isTooltipLocked, tooltip]
  );

  const lookerRef = useRef<fos.Lookers>();

  /**
   * a bit hacky, this is using the callback-ref pattern to get looker reference so that event handler can be registered
   * note: cannot use `useEventHandler()` hook since there's no direct reference to looker in Modal
   */
  const lookerRefCallback = useCallback(
    (looker: fos.Lookers) => {
      lookerRef.current = looker;
      looker.addEventListener("tooltip", tooltipEventHandler);
    },
    [tooltipEventHandler]
  );

  useEffect(() => {
    // reset tooltip state when modal is closed
    setIsTooltipLocked(false);

    return () => {
      setTooltipDetail(null);
    };
  }, []);

  useEffect(() => {
    return () => {
      lookerRef.current &&
        lookerRef.current.removeEventListener("tooltip", tooltipEventHandler);
    };
  }, [tooltipEventHandler]);

  return (
    <ContentColumn>
      <ModalNavigation onNavigate={onNavigate} />
      <ErrorBoundary onReset={() => {}}>
        <Suspense>
          {isGroup ? (
            <GroupContextProvider lookerRefCallback={lookerRefCallback}>
              <Group />
            </GroupContextProvider>
          ) : is3D || isPcd ? (
            <Sample3d />
          ) : (
            <Sample lookerRefCallback={lookerRefCallback} />
          )}
          {jsonPanel.isOpen && (
            <JSONPanel
              containerRef={jsonPanel.containerRef}
              onClose={() => jsonPanel.close()}
              onCopy={() => jsonPanel.copy()}
              json={jsonPanel.json}
            />
          )}
          {helpPanel.isOpen && (
            <HelpPanel
              containerRef={helpPanel.containerRef}
              onClose={() => helpPanel.close()}
              items={helpPanel.items}
            />
          )}
        </Suspense>
      </ErrorBoundary>
    </ContentColumn>
  );
});

/**
 * DELETE ME - THIS IS FOR TESTING ONLY
 */

const TrivialModalPanel = () => {
  const thisSample = useRecoilValue(fos.modalSample);

  return (
    <div>
      <h2>Modal Panel</h2>
      I'm operating on sample with filepath: {thisSample.sample.filepath}
    </div>
  );
};

registerComponent({
  name: "SampleModal",
  component: ModalContent,
  label: "Sample",
  type: PluginComponentType.Panel,
  surfaces: "modal",
  panelOptions: {
    pinned: true,
  },
  activator: () => true,
});

registerComponent({
  name: "foo-modal",
  component: () => (
    <div style={{ margin: "1em" }}>
      <TrivialModalPanel />
    </div>
  ),
  label: "foo-modal",
  type: PluginComponentType.Panel,
  surfaces: "modal",
  helpMarkdown: `
###### My Modal

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

/**
 * This is a no-op export to simply load the module, which will trigger the registration of the
 * `SampleModal` plugin.
 */
export const NoOpModalContentPluginActivation = () => {
  console.log("sashank");
};
