import React, { useState } from "react";
import { Header, Menu, Dimmer, Loader } from "semantic-ui-react";

import connect from "../utils/connect";
import { getSocket, useSubscribe } from "../utils/socket";
import Labels from "./Labels";
import Tags from "./Tags";

const Rendering = ({ displayProps, port }) => {
  const {
    lengths,
    colors,
    activeTags,
    setActiveTags,
    activeLabels,
    setActiveLabels,
    setActiveOther,
    activeOther,
  } = displayProps;
  const tStart = lengths.labels;
  const oStart = tStart + lengths.tags;
  return (
    <Menu.Item as="h3">
      Display
      <Menu vertical>
        <Menu.Item as="div" style={{ overflowX: "auto" }}>
          <pre>Labels</pre>
        </Menu.Item>
      </Menu>
      <Labels
        lengths={lengths}
        colors={colors}
        activeLabels={activeLabels}
        setActiveLabels={setActiveLabels}
        other={false}
        start={0}
      />
      <Menu vertical>
        <Menu.Item as="div" style={{ overflowX: "auto" }}>
          <pre>Tags</pre>
        </Menu.Item>
      </Menu>
      <Tags
        lengths={lengths}
        colors={colors}
        activeTags={activeTags}
        setActiveTags={setActiveTags}
        start={tStart}
      />
      <Menu vertical>
        <Menu.Item as="div" style={{ overflowX: "auto" }}>
          <pre>Numerics and strings</pre>
        </Menu.Item>
      </Menu>
      <Labels
        lengths={lengths}
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
