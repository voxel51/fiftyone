import { subscribe } from '@fiftyone/relay';
import {
  hiddenLabels,
  savedLookerOptions,
  similaritySorting
} from '@fiftyone/state';
import { loading, setPending } from 'pages/state';
import loadPageQuery from '../loadPageQuery';
import { getHistoryState } from '../state';
import { writeSession } from '../useLocalSession';
import { datasetPage } from '../usePage';
import { RegisteredSetter } from './registerSetter';

const onSetSimilarityParameters: RegisteredSetter =
  ({ runner }) =>
  (_, __) => {
    const state = getHistoryState();
    requestAnimationFrame(() => {
      setPending();
      writeSession(state.datasetId, async (session) => {
        session.selectedSamples = new Set();
        session.selectedLabels = [];
        const entry = await loadPageQuery(
          state,
          session.fieldVisibilityStage,
          true
        );
        const unsubscribe = subscribe((_, { set }) => {
          const atom = datasetPage;
          set(atom, entry);
          set(similaritySorting, false);
          set(savedLookerOptions, (cur) => ({
            ...cur,
            showJSON: false
          }));
          set(hiddenLabels, {});
          set(loading, false);
          unsubscribe();
        });

        runner(entry);
      });
    });
  };

export default onSetSimilarityParameters;
