export function getRelativeSizes(sizes: number[]) {
  const sizesTotal = sizes.reduce((total, item) => total + item, 0);
  let sizeAvailable = 100;
  return sizes.map((size, i) => {
    const relativeSize = Math.round((size / sizesTotal) * 100);
    const adjustedSize = i === sizes.length - 1 ? sizeAvailable : relativeSize;
    sizeAvailable -= adjustedSize;
    return adjustedSize / 100;
  });
}

export function getAbsoluteSizes(sizes: number[], totalSize: number) {
  let sizeAvailable = totalSize;
  return sizes.map((size, i) => {
    const relativeSize = Math.round(totalSize * size);
    const adjustedSize = i === sizes.length - 1 ? sizeAvailable : relativeSize;
    sizeAvailable -= adjustedSize;
    return adjustedSize;
  });
}

export function toPercentage(floatingPoint?: number) {
  if (typeof floatingPoint === "number") {
    return `${Math.round(floatingPoint * 100)}%`;
  }
}
