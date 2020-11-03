import React, { useState, useEffect, useContext } from "react";
import InfiniteScroll from "react-infinite-scroller";
import useMeasure from "react-use-measure";
import { useSetRecoilState, useRecoilValue } from "recoil";
import { Grid } from "semantic-ui-react";
import { ThemeContext } from "styled-components";
import CircularProgress from "@material-ui/core/CircularProgress";
import styled from "styled-components";

import Sample from "./Sample";
import tile from "./Samples.hooks";
import * as atoms from "../recoil/atoms";
import { scrollbarStyles } from "./utils";

const Container = styled.div`
  ${scrollbarStyles}
  overflow: scroll;
  height: 100%;
`;

function Samples({ setView }) {
  const theme = useContext(ThemeContext);
  const setCurrentSamples = useSetRecoilState(atoms.currentSamples);
  const [containerRef, bounds] = useMeasure();

  const [scrollState, setScrollState] = tile();
  useEffect(() => {
    scrollState.initialized &&
      setCurrentSamples(scrollState.rows.map((row) => row.samples).flat());
  }, [scrollState.rows]);

  return (
    <Container ref={containerRef}>
      <InfiniteScroll
        pageStart={1}
        initialLoad={true}
        loadMore={() =>
          !scrollState.isLoading && !scrollState.loadMore
            ? setScrollState({ ...scrollState, loadMore: true })
            : null
        }
        hasMore={scrollState.hasMore}
        useWindow={false}
      >
        {scrollState.rows.map((r, i) => (
          <React.Fragment key={i}>
            <Grid
              columns={r.columns}
              style={{
                ...r.style,
                height: (bounds.width - 16) / r.aspectRatio,
              }}
              key={i}
            >
              {r.samples.map((s, j) => (
                <React.Fragment key={j}>
                  <Grid.Column
                    key={"column"}
                    style={{ padding: 0, width: "100%" }}
                  >
                    <Sample
                      sample={s.sample}
                      metadata={s.metadata}
                      setView={setView}
                    />
                  </Grid.Column>
                  {j < r.samples.length - 1 && (
                    <Grid.Column
                      key={"separator"}
                      style={{ padding: 0, width: "100%" }}
                    />
                  )}
                </React.Fragment>
              ))}
              {Array.from(Array(r.extraMargins).keys()).map((i) => (
                <Grid.Column
                  key={`separator-${i}`}
                  style={{ padding: 0, width: "100%" }}
                />
              ))}
            </Grid>
            <div
              style={{ width: "100%", display: "block", paddingTop: "0.2%" }}
            />
          </React.Fragment>
        ))}
        {scrollState.isLoading ? (
          <Grid columns={1}>
            <Grid.Column
              style={{
                width: "100%",
                textAlign: "center",
                color: theme.fontDark,
              }}
            >
              <CircularProgress color="inherit" />
            </Grid.Column>
          </Grid>
        ) : null}
      </InfiniteScroll>
    </Container>
  );
}

export default Samples;
