export interface State {
  hasMore: boolean;
  isLoading: boolean;
  loadMore: boolean;
  pageToLoad: number | null;
}

interface RowSample {
  id?: string;
  aspectRatio: number;
}

interface Row {
  samples: RowSample[];
  aspectRatio: number;
}

interface Rows {
  rows: Row[];
  remainder: Sample[];
}

interface Sample {
  sample: {
    _id: string;
  };
  width: number;
  height: number;
  aspect_ratio: number;
}

const lastRow = (
  row: Sample[],
  aspectRatio: number,
  threshold: number
): [RowSample[], number] => {
  const baseAspectRatio = row[0].aspect_ratio;
  const sameAspectRatios = row
    .slice(1)
    .every((i) => baseAspectRatio === i.aspect_ratio);

  let emptySamples: RowSample[] = [];
  if (sameAspectRatios) {
    let currentAR = row[0].aspect_ratio * row.length;
    while (currentAR < threshold) {
      currentAR += row[0].aspect_ratio;
      emptySamples.push({ aspectRatio: row[0].aspect_ratio });
    }
    return [emptySamples, currentAR];
  }

  return [[{ aspectRatio: threshold - aspectRatio }], threshold];
};

export default function tile(
  data: Sample[],
  newHasMore: boolean,
  state: State,
  { rows, remainder: oldRemainder }: Rows,
  rowAspectRatioThreshold: number
): [State, Rows] {
  const samplesToFit = [...oldRemainder, ...data];
  rows = [...rows];
  const newRows = [];
  const newRowsAR = [];
  let currentRow = [];
  let currentAR = null;
  for (const i in samplesToFit) {
    const s = samplesToFit[i];
    if (currentAR === null) {
      currentAR = s.aspect_ratio;
      currentRow.push(s);
      continue;
    }

    if (currentAR >= rowAspectRatioThreshold) {
      newRows.push(currentRow);
      newRowsAR.push(currentAR);
      currentRow = [s];
      currentAR = s.aspect_ratio;
      continue;
    }

    currentAR += s.aspect_ratio;
    currentRow.push(s);
  }

  let remainder = [];
  if (!Boolean(newHasMore) && currentRow.length) {
    newRows.push(currentRow);
    newRowsAR.push(currentAR);
  } else remainder = currentRow;

  for (const i in newRows) {
    const row: Sample[] = newRows[i];
    let ar = newRowsAR[i];

    let emptySamples: RowSample[] = [];
    if (
      !Boolean(newHasMore) &&
      i === String(newRows.length - 1) &&
      ar < rowAspectRatioThreshold
    ) {
      [emptySamples, ar] = lastRow(row, ar, rowAspectRatioThreshold);
    }

    rows.push({
      samples: [
        ...row.map((s) => ({
          id: s.sample._id,
          aspectRatio: s.aspect_ratio,
        })),
        ...emptySamples,
      ],
      aspectRatio: ar,
    });
  }

  return [
    {
      hasMore: Boolean(newHasMore),
      isLoading: false,
      loadMore: false,
      pageToLoad: state.pageToLoad,
    },
    { rows, remainder },
  ];
}
