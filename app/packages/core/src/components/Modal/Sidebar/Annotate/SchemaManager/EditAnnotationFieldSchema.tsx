import { JSONViewer } from "@fiftyone/components";
import LoadingSpinner from "@fiftyone/components/src/components/Loading/LoadingSpinner";
import { Sync } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { atom, useAtom } from "jotai";
import React, { useState } from "react";
import styled from "styled-components";
import { RoundButtonWhite } from "../Actions";
import { currentPath, schema } from "../state";
import Footer from "./Footer";

const Container = styled.div`
  flex: 1;
  padding: 1rem 0;
  margin-bottom: 3rem;
  displa
`;

const Scan = styled.div`
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.divider};
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  flex-direction: column;
`;

const schemaConfig = atom(
  (get) => get(schema(get(currentPath) ?? ""))?.config,
  (get, set, value: boolean) => {
    set(schema(get(currentPath) ?? ""), {
      ...get(schema(get(currentPath) ?? "")),
      config: value,
    });
  }
);

const Loading = () => {
  return (
    <>
      <LoadingSpinner />
      <Typography color="secondary" padding="1rem 0">
        Scanning samples
      </Typography>
    </>
  );
};

const EditAnnotationSchema = () => {
  const [config, setConfig] = useAtom(schemaConfig);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Typography color="secondary" padding="1rem 0">
        Lorem ipsum...
      </Typography>
      <Container>
        <Scan>
          {loading && <Loading />}
          {!config && !loading && (
            <RoundButtonWhite
              onClick={() => {
                setLoading(true);
                setTimeout(() => {
                  setConfig(true);
                  setLoading(false);
                }, 3000);
              }}
            >
              <Sync /> Scan samples
            </RoundButtonWhite>
          )}
          {config && !loading && (
            <JSONViewer
              value={{ hello: "world" }}
              containerProps={{ style: { height: "100%", width: "100%" } }}
            />
          )}
        </Scan>
      </Container>

      <Footer />
    </>
  );
};

export default EditAnnotationSchema;
