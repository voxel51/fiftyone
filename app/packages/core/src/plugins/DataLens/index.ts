import {PluginComponentType, registerComponent} from '@fiftyone/plugins';
import {LensPanel} from './LensPanel';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';

registerComponent({
    name: 'data_lens_panel',
    label: 'Data Lens',
    component: LensPanel,
    type: PluginComponentType.Panel,
    Icon: ImageSearchIcon,
    activator: () => true,
});
