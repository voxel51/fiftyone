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
      <div style={{ paddingTop: "1rem" }}>
        <Header as="h4">Labels</Header>
        <Labels
          lengths={lengths}
          colors={colors}
          activeLabels={activeLabels}
          setActiveLabels={setActiveLabels}
          other={false}
          start={0}
        />
        <Header as="h4">Tags</Header>
        <Tags
          lengths={lengths}
          colors={colors}
          activeTags={activeTags}
          setActiveTags={setActiveTags}
          start={tStart}
        />
        <Header as="h4">Other supported fields</Header>
        <br />
        <Labels
          lengths={lengths}
          colors={colors}
          activeLabels={activeOther}
          setActiveLabels={setActiveOther}
          other={true}
          start={oStart}
        />
      </div>
    </Menu.Item>
  );
};

export default connect(Rendering);
