import _ from "lodash";
import React, { useState, useEffect } from "react";

import Player51 from "../../player51/build/cjs/player51.min.js";

export default () => {
  const [initLoad, setInitLoad] = useState(false);
  const [player, setPlayer] = useState(
    new Player51({
      media: {
        src:
          "http://localhost:5151/?path=/home/ben/Desktop/data/bdd_subset/data/fe1d9184-dec09b65.jpg",
        type: "image/jpg",
      },
      overlay: {},
      colorMap: {},
    })
  );
  useEffect(() => {
    if (!initLoad) {
      player.thumbnailMode();
      player.render("player-id", {});
      setInitLoad(true);
    } else {
      player.renderer.processFrame({});
    }
  });
  return <div id={"player-id"} />;
};
