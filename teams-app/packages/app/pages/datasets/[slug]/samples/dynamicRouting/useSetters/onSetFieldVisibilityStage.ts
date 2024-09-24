import type { State } from '@fiftyone/state';
import { setPending } from 'pages/state';
import { DefaultValue } from 'recoil';
import {
  FIELD_VISIBILITY_EVENT,
  type HistoryState,
  getHistoryState,
  replaceHistoryState
} from '../state';
import { transition } from '../transition';
import { writeSession } from '../useLocalSession';
import type { RegisteredSetter } from './registerSetter';

const onSetFieldVisibilityStage: RegisteredSetter =
  () => (_, input?: DefaultValue | State.FieldVisibilityStage) => {
    requestAnimationFrame(async () => {
      // show loading stripe
      setPending();

      // create new state
      const { fieldVisibilityStage: __, ...state } = getHistoryState();
      const newState: HistoryState = {
        ...state,
        event: FIELD_VISIBILITY_EVENT,
        fieldVisibilityStage: input instanceof DefaultValue ? undefined : input
      };

      // write the field visibility setting to browser storage
      await writeSession(state.datasetId, async (session) => {
        session.fieldVisibilityStage = newState.fieldVisibilityStage;
      });

      // update window.location.state
      replaceHistoryState(newState);

      // transition to new page query
      await transition(newState, true);
    });
  };

export default onSetFieldVisibilityStage;
