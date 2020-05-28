import _ from "lodash";
import React, { createRef, useState, useRef, useEffect } from "react";
import InfiniteScroll from "react-infinite-scroller";
import { Grid, Loader } from "semantic-ui-react";
import uuid from "react-uuid";

import connect from "../utils/connect";
import { wrap } from "comlink";
import { tile } from "./Samples.hooks";

const Rows = ({ rows, displayProps, selected, setSelected, setView }) =>
  rows.map((r, i) => (
    <Grid columns={r.samples.length} style={r.style} key={i}>
      {r.samples.map((s, j) => (
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

function Samples(props) {
  const { displayProps, state, setView, port, dispatch } = props;
  const initialSelected = state.selected.reduce((obj, id, i) => {
    return {
      ...obj,
      [id]: true,
    };
  }, {});

  const [selected, setSelected] = useState(initialSelected);
  const [loadMore, setLoadMore] = useState(false);

  const scrollState = tile(loadMore);
  console.log(scrollState);
  return (
    <InfiniteScroll
      pageStart={1}
      initialLoad={true}
      loadMore={() => setLoadMore(true)}
      hasMore={scrollState.hasMore}
      loader={<Loader key={0} />}
      useWindow={true}
      key={uuid()}
    >
      <Grid columns={4} doubling stackable>
        <Rows
          rows={scrollState.rows}
          selected={selected}
          setSelected={setSelected}
          setView={setView}
          displayProps={displayProps}
        />
      </Grid>
    </InfiniteScroll>
  );
}

export default connect(Samples);
