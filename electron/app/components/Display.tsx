import React, { useState } from "react";
import { Header, Menu, Dimmer, Loader } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import Labels from "./Labels";
import Tags from "./Tags";

const Rendering = ({ displayProps, port }) => {
  const {
    displayData,
    colors,
    activeTags,
    setActiveTags,
    activeLabels,
    setActiveLabels,
    setActiveScalars,
    activeScalars,
  } = displayProps;
  const tStart = displayData.labels.length;
  const sStart = tStart + displayData.tags.length;
  return (
    <Menu.Item as="h3">
      Display
      <Menu vertical>
        <Menu.Item as="div" style={{ padding: "0.5rem 0" }}>
          <pre>Labels</pre>
        </Menu.Item>
      </Menu>
      <Labels
        displayData={displayData}
        colors={colors}
        activeLabels={activeLabels}
        setActiveLabels={setActiveLabels}
        scalars={false}
        start={0}
      />
      <Menu vertical>
        <Menu.Item as="div" style={{ padding: "0.5rem 0" }}>
          <pre>Tags</pre>
        </Menu.Item>
      </Menu>
      <Tags
        displayData={displayData}
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
        displayData={displayData}
        colors={colors}
        activeLabels={activeScalars}
        setActiveLabels={setActiveScalars}
        scalars={true}
        start={sStart}
      />
    </Menu.Item>
  );
};

export default connect(Rendering);
