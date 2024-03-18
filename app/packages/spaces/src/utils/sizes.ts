export function getRelativeSizes(sizes: number[]) {
  const sizesTotal = sizes.reduce((total, item) => total + item, 0);
  let sizeAvailable = 100;
  return sizes.map((size, i) => {
    const relativeSize = Math.round((size / sizesTotal) * 100);
    const adjustedSize = i === sizes.length - 1 ? sizeAvailable : relativeSize;
    sizeAvailable -= adjustedSize;
    return `${adjustedSize}%`;
  });
}

export function getAbsoluteSizes(sizes: string[], totalSize: number) {
  let sizeAvailable = totalSize;
  return sizes.map((size, i) => {
    const numericSize = parseFloat(size) / 100;
    const relativeSize = Math.round(totalSize * numericSize);
    const adjustedSize = i === sizes.length - 1 ? sizeAvailable : relativeSize;
    sizeAvailable -= adjustedSize;
    return adjustedSize;
  });
}
