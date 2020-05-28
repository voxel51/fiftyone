const loadSample = async (sample, host) => {
  const src = `${host}?path=${sample.filepath}`;
  const response = await fetch(src);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  return { sample, height: bitmap.height, width: bitmap.width };
};

export default async function tile(data, state, count, host) {
  const result = await Promise.all(data.map((s) => loadSample(s, host)));

  const samplesToFit = [...state.remainder, ...result];
  const rows = [...state.rows];
  const newHasMore = state.pageToLoad * 20 < count;
  const newRows = [];
  let currentRow = [];
  let currentWidth = null;
  let currentHeight = null;
  for (const i in samplesToFit) {
    const s = samplesToFit[i];
    if (currentWidth === null) {
      currentWidth = s.width;
      currentHeight = s.height;
      currentRow.push(s.sample);
      continue;
    }

    if (currentWidth / currentHeight >= 5) {
      newRows.push(currentRow);
      currentRow = [s.sample];
      currentWidth = s.width;
      currentHeight = s.height;
      continue;
    }
    currentRow.push(s.sample);
    currentWidth += (currentHeight / s.height) * s.width;
  }

  let remainder = [];
  const newRemainder = newHasMore ? currentRow : [];
  if (!newHasMore && currentRow.length) newRows.push(currentRow);

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
    rows.push({ style: rowStyle, samples: row });
  }
  return {
    hasMore: state.pageToLoad * 20 < count,
    rows: rows,
    isLoading: false,
    remainder: remainder,
    pageToLoad: state.pageToLoad + 1,
  };
}
