import React, { useState, useRef } from "react";

const PitImage = ({ sample, pitStore, setPitStore }) => {
  const ref = useRef(null);
  const onLoad = () => {
    setPitStore({
      ...pitStore,
      [sample._id.$oid]: {
        ...sample,
        width: ref.current.naturalWidth,
        height: ref.current.naturalHeigh,
      },
    });
  };
  return (
    <img
      style={{ position: "absolute", left: -1000 }}
      ref={ref}
      src={sample.src}
      onLoad={onLoad}
    />
  );
};

export default ({ images, setScrollState, index, scrollState }) => {
  const [pitStore, setPitStore] = useState({});
  console.log(pitStore);
  if (pitStore.length === images.length) {
    const loadedImages = images.map((s) => pitStore[s._id.$oid]);
    const imageGroups = [...scrollState.imageGroups];
    imageGroups[index] = loadedImages;
    setScrollState({ ...scrollState, imageGroups });
  }

  return images.map((s, i) => {
    return (
      <PitImage pitStore={pitStore} sample={s} setPitStore={setPitStore} />
    );
  });
};
