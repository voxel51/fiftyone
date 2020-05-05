import React, { useState } from "react";
import {
  Header,
  Icon,
  Menu,
  Message,
  Segment,
  Sidebar,
} from "semantic-ui-react";
import Gallery from "react-grid-gallery";
import InfiniteScroll from "react-infinite-scroller";
import { uuid } from "uuidv4";

import Histogram from "./Histogram";
import { getSocket, useSubscribe } from "../utils/socket";

const GalleryWrapper = (props) => (
  <div style={{ overflowY: "auto" }}>
    <Gallery enableImageSelection={false} {...props} />
  </div>
);

export default function Overview(props) {
  const state = props.state;
  const hasDataset = Boolean(state && state.dataset);
  const [tab, setTab] = useState("overview");
  const socket = getSocket("state");
  const [scrollState, setScrollState] = useState({
    initialLoad: true,
    hasMore: true,
    images: [],
    pageToLoad: 1,
  });
  function createImages(samples) {
    return samples
      ? Object.keys(samples).map((k) => {
          const sample = samples[k];
          const path = sample.filepath;
          const mimeType = sample.metadata.mime_type;
          const host = "http://127.0.0.1:5151/";
          const src = `${host}?path=${path}&mime_type=${mimeType}`;
          return {
            src: src,
            thumbnail: src,
            thumbnailWidth: samples[k].metadata.frame_size[0],
            thumbnailHeight: samples[k].metadata.frame_size[1],
            tags: [{ value: "cifar", title: "title" }],
          };
        })
      : [];
  }
  const loadMore = () => {
    if (hasDataset) {
      socket.emit("page", scrollState.pageToLoad, (data) => {
        const more = createImages(data);
        setScrollState({
          initialLoad: false,
          hasMore: scrollState.pageToLoad * 20 < state.count,
          images: [...scrollState.images, ...more],
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
  const content = <GalleryWrapper images={scrollState.images} />;
  return (
    <Segment>
      <Header as="h3">Overview: {hasDataset ? state.dataset.name : ""}</Header>

      <Menu pointing secondary>
        {["overview", "pools", "side-by-side", "overlayed"].map((item) => (
          <Menu.Item
            key={item}
            name={item}
            active={tab === item}
            onClick={() => setTab(item)}
          />
        ))}
      </Menu>

      <InfiniteScroll
        pageStart={1}
        initialLoad={true}
        loadMore={() => loadMore()}
        hasMore={scrollState.hasMore}
        loader={"loading"}
        useWindow={true}
      >
        {content}
      </InfiniteScroll>
    </Segment>
  );
}
