import { useOperatorExecutor } from "@fiftyone/operators";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { CodeView } from "../../../../../plugins/SchemaIO/components";
import ErrorBox from "./ErrorBox";
import { fieldSchemaData } from "./state";

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

export const useLabelSchemaEditor = (field: string) => {
  const [config, setConfig] = useAtom(fieldSchemaData(field));
  const [currentSchema, setCurrentSchema] = useState(null);

  useEffect(() => {
    setCurrentSchema(config.label_schema || config.default_label_schema);
  }, [config]);

  const [error, setError] = useState(null);

  const generate = useOperatorExecutor("generate_label_schemas");
  const update = useOperatorExecutor("update_label_schema");
  const validate = useOperatorExecutor("validate_label_schemas");

  useEffect(() => {
    currentSchema &&
      validate.execute(
        { label_schemas: { [field]: { hello: "world" } } },
        {
          skipErrorNotification: true,
          callback: (result) => {
            result.error && setError(result.error);
          },
        }
      );
  }, [currentSchema]);

  return {
    data: config,
    error,
    canSave: true,
    hasChanges: true,
    isSaving: true,
    save: () => {},
  };
};

export default function ({ field }: { field: string }) {
  const data = useLabelSchemaEditor(field);

  console.log(data.error);
  return (
    <>
      <Container>
        <CodeView
          data={JSON.stringify(data.data)}
          onChange={() => {}}
          path={field}
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
      </Container>

      {data.error && <ErrorBox error={data.error} />}
    </>
  );
}
