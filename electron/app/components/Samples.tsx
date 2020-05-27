import _ from "lodash";
import React, { createRef, useState, useRef, useEffect } from "react";
import { Card, Grid } from "semantic-ui-react";
import InfiniteScroll from "react-infinite-scroller";
import { Dimmer, Loader } from "semantic-ui-react";

import ImagePit from "./ImagePit";
import Sample from "./Sample";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

function Samples(props) {
  const { displayProps, state, setView, port, dispatch, widthRef } = props;
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
    imageGroups: [],
    imagePits: [],
    pageToLoad: 1,
  });
  const loadMore = () => {
    socket.emit("page", scrollState.pageToLoad, (data) => {
      setScrollState({
        initialLoad: false,
        hasMore: false,
        imagePits: [...scrollState.imagePits, data],
        imageGroups: [...scrollState.imageGroups, null],
        pageToLoad: scrollState.pageToLoad + 1,
      });
    });
  };

  useSubscribe(socket, "update", (data) => {
    setScrollState({
      iniitialLoad: true,
      hasMore: true,
      imageGroups: [],
      imagePits: [],
      pageToLoad: 1,
    });
  });

  const fitImages = (groups) => {
    const imageRows = [];
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

        if (currentWidth / currentHeight >= 4) {
          imageRows.push(currentRow);
          currentRow = [sample];
          currentWidth = sample.width;
          currentHeight = sample.height;
          continue;
        }

        currentRow.push(sample);
        currentWidth += (currentHeight / sample.height) * sample.width;
      }
    }
    for (const i in imageRows) {
      console.log(imageRows[i]);
    }
  };
  fitImages(scrollState.imageGroups);

  useEffect(() => console.log(stickyRef), [stickyRef]);

  return (
    <>
      {scrollState.imagePits.map((p, i) => (
        <ImagePit
          scrollState={scrollState}
          images={p}
          index={i}
          setScrollState={setScrollState}
        />
      ))}
      <InfiniteScroll
        pageStart={1}
        initialLoad={true}
        loadMore={() => loadMore()}
        hasMore={scrollState.hasMore}
        loader={<Loader key={0} />}
        useWindow={true}
      >
        <Grid columns={4} doubling stackable>
          {null}
        </Grid>
      </InfiniteScroll>
      {scrollState.hasMore ? <Loader /> : ""}
    </>
  );
}

export default connect(Samples);
