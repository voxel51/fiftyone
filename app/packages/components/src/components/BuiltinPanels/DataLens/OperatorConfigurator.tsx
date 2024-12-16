import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { getFetchFunction } from "@fiftyone/utilities";
import { OperatorIO, types } from "@fiftyone/operators";
import { useActiveDataset, useOperatorConfig } from "./hooks";
import { debounce } from "lodash";

/**
 * Data model which captures the current values of the form inputs.
 */
export type FormState = {
  [k: string]: any;
};

/**
 * Component responsible for collecting operator input parameters.
 *
 * This component leverages the OperatorIO component to handle form rendering
 *   and user interaction.
 */
export const OperatorConfigurator = ({
  operator,
  formState,
  onStateChange,
  onReadyChange,
}: {
  operator: string;
  formState: FormState;
  onStateChange?: (state: FormState, isValid: boolean) => void;
  onReadyChange?: (isReady: boolean) => void;
}) => {
  const [operatorSchema, setOperatorSchema] = useState({});
  const { activeDataset } = useActiveDataset();
  const [isLoading, setIsLoading] = useState(false);
  const operatorConfig = useOperatorConfig({ operatorUri: operator });

  // Synchronize external ready state with internal loading state
  useEffect(() => onReadyChange?.(!isLoading), [isLoading]);

  // JSON schema needs to be converted to the type expected by OperatorIO.
  const schema = useMemo(() => {
    if (!operatorSchema?.type) {
      return null;
    }

    return types.Property.fromJSON(operatorSchema);
  }, [operatorSchema]);

  // Determine which form fields are required based on the operator's schema.
  const requiredFields = useMemo(() => {
    if (!operatorSchema?.type) {
      return [];
    }

    const required = [];
    for (let property in operatorSchema.type.properties) {
      if (operatorSchema.type.properties[property].required) {
        required.push(property);
      }
    }

    return required;
  }, [operatorSchema]);

  // Hook which fetches an operator's input schema.
  const refreshInputSchema = useCallback(
    debounce((params: object) => {
      const requestBody = {
        operator_uri: operator,
        dataset_name: activeDataset,
        target: "inputs",
        params,
      };

      const clearContent = Object.keys(params).length === 0;

      if (clearContent) {
        setOperatorSchema({});
        setIsLoading(true);
      }

      getFetchFunction()("POST", "/operators/resolve-type", requestBody)
        .then((res: object) => {
          setOperatorSchema(res);
        })
        .finally(() => {
          if (clearContent) {
            setIsLoading(false);
          }
        });
    }, 300),
    [operator, activeDataset]
  );

  // Synchronize operator reset with schema reset;
  //  refreshInputSchema will be recreated any time the operator changes.
  useEffect(() => refreshInputSchema({}), [refreshInputSchema]);

  // Callback which handles updates to the form state.
  const updateFormState = (newState: FormState) => {
    const hasData = Object.keys(newState).reduce(
      (acc, key) => acc || newState[key] || newState[key] === 0,
      false
    );
    const hasRequiredData = requiredFields.reduce(
      (acc, key) => acc && (newState[key] || newState[key] === 0),
      true
    );
    const isValid = hasData && hasRequiredData;

    // For dynamic operators, we need to resolve inputs every time the form
    //  state changes.
    if (operatorConfig?.dynamic) {
      refreshInputSchema(newState);
    }

    onStateChange?.(newState, isValid);
  };

  const ioComponent =
    operator && schema ? (
      <OperatorIO schema={schema} data={formState} onChange={updateFormState} />
    ) : isLoading ? (
      <Fragment />
    ) : (
      <Typography sx={{ textAlign: "center" }}>
        Unable to detect inputs for selected datasource.
        <br />
        Please ensure that the datasource&apos;s operator is properly
        configured.
      </Typography>
    );

  return (
    <>
      <Box sx={{ mt: 2, mb: 2 }}>{ioComponent}</Box>
    </>
  );
};
