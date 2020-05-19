import _ from "lodash";
import React, { createRef, useState, useRef, useEffect } from "react";
import { Card, Grid } from "semantic-ui-react";
import InfiniteScroll from "react-infinite-scroller";
import { Dimmer, Loader } from "semantic-ui-react";

import Sample from "./Sample";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

function Samples(props) {
  const { state, setView, port, dispatch } = props;
  const socket = getSocket(port, "state");
  const initialSelected = hasDataset
    ? state.selected.reduce((obj, id, i) => {
        return {
          ...obj,
          [id]: true,
        };
      }, {})
    : {};
  const [selected, setSelected] = useState(initialSelected);
  const [scrollState, setScrollState] = useState({
    initialLoad: true,
    hasMore: true,
    images: [],
    pageToLoad: 1,
  });
  const loadMore = () => {
    socket.emit("page", scrollState.pageToLoad, (data) => {
      setScrollState({
        initialLoad: false,
        hasMore: scrollState.pageToLoad * 20 < state.count,
        images: [...scrollState.images, ...data],
        pageToLoad: scrollState.pageToLoad + 1,
      });
    });
  };

  useSubscribe(socket, "update", (data) => {
    setScrollState({
      iniitialLoad: true,
      hasMore: true,
      images: [],
      pageToLoad: 1,
    });
  });

  const chunkedImages = _.chunk(scrollState.images, 4);
  const content = chunkedImages.map((imgs, i) => {
    return (
      <Grid.Row key={i}>
        {imgs.map((img, j) => {
          return (
            <Grid.Column key={j}>
              <Sample
                sample={img}
                selected={selected}
                setSelected={setSelected}
                setView={setView}
              />
            </Grid.Column>
          );
        })}
      </Grid.Row>
    );
  });

  return (
    <>
      <InfiniteScroll
        pageStart={1}
        initialLoad={true}
        loadMore={() => loadMore()}
        hasMore={scrollState.hasMore}
        loader={<Loader key={0} />}
        useWindow={true}
      >
        <Grid columns={4}>{content}</Grid>
      </InfiniteScroll>
      {scrollState.hasMore ? <Loader /> : ""}
    </>
  );
}

export default connect(Samples);
