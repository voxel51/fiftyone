const viewCompareMapper = (stages) =>
  stages.map(({ kwargs, _cls }) => ({ kwargs, _cls }));

export const viewsAreEqual = (viewOne, viewTwo) => {
  return (
    JSON.stringify(viewCompareMapper(viewOne)) ===
    JSON.stringify(viewCompareMapper(viewTwo))
  );
};
