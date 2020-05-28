import React, { useState, useRef, useEffect } from "react";
import { Grid } from "semantic-ui-react";

import Sample from "./Sample";

import connect from "../utils/connect";

const fitImages = (groups) => {
  const sampleRows = [];
  const rowStyles = [];
  let currentRow = [];
  let currentWidth = null;
  let currentHeight = null;
  for (const i in groups) {
    const group = groups[i];
    if (group === null) {
      break;
    }
    for (const j in group) {
      const sample = group[j];
      if (currentWidth === null) {
        currentWidth = sample.width;
        currentHeight = sample.height;
        currentRow.push(sample);
        continue;
      }

      if (currentWidth / currentHeight >= 5) {
        sampleRows.push(currentRow);
        currentRow = [sample];
        currentWidth = sample.width;
        currentHeight = sample.height;
        continue;
      }

      currentRow.push(sample);
      currentWidth += (currentHeight / sample.height) * sample.width;
    }
  }
  if (currentRow.length) sampleRows.push(currentRow);

  for (const i in sampleRows) {
    const row = sampleRows[i];
    const columns = [];
    if (row.length === 0) break;
    const baseHeight = row[0].height;
    const refWidth = row.reduce(
      (acc, val) => acc + (baseHeight / val.height) * val.width,
      0
    );
    for (const j in row) {
      const sample = row[j];
      const sampleWidth = (baseHeight * sample.width) / sample.height;
      columns.push(sampleWidth / refWidth);
    }
    const rowStyle = {
      display: "grid",
      gridTemplateColumns: columns
        .map((c) => (c * 100).toFixed(2) + "%")
        .join(" "),
      width: "100%",
      margin: 0,
    };
    rowStyles.push(rowStyle);
  }
  return rowStyles.map((r, i) => (
    <Grid columns={sampleRows[i].length} style={r} key={i}>
      {sampleRows[i].map((s, j) => (
        <Grid.Column key={j} style={{ padding: 0, width: "100%" }}>
          <Sample
            displayProps={displayProps}
            sample={s}
            selected={selected}
            setSelected={setSelected}
            setView={setView}
          />
        </Grid.Column>
      ))}
    </Grid>
  ));
};

const PitSample = connect(({ port, sample, pit, setPit, numSamples }) => {
  const host = `http://127.0.0.1:${port}`;
  const src = `${host}?path=${sample.filepath}`;
  const ref = useRef(null);
  const onLoad = () => {
    setPit({
      loaded: Object.keys(pit.samples.length) + 1 === numSamples,
      samples: {
        ...pit.samples,
        [sample._id.$oid]: {
          ...sample,
          width: ref.current.naturalWidth,
          height: ref.current.naturalHeight,
        },
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

export default ({ setSampleChunks, sampleChunks, index, scrollState }) => {
  const [pits, setPits] = useState({});

  useEffect(() => {
    if (pit.loaded) {
      const loadedImages = images.map((s) => pitStore[s._id.$oid]);
      const imageGroups = [...sampleGroups];
      imageGroups[index] = loadedImages;
      setLoaded(true);
      setSampleGroups(imageGroups);
    }
  }, [pitStored]);
  return images.map((s, i) => {
    return (
      <PitSample
        key={i}
        pit={pit}
        sample={s}
        numSamples={samples.length}
        setPit={setPit}
      />
    );
  });
};
