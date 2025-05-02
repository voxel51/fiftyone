import { useLoader } from "@react-three/fiber";

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
  return useLoader(loader, urls, (loaderInstance) => {
    if (sessionStorage.getItem("customCredentialsAudience")?.length) {
      loaderInstance.setWithCredentials(true);
    }
    if (loaderFunction) {
      loaderFunction(loaderInstance);
    }
  });
}
