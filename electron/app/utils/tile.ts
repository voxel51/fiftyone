export default function tile(data, newHasMore, state, host) {
  const samplesToFit = [...state.remainder, ...data];
  const rows = [...state.rows];
  const newRows = [];
  let currentRow = [];
  let currentWidth = null;
  let currentHeight = null;
  for (const i in samplesToFit) {
    const s = samplesToFit[i];
    if (currentWidth === null) {
      currentWidth = s.width;
      currentHeight = s.height;
      currentRow.push(s);
      continue;
    }

    if (currentWidth / currentHeight >= 5) {
      newRows.push(currentRow);
      currentRow = [s];
      currentWidth = s.width;
      currentHeight = s.height;
      continue;
    }
    currentRow.push(s);
    currentWidth += (currentHeight / s.height) * s.width;
  }

  let remainder = [];
  const newRemainder = Boolean(newHasMore) ? currentRow : [];
  if (!Boolean(newHasMore) && currentRow.length) newRows.push(currentRow);

  for (const i in newRows) {
    const row = newRows[i];
    const columns = [];
    const baseHeight = row[0].height;
    const refWidth = row.reduce(
      (acc, val) => acc + (baseHeight / val.height) * val.width,
      0
    );
    for (const j in row) {
      const sample = row[j];
      const sampleWidth = (baseHeight * sample.width) / sample.height;
      columns.push(sampleWidth / refWidth);
    }
    const rowStyle = {
      display: "grid",
      gridTemplateColumns: columns
        .map((c) => (c * 100).toFixed(2) + "%")
        .join(" "),
      width: "100%",
      margin: 0,
    };
    rows.push({ style: rowStyle, samples: row.map((s) => s.sample) });
  }
  return {
    hasMore: Boolean(newHasMore),
    rows: rows,
    isLoading: false,
    loadMore: false,
    remainder: remainder,
    pageToLoad: Boolean(newHasMore) ? newHasMore : state.pageToLoad,
  };
}
