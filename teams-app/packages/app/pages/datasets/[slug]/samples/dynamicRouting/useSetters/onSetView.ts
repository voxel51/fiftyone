import { setView, setViewMutation } from '@fiftyone/relay';
import { State, viewStateForm_INTERNAL } from '@fiftyone/state';
import { PayloadError, commitMutation } from 'relay-runtime';
import { getHistoryState, pushHistoryState } from '../state';
import { writeSession } from '../useLocalSession';
import { RegisteredSetter } from './registerSetter';

const onSetView: RegisteredSetter =
  ({ environment, handleError }) =>
  ({ get }, view: State.Stage[]) => {
    const state = getHistoryState();

    const onError = async (errors: readonly PayloadError[]) => {
      handleError(errors.map((e) => e.message));
      const { rollbackViewBar } = await import('@fiftyone/core');
      rollbackViewBar();
      return;
    };

    commitMutation<setViewMutation>(environment, {
      mutation: setView,
      variables: {
        view,
        datasetName: state.datasetName,
        subscription: '',
        form: get(viewStateForm_INTERNAL) || {}
      },
      onError: (error) => onError([error]),
      onCompleted: async ({ setView: view }, errors) => {
        if (errors?.length) {
          onError(errors);
          return;
        }

        // update browser storage
        await writeSession(state.datasetId, async (session) => {
          session.selectedSamples = new Set();
          session.selectedLabels = [];
          session.fieldVisibilityStage = undefined;
          session.view = view;
        });

        // transition to next page
        await pushHistoryState({
          ...state,
          fieldVisibilityStage: undefined,
          view
        });
      }
    });
  };

export default onSetView;
