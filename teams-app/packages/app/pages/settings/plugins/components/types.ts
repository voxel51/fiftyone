import { pluginsQuery$dataT } from '@fiftyone/teams-state';
import { QueryRefresherType } from 'lib/withQueryRefresher';

export type PluginsRefreshProps = {
  refresh: QueryRefresherType;
};

export type PluginsComponentProps = PluginsRefreshProps & {
  plugins: pluginsQuery$dataT['plugins'];
};
