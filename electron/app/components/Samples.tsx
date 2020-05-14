import React, { useState } from "react";
import {
  Card,
  Grid,
  Image,
  Label,
  Header,
  Icon,
  Menu,
  Message,
  Segment,
  Sidebar,
  Divider,
} from "semantic-ui-react";
import InfiniteScroll from "react-infinite-scroller";
import { Dimmer, Loader } from "semantic-ui-react";

import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

function chunkArray(array, size) {
  let result = [];
  for (let i = 0; i < array.length; i += size) {
    let chunk = array.slice(i, i + size);
    result.push(chunk);
  }
  return result;
}

function Sample({ sample, port }) {
  const host = `http://127.0.0.1:${port}`;
  const src = `${host}?path=${sample.filepath}`;
  return <img src={src} style={{ width: "100%" }} />;
}

function SampleList(props) {
  const { state, setView, port } = props;
  const hasDataset = Boolean(state && state.dataset);
  const socket = getSocket(port, "state");
  const [scrollState, setScrollState] = useState({
    initialLoad: true,
    hasMore: true,
    images: [],
    pageToLoad: 1,
  });
  const loadMore = () => {
    if (hasDataset) {
      socket.emit("page", scrollState.pageToLoad, (data) => {
        setScrollState({
          initialLoad: false,
          hasMore: scrollState.pageToLoad * 20 < state.count,
          images: [...scrollState.images, ...data],
          pageToLoad: scrollState.pageToLoad + 1,
        });
      });
    } else {
      setScrollState({
        initialLoad: true,
        hasMore: false,
        images: [],
        pageToLoad: 1,
      });
    }
  };

  useSubscribe(socket, "update", (data) => {
    setScrollState({
      iniitialLoad: true,
      hasMore: false,
      images: [],
      pageToLoad: 1,
    });
  });

  if (!hasDataset) {
    return (
      <Segment>
        <Message>No dataset loaded</Message>
      </Segment>
    );
  }

  const chunkedImages = chunkArray(scrollState.images, 4);
  const content = chunkedImages.map((imgs) => {
    return (
      <Grid.Row>
        {imgs.map((img) => {
          return (
            <Grid.Column>
              <Sample port={port} sample={img} />
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
        loader={<Loader />}
        useWindow={true}
      >
        <Grid columns={4}> {content}</Grid>
      </InfiniteScroll>
      {scrollState.hasMore ? <Loader /> : ""}
    </>
  );
}

export default connect(SampleList);
