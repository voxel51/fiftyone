import React, { useState } from "react";
import {
  Card,
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
import Gallery from "react-grid-gallery";
import InfiniteScroll from "react-infinite-scroller";
import { Dimmer, Loader } from "semantic-ui-react";

import { updateState } from "../actions/update";
import { getSocket, useSubscribe } from "../utils/socket";
import connect from "../utils/connect";

function makeTags(labels, insights) {
  return Object.keys(labels).map((g) => {
    return { value: [g, labels[g].label].join(": "), title: "" };
  });
}

const GalleryImage = (props) => {
  return <img {...props.imageProps} />;
};

const GalleryWrapper = connect((props) => {
  const { images, dispatch, state, setView, port } = props;
  const socket = getSocket(port, "state");
  return (
    <div style={{ overflowY: "auto" }}>
      <Gallery
        enableImageSelection={true}
        onSelectImage={function (idx, item) {
          item.isSelected = !item.isSelected;
          const event = item.isSelected ? "add_selection" : "remove_selection";
          socket.emit(event, item.sample._id.$oid, (data) => {
            dispatch(updateState(data));
          });
        }}
        enableLightbox={false}
        onClickThumbnail={(o) => {
          setView({ visible: true, sample: images[o].sample });
        }}
        {...props}
      />
    </div>
  );
});

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
  function createImages(samples) {
    return samples
      ? Object.keys(samples).map((k) => {
          const sample = samples[k];
          const labels = sample.labels;
          const path = sample.filepath;
          const host = "http://127.0.0.1:5151/";
          const src = `${host}?path=${path}`;
          return {
            src: src,
            thumbnail: src,
            sample: sample,
            tags: makeTags(labels),
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
  const content = (
    <GalleryWrapper images={scrollState.images} setView={setView} />
  );
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
        {content}
      </InfiniteScroll>
      {scrollState.hasMore ? <Loader /> : ""}
    </>
  );
}

export default connect(SampleList);
