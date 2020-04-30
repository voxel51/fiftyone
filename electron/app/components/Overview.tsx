import React, { useState } from "react";
import { Header, Icon, Menu, Segment, Sidebar } from "semantic-ui-react";
import Gallery from "react-grid-gallery";
import Histogram from "./Histogram";

const GalleryWrapper = (props) => (
  <div style={{ overflowY: "auto" }}>
    <Gallery enableImageSelection={false} {...props} />
  </div>
);

export default function Overview(props) {
  console.log(props);
  const state = props.state;
  const [tab, setTab] = useState("overview");
  const IMAGES = state
    ? Object.keys(state.samples).map((k) => {
        const src = state.samples[k].filepath.replace(
          "/home/ben/code/fiftyone/examples/data",
          "http://127.0.0.1:5151"
        );
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
      <Header as="h3">
        Overview: {state && state.dataset_name ? state.dataset_name : ""}
      </Header>

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
