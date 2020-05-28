import React, { useState, useRef, useEffect } from "react";

import connect from "../utils/connect";

const PitImage = connect(({ port, sample, pitStore, setPitStore }) => {
  const host = `http://127.0.0.1:${port}`;
  const src = `${host}?path=${sample.filepath}`;
  const ref = useRef(null);
  const onLoad = () => {
    if (pitStore[sample._id.$oid]) return;
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

export default ({
  images,
  setSampleGroups,
  sampleGroups,
  index,
  scrollState,
}) => {
  const [pitStore, setPitStore] = useState({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (sampleGroups[index]) return;
    if (!loaded && Object.keys(pitStore).length === images.length) {
      const loadedImages = images.map((s) => pitStore[s._id.$oid]);
      const imageGroups = [...sampleGroups];
      imageGroups[index] = loadedImages;
      setLoaded(true);
      setSampleGroups(imageGroups);
    }
  }, [pitStore, loaded]);
  if (loaded) return null;
  return images.map((s, i) => {
    return (
      <PitImage
        key={i}
        pitStore={pitStore}
        sample={s}
        setPitStore={setPitStore}
      />
    );
  });
};
