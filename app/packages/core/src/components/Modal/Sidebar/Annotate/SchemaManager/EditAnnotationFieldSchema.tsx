import { LoadingSpinner } from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { snackbarMessage } from "@fiftyone/state";
import { Sync } from "@mui/icons-material";
import { Link, Typography } from "@mui/material";
import { useAtom, useSetAtom } from "jotai";
import React, { useEffect, useState } from "react";
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

const useAnnotationSchema = (path: string) => {
  const [loading, setLoading] = useState<"loading" | "scanning" | false>(false);
  const [config, setConfig] = useAtom(schemaConfig(path));

  const [localConfig, setLocalConfig] = useState(config);

  const compute = useOperatorExecutor("compute_annotation_schema");
  const save = useOperatorExecutor("save_annotation_schema");

  useEffect(() => {
    if (!compute.result) {
      return;
    }

    setLoading(false);
    setLocalConfig(compute.result.config);
  }, [compute.result]);

  useEffect(() => {
    if (save.result) {
      setConfig(save.result.config);
    }
  }, [save.result, setConfig]);

  return {
    compute: (scan = true) => {
      setLoading(scan ? "scanning" : "loading");
      compute.execute({ path, scan_samples: scan });
    },
    computed: compute.result,

    loading: loading,

    scanning: loading === "scanning",
    reset: () => setLocalConfig(config),

    save: () => {
      if (!localConfig) {
        throw new Error("undefined schema");
      }

      save.execute({ path, config: localConfig });
      setConfig(localConfig);
    },
    saving: save.isExecuting,
    savingComplete: save.hasExecuted,
    schema: localConfig,
    setSchema: setLocalConfig,

    hasChanges: JSON.stringify(config) !== JSON.stringify(localConfig),
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
            data={JSON.stringify(data.schema, undefined, 2)}
            onChange={(_, value) => {
              data.setSchema(JSON.parse(value));
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
