import React, { useState, useRef, useEffect } from "react";

import connect from "../utils/connect";

const PitImage = connect(({ port, sample, pitStore, setPitStore }) => {
  const host = `http://127.0.0.1:${port}`;
  const src = `${host}?path=${sample.filepath}`;
  const ref = useRef(null);
  const onLoad = () => {
    setPitStore({
      ...pitStore,
      [sample._id.$oid]: {
        ...sample,
        width: ref.current.naturalWidth,
        height: ref.current.naturalHeight,
      },
    });
  };
  return (
    <img
      style={{ position: "fixed", left: -10000 }}
      ref={ref}
      src={src}
      onLoad={onLoad}
    />
  );
});

export default ({ images, setScrollState, index, scrollState }) => {
  const [pitStore, setPitStore] = useState({});
  useEffect(() => {
    if (Object.keys(pitStore).length === images.length) {
      const loadedImages = images.map((s) => pitStore[s._id.$oid]);
      const imageGroups = [...scrollState.imageGroups];
      imageGroups[index] = loadedImages;
      setScrollState({ ...scrollState, imageGroups });
    }
  }, [pitStore]);
  return images.map((s, i) => {
    return (
      <PitImage pitStore={pitStore} sample={s} setPitStore={setPitStore} />
    );
  });
};
