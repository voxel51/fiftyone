import React, { useState, useRef } from "react";

const PitImage = ({ sample, setPitStore }) => {
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
      style={{ position: "absolute", left: 1000 }}
      ref={ref}
      src={sample.src}
      onLoad={onLoad}
    />
  );
};

export default ({ images, setScrollState }) => {
  const [pitStore, setPitStore] = useState({});

  return images.map((s, i) => {
    return (
      <PitImage pitStore={pitStore} sample={s} setPitStore={setPitStore} />
    );
  });
};
