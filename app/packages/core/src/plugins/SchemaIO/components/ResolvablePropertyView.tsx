import { MuiButton } from "@fiftyone/components";
import {
  executeOperator,
  types,
  validate as validateProperty,
} from "@fiftyone/operators";
import { KeyboardArrowDown, Refresh } from "@mui/icons-material";
import {
  Alert,
  AlertTitle,
  Box,
  CircularProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  DebounceSettings,
  get,
  debounce as lodashDebounce,
  throttle as lodashThrottle,
  set,
  ThrottleSettings,
} from "lodash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { operatorToIOSchema } from "../../OperatorIO/utils";
import { getComponentProps } from "../utils";
import DynamicIO from "./DynamicIO";
import HeaderView from "./HeaderView";

const DEFAULT_WAIT = 500;

export default function ResolvablePropertyView(props) {
  const { path, schema, fullData, onValidationErrors } = props;
  const {
    resolver,
    dependencies,
    throttle,
    debounce,
    wait,
    leading,
    trailing,
    auto_update,
    params,
    validate,
  } = schema;
  const [resolvedSchema, setResolvedSchema] = useState<ResolvedSchemaType>();
  const [resolvingParams, setResolvingParams] = useState<string | undefined>();
  const [resolvedParams, setResolvedParams] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [showError, setShowError] = useState(false);
  const [resolveCount, setResolveCount] = useState(0);

  const serializedObservedData = useMemo(() => {
    const hasDependencies = dependencies && dependencies.length > 0;
    const observedData = hasDependencies
      ? dependencies.reduce((currentDependencies, dependency) => {
          set(currentDependencies, dependency, get(fullData, dependency));
          return currentDependencies;
        }, {})
      : fullData;
    return JSON.stringify(observedData);
  }, [fullData, dependencies]);
  const serializedProvidedParams = useMemo(() => {
    return JSON.stringify(params || {});
  }, [params]);

  const schemaResolver = useCallback(
    (
      params: Record<string, unknown>,
      providedParams: Record<string, unknown> | undefined,
      serializedObservedData: string,
      path?: string,
      validate?: boolean
    ) => {
      const computedParams = providedParams
        ? { ...params, ...providedParams }
        : params;
      setResolveCount((count) => count + 1);
      executeOperator(resolver, computedParams, {
        callback: (result) => {
          const { result: schema, error } = result;
          setError(error);
          if (schema) {
            try {
              const property = types.Property.fromJSON(schema);
              setResolvedSchema(operatorToIOSchema(property));
              if (validate && onValidationErrors && resolveCount <= 1) {
                const basePath = path as string;
                const value = get(computedParams, basePath);
                const { errors } = validateProperty(value, property);
                onValidationErrors(basePath, errors);
              }
            } catch (error) {
              setError((error as Error).toString());
            }
          }
          setResolvedParams(serializedObservedData);
          setResolveCount((count) => Math.max(count - 1, 0));
        },
      });
    },
    [resolver]
  );

  const manualRefresh = auto_update === false;
  let wrapper: WrapperType = lodashThrottle;
  if (!throttle && debounce) {
    wrapper = lodashDebounce;
  } else if (throttle === false) {
    wrapper = null;
  }
  const wrapperOptions: DebounceSettings | ThrottleSettings = {};
  if (leading !== undefined) {
    wrapperOptions.leading = leading;
  }
  if (trailing !== undefined) {
    wrapperOptions.trailing = trailing;
  }
  const waitTime = typeof wait === "number" ? wait : DEFAULT_WAIT;

  const resolveSchema = wrapper
    ? useCallback(wrapper(schemaResolver, waitTime, wrapperOptions), [
        schemaResolver,
      ])
    : schemaResolver;

  const handleResolve = () => {
    resolveSchema(fullData, params, serializedObservedData, path, validate);
    setResolvingParams(serializedObservedData);
  };

  useEffect(() => {
    if (!manualRefresh || resolvingParams === undefined) {
      handleResolve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedObservedData, serializedProvidedParams, manualRefresh]);

  const showSkeleton = !resolvedSchema && !error;
  const showRefresh =
    manualRefresh && resolvingParams !== serializedObservedData;
  const resolving = resolvingParams !== resolvedParams || resolveCount > 0;
  const showResolving = resolving && !showRefresh && !error && !showSkeleton;

  useEffect(() => {
    if (validate && (resolving || showRefresh)) {
      onValidationErrors?.(path, [{ reason: "Requires update", path: "" }]);
    }
  }, [resolving, showRefresh, validate, onValidationErrors, path]);

  return (
    <Box
      {...getComponentProps(props, "container", {
        sx: { position: "relative" },
      })}
    >
      {showSkeleton && (
        <>
          <HeaderView {...props} nested />
          <Skeleton height={64} />
        </>
      )}
      {showRefresh && (
        <MuiButton
          variant="outlined"
          startIcon={<Refresh />}
          color="secondary"
          sx={floatRightSx}
          onClick={handleResolve}
          disabled={resolving}
          loading={resolving}
        >
          Refresh
        </MuiButton>
      )}
      {showResolving && (
        <Box sx={floatRightSx}>
          <CircularProgress size={24} />
        </Box>
      )}
      {error && (
        <Alert
          severity="error"
          action={
            <MuiButton
              variant="outlined"
              size="small"
              color="inherit"
              onClick={handleResolve}
              disabled={resolving}
              loading={resolving}
              sx={{}}
            >
              Refresh
            </MuiButton>
          }
          sx={{
            alignItems: "top",
            ".MuiAlert-message": {
              maxWidth: "calc(100% - 110px)",
            },
          }}
        >
          <Stack direction="row" alignItems="top" spacing={1}>
            <AlertTitle>Failed to resolve property</AlertTitle>
            <KeyboardArrowDown
              color="error"
              sx={{
                transform: showError ? "rotate(180deg)" : "rotate(0deg)",
                cursor: "pointer",
              }}
              onClick={() => {
                setShowError(!showError);
              }}
            />
          </Stack>
          {showError && <Typography sx={{ mt: 1 }}>{error}</Typography>}
        </Alert>
      )}
      {resolvedSchema && <DynamicIO {...props} schema={resolvedSchema} />}
    </Box>
  );
}

const floatRightSx = { position: "absolute", top: 8, right: 8, zIndex: 1 };

type WrapperType = typeof lodashThrottle | typeof lodashDebounce | null;

type ResolvedSchemaType = ReturnType<typeof operatorToIOSchema>;
