import { useLoader } from "@react-three/fiber";

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [value];
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
  return useLoader(loader, urls, (loaderInstance) => {
    const customCredentialsAudience = sessionStorage.getItem(
      "customCredentialsAudience"
    );
    if (customCredentialsAudience) {
      // The types say that `urls` is string | string[]
      // But! Our code also sometimes passes in string[][]
      // So, we're both calling ensureArray() and flat()
      const urlArray = ensureArray(urls).flat();
      if (urlArray.some((url) => url.includes(customCredentialsAudience))) {
        loaderInstance.setWithCredentials(true);
      }
    }
    if (loaderFunction) {
      loaderFunction(loaderInstance);
    }
  });
}
