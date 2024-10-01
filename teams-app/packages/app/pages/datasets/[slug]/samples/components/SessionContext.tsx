import * as fos from '@fiftyone/state';
import { OSSRelayEnvironment } from '@fiftyone/teams-state';
import { RecoilRelayEnvironmentProvider } from 'recoil-relay';
import { Page } from '../dynamicRouting/loadPageQuery';

const SessionContext: React.FC<React.PropsWithChildren<{ page: Page }>> = ({
  children,
  page
}) => {
  return (
    <OSSRelayEnvironment.Provider value={fos.getCurrentEnvironment()}>
      <RecoilRelayEnvironmentProvider
        environment={fos.getCurrentEnvironment()}
        environmentKey={fos.RelayEnvironmentKey}
      >
        <fos.datasetQueryContext.Provider value={page.data}>
          {children}
        </fos.datasetQueryContext.Provider>
      </RecoilRelayEnvironmentProvider>
    </OSSRelayEnvironment.Provider>
  );
};

export default SessionContext;
