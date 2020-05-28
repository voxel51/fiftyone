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

  for (const s in samplesToFit) {
    consotle.log(s);
  }

  return state;
}
