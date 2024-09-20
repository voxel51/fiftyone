import Router from 'next/router';
import type { RegisteredSetter } from './registerSetter';

const onSetDataset: RegisteredSetter = (_) => (_, datasetName: string) => {
  if (Router.query.slug !== datasetName) {
    const isNullish =
      typeof datasetName !== 'string' || datasetName.trim().length === 0;
    Router.push(isNullish ? '/datasets' : `/datasets/${datasetName}/samples`);
  }
};

export default onSetDataset;
