import { useLoader } from "@react-three/fiber";

/**
 * Decorates useLoader() to support credentials forwarding
 */
export const useFoLoader = (
  loader: Parameters<typeof useLoader>[0],
  urls: Parameters<typeof useLoader>[1],
  loaderFunction?: Parameters<typeof useLoader>[2]
) => {
  return useLoader(loader, urls, (loader) => {
    if (sessionStorage.getItem("customCredentialsAudience")?.length) {
      loader.setWithCredentials(true);
    }

    if (loaderFunction) {
      loaderFunction(loader);
    }
  });
};
