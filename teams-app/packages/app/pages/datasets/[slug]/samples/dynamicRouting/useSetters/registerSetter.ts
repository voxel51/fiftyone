import { Setter } from '@fiftyone/relay';
import { useSessionSetter } from '@fiftyone/state';
import { Environment } from 'react-relay';
import { Page } from '../loadPageQuery';
import { DatasetData } from '../transition';

type SetterContext = {
  dataset: DatasetData;
  environment: Environment;
  // for showing snackbar errors
  handleError: (errors: string[]) => void;
  runner: (page: Page) => void;
  setter: ReturnType<typeof useSessionSetter>;
};

export type RegisteredSetter = (ctx: SetterContext) => Setter;

export const REGISTERED_SETTERS = new Map<string, RegisteredSetter>();

const registerSetter = (key: string, setter: RegisteredSetter) => {
  REGISTERED_SETTERS.set(key, setter);
};

export default registerSetter;
