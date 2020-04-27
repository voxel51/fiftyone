import React, { useState } from "react";
import { Header, Icon, Menu, Segment, Sidebar } from "semantic-ui-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import Gallery from "react-grid-gallery";
import SidebarLayout from "./SidebarLayout";

const GalleryWrapper = (props) => (
  <div style={{ overflowY: "auto" }}>
    <Gallery enableImageSelection={false} {...props} />
  </div>
);

export default function Overview() {
  const [tab, setTab] = useState("overview");
  const [IMAGES] = useState(
    [
      {
        src: "https://c7.staticflickr.com/9/8106/28941228886_86d1450016_b.jpg",
        thumbnail:
          "https://c7.staticflickr.com/9/8106/28941228886_86d1450016_n.jpg",
        thumbnailWidth: 271,
        thumbnailHeight: 320,
        tags: [{ value: "Nature" }],
      },
      {
        src: "https://c3.staticflickr.com/9/8583/28354353794_9f2d08d8c0_b.jpg",
        thumbnail:
          "https://c3.staticflickr.com/9/8583/28354353794_9f2d08d8c0_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 190,
        tags: [{ value: "Building" }],
      },
      {
        src: "https://c7.staticflickr.com/9/8569/28941134686_d57273d933_b.jpg",
        thumbnail:
          "https://c7.staticflickr.com/9/8569/28941134686_d57273d933_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 148,
        tags: [{ value: "Person" }, { value: "Building" }],
      },
      {
        src: "https://c6.staticflickr.com/9/8342/28897193381_800db6419e_b.jpg",
        thumbnail:
          "https://c6.staticflickr.com/9/8342/28897193381_800db6419e_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 213,
        tags: [{ value: "Building" }],
      },
      {
        src: "https://c2.staticflickr.com/9/8239/28897202241_1497bec71a_b.jpg",
        thumbnail:
          "https://c2.staticflickr.com/9/8239/28897202241_1497bec71a_n.jpg",
        thumbnailWidth: 248,
        thumbnailHeight: 320,
        tags: [{ value: "Building" }],
      },
      {
        src: "https://c1.staticflickr.com/9/8785/28687743710_870813dfde_h.jpg",
        thumbnail:
          "https://c1.staticflickr.com/9/8785/28687743710_3580fcb5f0_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 113,
        tags: [{ value: "Person" }, { value: "Building" }],
      },
      {
        src: "https://c6.staticflickr.com/9/8520/28357073053_cafcb3da6f_b.jpg",
        thumbnail:
          "https://c6.staticflickr.com/9/8520/28357073053_cafcb3da6f_n.jpg",
        thumbnailWidth: 313,
        thumbnailHeight: 320,
        tags: [{ value: "Building" }],
      },
      {
        src: "https://c8.staticflickr.com/9/8104/28973555735_ae7c208970_b.jpg",
        thumbnail:
          "https://c8.staticflickr.com/9/8104/28973555735_ae7c208970_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 213,
        tags: [{ value: "Nature" }],
      },
      {
        src: "https://c4.staticflickr.com/9/8578/28357117603_97a8233cf5_b.jpg",
        thumbnail:
          "https://c4.staticflickr.com/9/8578/28357117603_97a8233cf5_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 213,
        tags: [{ value: "Person" }, { value: "Nature" }],
      },
      {
        src: "https://c2.staticflickr.com/9/8817/28973449265_07e3aa5d2e_b.jpg",
        thumbnail:
          "https://c2.staticflickr.com/9/8817/28973449265_07e3aa5d2e_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 174,
        tags: [{ value: "Nature" }],
      },
      {
        src: "https://c1.staticflickr.com/9/8056/28354485944_148d6a5fc1_b.jpg",
        thumbnail:
          "https://c1.staticflickr.com/9/8056/28354485944_148d6a5fc1_n.jpg",
        thumbnailWidth: 257,
        thumbnailHeight: 320,
        tags: [{ value: "Nature" }],
      },
      {
        src: "https://c1.staticflickr.com/9/8707/28868704912_cba5c6600e_b.jpg",
        thumbnail:
          "https://c1.staticflickr.com/9/8707/28868704912_cba5c6600e_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 213,
        tags: [{ value: "Person" }, { value: "Building" }],
      },
    ].sort(() => Math.random() - 0.5)
  );

  const tags = Array.from(
    new Set(
      IMAGES.reduce(
        (arr, image) => arr.concat(image.tags.map((tag) => tag.value)),
        []
      )
    )
  );

  let gallery;
  if (tab == "overview") {
    const data = tags
      .map((tagName) => ({
        name: tagName,
        count: IMAGES.filter((img) =>
          img.tags.some((tag) => tag.value == tagName)
        ).length,
      }))
      .sort((a, b) => b.count - a.count);

    gallery = (
      <Segment>
        <BarChart width={250} height={250} data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" fill="#8884d8" />
        </BarChart>
      </Segment>
    );
  } else if (tab == "pools") {
    gallery = (
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
    gallery = <GalleryWrapper images={IMAGES} />;
  }

  return (
    <Segment>
      <Header as="h3">Overview: [name]</Header>

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

      {gallery}
    </Segment>
  );
}
