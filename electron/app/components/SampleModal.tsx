import React from "react";
import styled from "styled-components";

import Player51 from "./Player51";

type Props = {
  sample: object;
  sampleUrl: string;
};

const Container = styled.div`
  display: grid;
  grid-template-columns: auto 15rem;
  width: 90vw;
  height: 80vh;
  background-color: ${({ theme }) => theme.background};

  .player {
    overflow: hidden;
  }

  .sidebar {
    border-left: 2px solid ${({ theme }) => theme.border};
    padding-left: 1em;
    padding-right: 1em;
  }

  .row {
    display: flex;
    > label {
      font-weight: bold;
    }
    > span {
      margin-left: auto;
    }
  }
`;

const Row = ({ name, value }) => (
  <div class="row">
    <label>{name}</label>
    <span>{value}</span>
  </div>
);

const SampleModal = ({
  sample,
  sampleUrl,
  activeLabels,
  colorMapping,
}: Props) => {
  return (
    <Container>
      <div className="player">
        <Player51
          src={sampleUrl}
          style={{
            height: "100%",
            position: "relative",
          }}
          sample={sample}
          colorMapping={colorMapping}
          activeLabels={activeLabels}
        />
      </div>
      <div className="sidebar">
        <h2>Metadata</h2>
        <Row name="ID" value={sample._id.$oid} />
        <Row name="Source" value={sample.filepath} />
        <Row name="Tags" value={JSON.stringify(sample.tags)} />
        {Object.keys(sample).map((k) => {
          if (sample[k] && sample[k]._cls === "Classification") {
            return <Row key={k} name={k} value={sample[k].label} />;
          } else if (sample[k] && sample[k]._cls === "Detections") {
            const l = sample[k].detections.length;
            return (
              <Row
                key={k}
                name={k}
                value={`${l} detection${l === 1 ? "" : "s"}`}
              />
            );
          }
        })}
      </div>
    </Container>
  );
};

export default SampleModal;
