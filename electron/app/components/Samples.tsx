import React, { useState, useEffect } from "react";
import InfiniteScroll from "react-infinite-scroller";
import { useSetRecoilState } from "recoil";
import { Grid, Loader, Dimmer } from "semantic-ui-react";
import Sample from "./Sample";
import connect from "../utils/connect";
import tile from "./Samples.hooks";
import * as atoms from "../recoil/atoms";

function Samples(props) {
  const { displayProps, state, setView, port } = props;
  const initialSelected = state.selected.reduce((obj, id) => {
    return {
      ...obj,
      [id]: true,
    };
  }, {});

  const [selected, setSelected] = useState(initialSelected);
  const [scrollState, setScrollState] = tile(port);

  const setCurrentSamples = useSetRecoilState(atoms.currentSamples);
  useEffect(() => {
    setCurrentSamples(scrollState.rows.map((row) => row.samples).flat());
  }, [scrollState.rows]);

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
