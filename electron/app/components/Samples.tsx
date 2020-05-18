import _ from "lodash";
import React, { createRef, useState, useRef, useEffect } from "react";
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

import Sample from "./Sample";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

function Samples(props) {
  const { state, setView, port, dispatch } = props;
  const hasDataset = Boolean(state && state.dataset);
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
      hasMore: true,
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

  const chunkedImages = _.chunk(scrollState.images, 4);
  const content = chunkedImages.map((imgs) => {
    return (
      <Grid.Row style={{}}>
        {imgs.map((img) => {
          return (
            <Grid.Column>
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
        loader={<Loader />}
        useWindow={true}
      >
        <Grid columns={4}>{content}</Grid>
      </InfiniteScroll>
      {scrollState.hasMore ? <Loader /> : ""}
    </>
  );
}

export default connect(Samples);
