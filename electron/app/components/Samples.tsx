import _ from "lodash";
import React, { createRef, useState, useRef, useEffect } from "react";
import { Card, Grid } from "semantic-ui-react";
import InfiniteScroll from "react-infinite-scroller";
import { Dimmer, Loader } from "semantic-ui-react";
import uuid from "react-uuid";

import ImagePit from "./ImagePit";
import Sample from "./Sample";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

function Samples(props) {
  const { displayProps, state, setView, port, dispatch } = props;
  const socket = getSocket(port, "state");
  const initialSelected = state.selected.reduce((obj, id, i) => {
    return {
      ...obj,
      [id]: true,
    };
  }, {});
  const [selected, setSelected] = useState(initialSelected);
  const [scrollState, setScrollState] = useState({
    initialLoad: true,
    hasMore: true,
    imagePits: [],
    pageToLoad: 1,
  });
  const [sampleGroups, setSampleGroups] = useState([]);

  const loadMore = () => {
    socket.emit("page", scrollState.pageToLoad, (data) => {
      setScrollState({
        initialLoad: false,
        hasMore: scrollState.pageToLoad * 20 < state.count,
        imagePits: [...scrollState.imagePits, data],
        pageToLoad: scrollState.pageToLoad + 1,
      });
    });
  };

  useSubscribe(socket, "update", (data) => {
    setSampleGroups([]);
    setScrollState({
      iniitialLoad: true,
      hasMore: true,
      imagePits: [],
      pageToLoad: 1,
    });
  });

  const fitImages = (groups) => {
    const sampleRows = [];
    const rowStyles = [];
    let currentRow = [];
    let currentWidth = null;
    let currentHeight = null;
    for (const i in groups) {
      const group = groups[i];
      if (group === null) {
        break;
      }
      for (const j in group) {
        const sample = group[j];
        if (currentWidth === null) {
          currentWidth = sample.width;
          currentHeight = sample.height;
          currentRow.push(sample);
          continue;
        }

        if (currentWidth / currentHeight >= 5) {
          sampleRows.push(currentRow);
          currentRow = [sample];
          currentWidth = sample.width;
          currentHeight = sample.height;
          continue;
        }

        currentRow.push(sample);
        currentWidth += (currentHeight / sample.height) * sample.width;
      }
    }
    if (currentRow.length) sampleRows.push(currentRow);

    for (const i in sampleRows) {
      const row = sampleRows[i];
      const columns = [];
      if (row.length === 0) break;
      const baseHeight = row[0].height;
      const refWidth = row.reduce(
        (acc, val) => acc + (baseHeight / val.height) * val.width,
        0
      );
      for (const j in row) {
        const sample = row[j];
        const sampleWidth = (baseHeight * sample.width) / sample.height;
        columns.push(sampleWidth / refWidth);
      }
      const rowStyle = {
        display: "grid",
        gridTemplateColumns: columns
          .map((c) => (c * 100).toFixed(2) + "%")
          .join(" "),
        width: "100%",
        margin: 0,
      };
      rowStyles.push(rowStyle);
    }
    return rowStyles.map((r, i) => (
      <Grid columns={sampleRows[i].length} style={r} key={i}>
        {sampleRows[i].map((s, j) => (
          <Grid.Column key={j} style={{ padding: 0, width: "100%" }}>
            <Sample
              displayProps={displayProps}
              sample={s}
              selected={selected}
              setSelected={setSelected}
              setView={setView}
            />
          </Grid.Column>
        ))}
      </Grid>
    ));
  };

  const content = fitImages(sampleGroups);

  return (
    <>
      {scrollState.imagePits.map((p, i) => (
        <ImagePit
          key={uuid()}
          scrollState={scrollState}
          images={p}
          index={i}
          setSampleGroups={setSampleGroups}
          sampleGroups={sampleGroups}
        />
      ))}
      <InfiniteScroll
        pageStart={1}
        initialLoad={true}
        loadMore={() => loadMore()}
        hasMore={scrollState.hasMore}
        useWindow={true}
        key={uuid()}
      >
        {content}
      </InfiniteScroll>
    </>
  );
}

export default connect(Samples);
