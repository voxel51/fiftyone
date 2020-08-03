import React, { useState } from "react";
import { Header, Menu, Dimmer, Loader } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import Labels from "./Labels";
import Tags from "./Tags";

const Rendering = ({ displayProps, port }) => {
  const {
    labelData,
    colors,
    activeTags,
    setActiveTags,
    activeLabels,
    setActiveLabels,
    setActiveOther,
    activeOther,
  } = displayProps;
  const tStart = labelData.labels;
  const oStart = tStart + labelData.tags;
  return (
    <Menu.Item as="h3">
      Display
      <Menu vertical>
        <Menu.Item as="div" style={{ padding: "0.5rem 0" }}>
          <pre>Labels</pre>
        </Menu.Item>
      </Menu>
      <Labels
        labelData={labelData}
        colors={colors}
        activeLabels={activeLabels}
        setActiveLabels={setActiveLabels}
        other={false}
        start={0}
      />
      <Menu vertical>
        <Menu.Item as="div" style={{ padding: "0.5rem 0" }}>
          <pre>Tags</pre>
        </Menu.Item>
      </Menu>
      <Tags
        labelData={labelData}
        colors={colors}
        activeTags={activeTags}
        setActiveTags={setActiveTags}
        start={tStart}
      />
      <Menu vertical>
        <Menu.Item as="div" style={{ padding: "0.5rem 0" }}>
          <pre>Scalars</pre>
        </Menu.Item>
      </Menu>
      <Labels
        labelData={labelData}
        colors={colors}
        activeLabels={activeOther}
        setActiveLabels={setActiveOther}
        other={true}
        start={oStart}
      />
    </Menu.Item>
  );
};

export default connect(Rendering);
