import { LoadingSpinner } from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { snackbarMessage } from "@fiftyone/state";
import { Sync } from "@mui/icons-material";
import { Link, Typography } from "@mui/material";
import { useAtom, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import React, { useEffect, useMemo, useState } from "react";
import { useSetRecoilState } from "recoil";
import styled from "styled-components";
import { CodeView } from "../../../../../plugins/SchemaIO/components";
import { RoundButtonWhite } from "../Actions";
import { schemaConfig } from "../state";
import Footer from "./Footer";
import { currentField } from "./state";

const Container = styled.div`
  flex: 1;
  margin-bottom: 3rem;
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.divider};
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  overflow: auto;

  & > div.json {
    width: 100%;
    height: 100%;
  }
`;

const Loading = ({ scanning }: { scanning?: boolean }) => {
  return (
    <>
      <LoadingSpinner />
      <Typography color="secondary" padding="1rem 0">
        {scanning ? "Scanning samples" : "Loading"}
      </Typography>
    </>
  );
};

const toStr = (config) => JSON.stringify(config, undefined, 2);
const parse = (config: string) => JSON.parse(config);

const useAnnotationSchema = (path: string) => {
  const [loading, setLoading] = useState<"loading" | "scanning" | false>(false);
  const [config, setConfig] = useAtom(schemaConfig(path));

  const [localConfig, setLocalConfig] = useState(toStr(config));

  const compute = useOperatorExecutor("compute_annotation_schema");
  const save = useOperatorExecutor("save_annotation_schema");

  const setMessage = useSetRecoilState(snackbarMessage);

  useEffect(() => {
    if (!compute.result) {
      return;
    }

    setLoading(false);
    setLocalConfig(toStr(compute.result.config));
  }, [compute.result]);

  useEffect(() => {
    if (save.result) {
      setConfig(save.result.config);
    }
  }, [save.result, setConfig]);

  const hasChanges = useMemo(() => {
    try {
      return !isEqual(config, parse(localConfig));
    } catch {
      return true;
    }
  }, [config, localConfig]);

  return {
    compute: (scan = true) => {
      setLoading(scan ? "scanning" : "loading");
      compute.execute({ path, scan_samples: scan });
    },
    computed: compute.result,

    loading: loading,

    scanning: loading === "scanning",
    reset: () => setLocalConfig(toStr(config)),

    save: () => {
      if (!localConfig) {
        throw new Error("undefined schema");
      }

      try {
        const config = parse(localConfig);
        save.execute({ path, config });
        setConfig(parse(localConfig));
      } catch {
        setMessage("Unable to parse config");
      }
    },
    saving: save.isExecuting,
    savingComplete: save.hasExecuted,
    schema: localConfig,
    setSchema: setLocalConfig,

    hasChanges,
  };
};

const EditAnnotationSchema = ({ path }: { path: string }) => {
  const data = useAnnotationSchema(path);
  const setCurrentField = useSetAtom(currentField);
  const setToast = useSetRecoilState(snackbarMessage);

  useEffect(() => {
    if (data.savingComplete) {
      setCurrentField(null);
      setToast("Schema changes saved");
    }
  }, [data.savingComplete, setCurrentField, setToast]);
  return (
    <>
      <Typography color="secondary" padding="1rem 0">
        Copy goes here
      </Typography>
      <Container>
        {data.loading && <Loading scanning={data.scanning} />}
        {!data.schema && !data.loading && (
          <>
            <RoundButtonWhite
              onClick={() => {
                data.compute();
              }}
            >
              <Sync /> Scan samples
            </RoundButtonWhite>
            <Link
              color="secondary"
              onClick={() => {
                data.compute(false);
              }}
            >
              Skip scan
            </Link>
          </>
        )}
        {data.schema && !data.loading && (
          <CodeView
            data={data.schema}
            onChange={(_, value) => {
              data.setSchema(value);
            }}
            path={path}
            schema={{
              view: {
                language: "json",
                readOnly: false,
                width: "100%",
                height: "100%",
                componentsProps: {
                  container: {
                    className: "json",
                  },
                },
              },
            }}
          />
        )}
      </Container>
      <Footer
        secondaryButton={{
          onClick: () => data.reset(),
          disabled: !data.hasChanges,
          text: "Reset",
        }}
        primaryButton={{
          onClick: () => {
            data.save();
          },
          disabled: !data.hasChanges || data.saving,
          text: data.saving ? "Saving..." : "Save schema",
        }}
      />
    </>
  );
};

export default EditAnnotationSchema;
