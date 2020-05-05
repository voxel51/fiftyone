import React, { useState } from "react";
import { Header, Icon, Menu, Segment, Sidebar } from "semantic-ui-react";
import Gallery from "react-grid-gallery";
import InfiniteScroll from "react-infinite-scroller";
import Histogram from "./Histogram";

const GalleryWrapper = (props) => (
  <div style={{ overflowY: "auto" }}>
    <Gallery enableImageSelection={false} {...props} />
  </div>
);

export default function Overview(props) {
  const { state, socket } = props;
  const [tab, setTab] = useState("overview");
  const [images, setImages] = useState([]);
  const [loaded, setIsLoaded] = useState(false);
  function createImageData(data) {
    const l = data
      ? Object.keys(data).map((k) => {
          const sample = data[k];
          const path = sample.filepath;
          const mimeType = sample.metadata.mime_type;
          const host = "http://127.0.0.1:5151/";
          const src = `${host}?path=${path}&mime_type=${mimeType}`;
          return {
            src: src,
            thumbnail: src,
            thumbnailWidth: sample.metadata.frame_size[0],
            thumbnailHeight: sample.metadata.frame_size[1],
            tags: [{ value: "cifar", title: "cifar" }],
          };
        })
      : [];
    return l;
  }

  const loadMore = (p) => {
    alert(p);
    socket.emit("page", p, (data) => {
      console.log("res", data);
      const more = createImageData(data);
      setImages([...images, ...more]);
      setIsLoaded(true);
    });
  };

  socket.on("update", (data) => {
    console.log("update", data);
    setImages([]);
    loadMore(1);
  });
  const content = <GalleryWrapper images={images} />;

  return (
    <Segment>
      <Header as="h3">Scroll</Header>

      <InfiniteScroll
        pageStart={0}
        loadMore={(p) => loadMore(p)}
        hasMore={true}
        loader={"loading"}
        useWindow={true}
      >
        {content}
      </InfiniteScroll>
    </Segment>
  );
}
