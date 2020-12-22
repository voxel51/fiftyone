const viewCompareMapper = (stages) =>
  stages.map(({ kwargs, _cls }) => ({ kwargs, _cls }));

const filterPrivateKwargs = (view) => {
  return view.map((stage) => ({
    ...stage,
    kwargs: stage.kwargs.filter((ka) => !ka[0].startsWith("_")),
  }));
};

export const viewsAreEqual = (viewOne, viewTwo) => {
  return (
    JSON.stringify(viewCompareMapper(filterPrivateKwargs(viewOne))) ===
    JSON.stringify(viewCompareMapper(filterPrivateKwargs(viewTwo)))
  );
};
