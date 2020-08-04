import React, { useState, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import { Grid, Sticky } from "semantic-ui-react";

import DisplayOptionsSidebar from "../components/DisplayOptionsSidebar";
import ImageContainerHeader from "../components/ImageContainerHeader";
import SidebarContainer from "../components/SidebarContainer";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { VerticalSpacer } from "../components/utils";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { wrapSetWithItemSetter } from "../utils/hooks";

const Root = styled.div`
  .ui.grid > .sidebar-column {
    flex: 0 0 15rem;
    z-index: 400;
  }

  .ui.grid > .content-column {
    flex: 1;
  }
`;

const SamplesContainer = (props) => {
  const {
    activeTags,
    activeLabels,
    activeOther,
    setActiveTags,
    setActiveLabels,
    setActiveOther,
    labelData,
  } = props.displayProps;

  const [showSidebar, setShowSidebar] = useState(false);
  const [stuck, setStuck] = useState(false);
  const numSamples = useRecoilValue(selectors.numSamples);
  const tagNames = useRecoilValue(selectors.tagNames);
  const tagSampleCounts = useRecoilValue(selectors.tagSampleCounts);

  const containerRef = useRef();
  const stickyHeaderRef = useRef();

  let headerHeight = 0;
  if (stickyHeaderRef.current && stickyHeaderRef.current.stickyRect) {
    headerHeight = stickyHeaderRef.current.stickyRect.height;
  }

  return (
    <Root ref={containerRef} showSidebar={showSidebar}>
      <VerticalSpacer opaque height={5} />
      <Sticky
        ref={stickyHeaderRef}
        context={containerRef}
        onStick={() => setStuck(true)}
        onUnstick={() => setStuck(false)}
      >
        <ViewBar />
        <VerticalSpacer opaque height={5} />
        <ImageContainerHeader
          total={numSamples}
          showSidebar={showSidebar}
          onShowSidebar={setShowSidebar}
        />
        <VerticalSpacer opaque height={5} />
      </Sticky>
      <Grid>
        {showSidebar ? (
          <Grid.Column className="sidebar-column">
            <Sticky context={containerRef} offset={headerHeight}>
              <DisplayOptionsSidebar
                tags={tagNames.map((n) => ({
                  name: n,
                  count: tagSampleCounts[n],
                  selected: Boolean(activeTags[n]),
                }))}
                onSelectTag={(e) =>
                  setActiveTags({ ...activeTags, [e.name]: e.selected })
                }
                labels={[]}
                scalars={[]}
              />
            </Sticky>
          </Grid.Column>
        ) : null}
        <Grid.Column className="content-column">
          <Samples {...props} />
        </Grid.Column>
      </Grid>
    </Root>
  );
};

export default SamplesContainer;
