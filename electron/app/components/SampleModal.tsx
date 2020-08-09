import React from "react";
import styled from "styled-components";

import { Close } from "@material-ui/icons";

import Player51 from "./Player51";
import Tag from "./Tags/Tag";

type Props = {
  sample: object;
  sampleUrl: string;
};

const Container = styled.div`
  display: grid;
  grid-template-columns: auto 280px;
  width: 90vw;
  height: 80vh;
  background-color: ${({ theme }) => theme.background};

  h2 svg {
    float: right;
    cursor: pointer;
  }

  .player {
    overflow: hidden;
  }

  .sidebar {
    border-left: 2px solid ${({ theme }) => theme.border};
    padding-left: 1em;
    padding-right: 1em;
  }

  .row {
    > label {
      font-weight: bold;
    }
    > span {
      float: right;
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
  onClose,
}: Props) => {
  return (
    <Container>
      <div className="player">
        <Player51
          src={sampleUrl}
          style={{
            maxHeight: "100%",
            position: "relative",
          }}
          sample={sample}
          colorMapping={colorMapping}
          activeLabels={activeLabels}
        />
      </div>
      <div className="sidebar">
        <h2>
          Metadata <Close onClick={onClose} />
        </h2>
        <Row name="ID" value={sample._id.$oid} />
        <Row name="Source" value={sample.filepath} />
        <Row
          name="Tags"
          value={sample.tags.map((tag) => (
            <Tag key={tag} name={tag} color={colorMapping[tag]} />
          ))}
        />
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
