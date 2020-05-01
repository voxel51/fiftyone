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
import Histogram from "./Histogram";

const GalleryWrapper = (props) => (
  <div style={{ overflowY: "auto" }}>
    <Gallery enableImageSelection={false} {...props} />
  </div>
);

export default function Overview(props) {
  const state = props.state;
  const hasDataset = state && state.dataset_name;
  const [tab, setTab] = useState("overview");

  if (!hasDataset) {
    return (
      <Segment>
        <Message>No dataset loaded</Message>
      </Segment>
    );
  }

  const IMAGES =
    state && state.samples
      ? Object.keys(state.samples).map((k) => {
          const sample = state.samples[k];
          const path = sample.filepath;
          const mimeType = sample.metadata.mime_type;
          const host = "http://127.0.0.1:5151/";
          const src = `${host}?path=${path}&mime_type=${mimeType}`;
          return {
            src: src,
            thumbnail: src,
            thumbnailWidth: state.samples[k].metadata.frame_size[0],
            thumbnailHeight: state.samples[k].metadata.frame_size[1],
            tags: [{ value: "cifar" }],
          };
        })
      : [];

  const tags = Array.from(
    new Set(
      IMAGES.reduce(
        (arr, image) => arr.concat(image.tags.map((tag) => tag.value)),
        []
      )
    )
  );

  let content;
  if (tab == "overview") {
    const data = tags
      .map((tagName) => ({
        name: tagName,
        count: IMAGES.filter((img) =>
          img.tags.some((tag) => tag.value == tagName)
        ).length,
      }))
      .sort((a, b) => b.count - a.count);

    content = (
      <Segment>
        <Histogram data={data} />
      </Segment>
    );
  } else if (tab == "pools") {
    content = (
      <>
        {tags.map((tagName) => (
          <React.Fragment key={tagName}>
            <h3>{tagName}</h3>
            <GalleryWrapper
              images={IMAGES.filter(
                (image) =>
                  image.tags.filter((tag) => tag.value === tagName).length
              )}
            />
          </React.Fragment>
        ))}
      </>
    );
  } else {
    console.log(IMAGES);
    content = <GalleryWrapper images={IMAGES} />;
  }

  return (
    <Segment>
      <Header as="h3">Overview: {hasDataset ? state.dataset_name : ""}</Header>

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

      {content}
    </Segment>
  );
}
