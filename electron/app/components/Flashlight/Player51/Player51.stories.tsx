import React from "react";
import { useRecoilValue } from "recoil";

import { itemLayout, itemsToRender } from "../../../state/selectors";
import Thumbnail from "./Player51";
import { Container } from "../utils";

export default {
  component: Thumbnail,
  title: "Flashlight/Player51/Thumbnail",
};

const TestThumbnail = () => {
  if (!useRecoilValue(itemsToRender)[0]) return null;

  return <Thumbnail index={0} />;
};

export const container = () => (
  <Container>
    <TestThumbnail />
  </Container>
);
