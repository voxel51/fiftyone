import _ from "lodash";
import React, { createRef, useState, useRef, useEffect } from "react";
import InfiniteScroll from "react-infinite-scroller";
import { Grid, Loader, Dimmer } from "semantic-ui-react";
import Sample from "./Sample";
import connect from "../utils/connect";
import tile from "./Samples.hooks";

function Samples(props) {
  const { displayProps, state, setView, port } = props;
  const containerRef = useRef(null);
  const initialSelected = state.selected.reduce((obj, id, i) => {
    return {
      ...obj,
      [id]: true,
    };
  }, {});

  const [selected, setSelected] = useState(initialSelected);
  const [scrollState, setScrollState] = tile(port, containerRef);

  return (
    <div ref={containerRef} style={{ width: "100%", padding: "1% 0" }}>
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
          <div
            key={i}
            style={{
              padding: "1% 0",
              display: "flex",
              width: "100%",
              justifyContent: "space-between",
            }}
          >
            {r.samples.map((s, j) => (
              <Sample
                displayProps={displayProps}
                sample={s}
                width={r.widths[j]}
                selected={selected}
                setSelected={setSelected}
                setView={setView}
                key={j}
              />
            ))}
          </div>
        ))}
      </InfiniteScroll>
    </div>
  );
}

export default connect(Samples);
