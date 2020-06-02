import _ from "lodash";
import React, { createRef, useState, useRef, useEffect } from "react";
import InfiniteScroll from "react-infinite-scroller";
import { Grid, Loader, Dimmer } from "semantic-ui-react";
import uuid from "react-uuid";
import Sample from "./Sample";
import connect from "../utils/connect";
import { wrap } from "comlink";
import tile from "./Samples.hooks";

function Samples(props) {
  const { displayProps, state, setView, port, dispatch } = props;
  const initialSelected = state.selected.reduce((obj, id, i) => {
    return {
      ...obj,
      [id]: true,
    };
  }, {});

  const [selected, setSelected] = useState(initialSelected);
  const [scrollState, setScrollState] = tile(port);

  return (
    <InfiniteScroll
      pageStart={1}
      initialLoad={true}
      loadMore={() =>
        !scrollState.isLoading && !scrollState.loadMore
          ? setScrollState({ ...scrollState, loadMore: true })
          : null
      }
      hasMore={scrollState.hasMore}
      loader={
        <Dimmer active className="samples-dimmer" key={-1}>
          <Loader />
        </Dimmer>
      }
      useWindow={true}
    >
      {scrollState.rows.map((r, i) => (
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
      ))}
    </InfiniteScroll>
  );
}

export default connect(Samples);
