import { MuiButton } from "@fiftyone/components";
import {
  executeOperator,
  types,
  validate as validateProperty,
} from "@fiftyone/operators";
import { useUnboundStateRef } from "@fiftyone/state";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // Request ID pattern to prevent race conditions
  const requestIdRef = useRef(0);

  // Track first resolution after dependencies change for validation
  const firstResolutionRef = useRef(true);

  // Stable refs for cleanup effect
  const pathRef = useRef(path);
  const onValidationErrorsRef = useRef(onValidationErrors);

  useEffect(() => {
    pathRef.current = path;
    onValidationErrorsRef.current = onValidationErrors;
  });

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

  // Reset first resolution flag when dependencies change
  useEffect(() => {
    firstResolutionRef.current = true;
  }, [serializedObservedData, serializedProvidedParams]);

  const schemaResolver = useCallback(
    (
      params: Record<string, unknown>,
      providedParams: Record<string, unknown> | undefined,
      serializedObservedData: string,
      path?: string,
      validate?: boolean
    ) => {
      const requestId = ++requestIdRef.current;

      const computedParams = providedParams
        ? { ...params, ...providedParams }
        : params;

      setResolvingParams(serializedObservedData);

      executeOperator(resolver, computedParams, {
        callback: (result) => {
          // Discard stale results - only process latest request
          if (requestId !== requestIdRef.current) {
            return;
          }

          const { result: schema, error } = result;
          setError(error);

          if (schema) {
            try {
              const property = types.Property.fromJSON(schema);
              setResolvedSchema(operatorToIOSchema(property));

              // Validate only on first resolution after dependencies change
              if (
                validate &&
                onValidationErrors &&
                firstResolutionRef.current
              ) {
                firstResolutionRef.current = false;
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
        },
      });
    },
    [resolver, onValidationErrors, path]
  );

  // Ref that always holds the latest resolver fn to prevent wrapper recreation
  const resolverRef = useRef(schemaResolver);

  useEffect(() => {
    resolverRef.current = schemaResolver;
  });

  const manualRefresh = auto_update === false;
  const wrapper = useMemo(() => {
    let wrapperFn: WrapperType = lodashThrottle;
    if (!throttle && debounce) {
      wrapperFn = lodashDebounce;
    } else if (throttle === false) {
      wrapperFn = null;
    }
    return wrapperFn;
  }, [throttle, debounce]);

  const waitTime = typeof wait === "number" ? wait : DEFAULT_WAIT;

  // Stable wrapper that only recreates when configuration changes
  const resolveSchema = useMemo(() => {
    if (!wrapper) {
      // No throttle/debounce - invoke the resolver directly via ref
      return (
        params: Record<string, unknown>,
        providedParams: Record<string, unknown> | undefined,
        observed: string,
        path?: string,
        validate?: boolean
      ) => {
        return resolverRef.current(
          params,
          providedParams,
          observed,
          path,
          validate
        );
      };
    }

    const wrapperOptions: DebounceSettings | ThrottleSettings = {};
    if (leading !== undefined) {
      wrapperOptions.leading = leading;
    }
    if (trailing !== undefined) {
      wrapperOptions.trailing = trailing;
    }

    // Create throttled/debounced function only when behavior spec changes
    const wrapped = wrapper(
      (
        params: Record<string, unknown>,
        providedParams: Record<string, unknown> | undefined,
        observed: string,
        path?: string,
        validate?: boolean
      ) => {
        resolverRef.current(params, providedParams, observed, path, validate);
      },
      waitTime,
      wrapperOptions
    );

    return wrapped;
  }, [wrapper, waitTime, leading, trailing]);

  // Cleanup debounce/throttle on unmount or when wrapper changes
  useEffect(() => {
    return () => {
      if (resolveSchema.cancel) {
        resolveSchema.cancel();
      }
    };
  }, [resolveSchema]);

  const handleResolve = useCallback(() => {
    resolveSchema(fullData, params, serializedObservedData, path, validate);
  }, [resolveSchema, fullData, params, serializedObservedData, path, validate]);

  const unboundedStateRef = useUnboundStateRef({
    manualRefresh,
    resolvingParams,
    handleResolve,
  });

  useEffect(() => {
    const { manualRefresh, resolvingParams, handleResolve } =
      unboundedStateRef.current;
    if (!manualRefresh || resolvingParams === undefined) {
      handleResolve();
    }
  }, [serializedObservedData, serializedProvidedParams, unboundedStateRef]);

  const showSkeleton = !resolvedSchema && !error;
  const showRefresh =
    manualRefresh && resolvingParams !== serializedObservedData;
  // Simplified resolving check - no longer needs resolveCount
  const resolving = resolvingParams !== resolvedParams;
  const showResolving = resolving && !showRefresh && !error && !showSkeleton;

  useEffect(() => {
    if (validate && (resolving || showRefresh)) {
      onValidationErrors?.(path, [{ reason: "Requires update", path: "" }]);
    }
  }, [resolving, showRefresh, validate, onValidationErrors, path]);

  // Cleanup validation errors on unmount using stable refs
  useEffect(() => {
    return () => {
      onValidationErrorsRef.current?.(pathRef.current, []);
    };
  }, []);

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
            alignItems: "flex-start",
            ".MuiAlert-message": {
              maxWidth: "calc(100% - 110px)",
            },
          }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
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
