const hasHistoryState = () => {
  return Boolean(history.state?.options?.fiftyone);
};

const glueHistory = (cb: (cb: () => void) => void, replace: () => void) => {
  const match = RegExp('/datasets/.*/samples');
  let exitedPage = false;
  // This is the glue between NextJS's built-in router and the routing
  // managed by the embedded dataset page.
  //
  // It's only function is to force a NextJS re-render when returning to a
  // previously loaded dataset page
  //
  // e.g /dataset/quickstart/samples -> /dataset/quickstart/samples
  //   -> (pop) /dataset/quickstart/samples (replace triggers page render)
  const listener = () => {
    // matches for /dataset/[slug]/samples
    const onSamplesPage = match.test(location.pathname);
    // user has left /dataset/[slug]/samples
    if (!exitedPage && !onSamplesPage) {
      exitedPage = true;
      // user has returned to /dataset/[slug]/samples
    } else if (exitedPage && onSamplesPage && hasHistoryState()) {
      exitedPage = false;
      // trigger page render
      replace();
    }
    cb(listener);
  };

  cb(listener);
};

export default glueHistory;
