import React, { useState } from "react";
import { Header, Icon, Menu, Segment, Sidebar } from "semantic-ui-react";
import Gallery from "react-grid-gallery";
import SidebarLayout from "./SidebarLayout";

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
        tags: [{ value: "Nature", title: "Nature | Flowers" }],
      },
      {
        src: "https://c3.staticflickr.com/9/8583/28354353794_9f2d08d8c0_b.jpg",
        thumbnail:
          "https://c3.staticflickr.com/9/8583/28354353794_9f2d08d8c0_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 190,
        tags: [
          { value: "Architecture", title: "Architecture | Outdoors" },
          { value: "Industrial", title: "Industrial" },
        ],
      },
      {
        src: "https://c7.staticflickr.com/9/8569/28941134686_d57273d933_b.jpg",
        thumbnail:
          "https://c7.staticflickr.com/9/8569/28941134686_d57273d933_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 148,
        tags: [
          { value: "People", title: "People" },
          { value: "Architecture", title: "Architecture | Outdoors" },
          { value: "Industrial", title: "Industrial" },
        ],
      },
      {
        src: "https://c6.staticflickr.com/9/8342/28897193381_800db6419e_b.jpg",
        thumbnail:
          "https://c6.staticflickr.com/9/8342/28897193381_800db6419e_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 213,
      },
      {
        src: "https://c2.staticflickr.com/9/8239/28897202241_1497bec71a_b.jpg",
        thumbnail:
          "https://c2.staticflickr.com/9/8239/28897202241_1497bec71a_n.jpg",
        thumbnailWidth: 248,
        thumbnailHeight: 320,
      },
      {
        src: "https://c1.staticflickr.com/9/8785/28687743710_870813dfde_h.jpg",
        thumbnail:
          "https://c1.staticflickr.com/9/8785/28687743710_3580fcb5f0_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 113,
        tags: [
          { value: "People", title: "People" },
          { value: "Industrial", title: "Industrial" },
        ],
      },
      {
        src: "https://c6.staticflickr.com/9/8520/28357073053_cafcb3da6f_b.jpg",
        thumbnail:
          "https://c6.staticflickr.com/9/8520/28357073053_cafcb3da6f_n.jpg",
        thumbnailWidth: 313,
        thumbnailHeight: 320,
      },
      {
        src: "https://c8.staticflickr.com/9/8104/28973555735_ae7c208970_b.jpg",
        thumbnail:
          "https://c8.staticflickr.com/9/8104/28973555735_ae7c208970_n.jpg",
        thumbnailWidth: 320,
        thumbnailHeight: 213,
        tags: [{ value: "Nature", title: "Nature | Flowers" }],
      },
    ].sort(() => Math.random() - 0.5)
  );

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

      <div style={{ overflowY: "auto" }}>
        <Gallery images={IMAGES} enableImageSelection={false} />
      </div>
    </Segment>
  );
}
