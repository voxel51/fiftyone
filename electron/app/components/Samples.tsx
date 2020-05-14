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

function Sample({ sample, port, setSelected, selected, setView }) {
  const host = `http://127.0.0.1:${port}`;
  const src = `${host}?path=${sample.filepath}`;
  const socket = getSocket(port, "state");
  const id = sample._id.$oid;
  return (
    <Image
      src={src}
      style={{
        width: "100%",
        border: selected[id] ? "1px solid black" : "none",
      }}
      onClick={() => {
        const newSelected = { ...selected };
        const event = newSelected[id] ? "remove_selection" : "add_selection";
        newSelected[id] = newSelected[id] ? false : true;
        setSelected(newSelected);
        socket.emit(event, id, (data) => {
          dispatch(updateState(data));
        });
      }}
    />
  );
}

function SampleList(props) {
  const { state, setView, port } = props;
  const hasDataset = Boolean(state && state.dataset);
  const socket = getSocket(port, "state");
  const [selected, setSelected] = useState({});
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
      <Grid.Row style={{ padding: "0.25rem 0" }}>
        {imgs.map((img) => {
          return (
            <Grid.Column style={{ padding: "0 0.25rem" }}>
              <Sample
                port={port}
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
        loader={<Loader />}
        useWindow={true}
      >
        <Grid columns={4} style={{ margin: "-0.25rem" }}>
          {" "}
          {content}
        </Grid>
      </InfiniteScroll>
      {scrollState.hasMore ? <Loader /> : ""}
    </>
  );
}

export default connect(SampleList);
