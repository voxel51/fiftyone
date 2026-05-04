import { useLoader } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { useFo3dContext } from "../fo3d/context";

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [value];
  }
}

type CredentialAwareLoader = {
  manager?: unknown;
  setCrossOrigin?: (value: string) => unknown;
  setWithCredentials?: (value: boolean) => unknown;
};

type FoLoaderNoSuspenseProto<TInput, TResult> = new (...args: any[]) => {
  loadAsync: (
    input: TInput,
    onProgress?: (event: ProgressEvent<EventTarget>) => void
  ) => Promise<TResult>;
} & CredentialAwareLoader;

type FoLoaderNoSuspenseInput<
  TLoader extends FoLoaderNoSuspenseProto<any, any>
> = Parameters<InstanceType<TLoader>["loadAsync"]>[0];

type FoLoaderNoSuspenseResult<
  TLoader extends FoLoaderNoSuspenseProto<any, any>
> = Awaited<ReturnType<InstanceType<TLoader>["loadAsync"]>>;

function disposeLoadedResource(resource: unknown) {
  if (Array.isArray(resource)) {
    resource.forEach(disposeLoadedResource);
    return;
  }

  if (
    resource &&
    typeof resource === "object" &&
    "dispose" in resource &&
    typeof resource.dispose === "function"
  ) {
    resource.dispose();
  }
}

function hasMatchingCustomCredentialsAudience(urls: unknown): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  const customCredentialsAudience = sessionStorage.getItem(
    "customCredentialsAudience"
  );

  if (!customCredentialsAudience) {
    return false;
  }

  return ensureArray(urls)
    .flat()
    .some(
      (url): url is string =>
        typeof url === "string" && url.includes(customCredentialsAudience)
    );
}

function configureFoLoaderInstance(
  loaderInstance: CredentialAwareLoader,
  urls: unknown,
  loadingManager: unknown
) {
  if (loadingManager) {
    loaderInstance.manager = loadingManager;
  }

  if (hasMatchingCustomCredentialsAudience(urls)) {
    // Image-backed loaders (TextureLoader/CubeTextureLoader via ImageLoader)
    // only honor `crossOrigin`, so we explicitly keep them in anonymous CORS
    // mode for the custom-credentials audience instead of relying on the
    // browser's no-CORS image defaults.
    loaderInstance.setCrossOrigin?.("anonymous");
    // Fetch/XHR-backed loaders (for example FileLoader inside point-cloud
    // loaders) ignore `crossOrigin` and instead need credentials forwarded
    // so the Teams auth path can attach the expected request context.
    loaderInstance.setWithCredentials?.(true);
  }
}

/**
 * Decorates useLoader() to support credentials forwarding
 */
export function useFoLoader<
  TLoader extends Parameters<typeof useLoader>[0],
  TInput extends Parameters<typeof useLoader>[1]
>(
  loader: TLoader,
  urls: TInput,
  loaderFunction?: Parameters<typeof useLoader>[2]
) {
  const { loadingManager } = useFo3dContext();

  return useLoader(loader, urls, (loaderInstance) => {
    const foLoader = loaderInstance as CredentialAwareLoader;
    configureFoLoaderInstance(foLoader, urls, loadingManager);
    if (loaderFunction) {
      loaderFunction(loaderInstance);
    }
  });
}

/**
 * Loads an optional asset without using Suspense.
 *
 * This hook mirrors the loader/configuration behavior of `useFoLoader`, but it
 * resolves to `null` on failure instead of suspending or throwing through the
 * React Three error path.
 */
export function useFoLoaderNoSuspense<
  TLoader extends FoLoaderNoSuspenseProto<any, any>
>(
  Loader: TLoader,
  input: FoLoaderNoSuspenseInput<TLoader> | null | undefined,
  loaderFunction?: (loaderInstance: InstanceType<TLoader>) => void
): FoLoaderNoSuspenseResult<TLoader> | null {
  const { loadingManager } = useFo3dContext();
  const [result, setResult] =
    useState<FoLoaderNoSuspenseResult<TLoader> | null>(null);
  const currentResultRef = useRef<FoLoaderNoSuspenseResult<TLoader> | null>(
    null
  );
  const latestLoaderFunctionRef = useRef(loaderFunction);

  useEffect(() => {
    latestLoaderFunctionRef.current = loaderFunction;
  }, [loaderFunction]);

  useEffect(() => {
    if (input == null) {
      disposeLoadedResource(currentResultRef.current);
      currentResultRef.current = null;
      setResult(null);
      return;
    }

    let cancelled = false;
    const loader = new Loader() as InstanceType<TLoader>;

    disposeLoadedResource(currentResultRef.current);
    currentResultRef.current = null;
    setResult(null);
    configureFoLoaderInstance(
      loader as CredentialAwareLoader,
      input,
      loadingManager
    );
    latestLoaderFunctionRef.current?.(loader);

    loader.loadAsync(input).then(
      (nextResult) => {
        if (cancelled) {
          disposeLoadedResource(nextResult);
          return;
        }

        currentResultRef.current = nextResult;
        setResult(nextResult);
      },
      (error) => {
        if (cancelled) {
          return;
        }

        console.warn("FO loader error", error);
        if (!cancelled) {
          setResult(null);
        }
      }
    );

    return () => {
      cancelled = true;
      disposeLoadedResource(currentResultRef.current);
      currentResultRef.current = null;
    };
  }, [Loader, input, loadingManager]);

  return result;
}
