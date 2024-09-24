/**
 * This file is used for constants and does not export observable states. The
 *  file may be moved out of state package in the future
 */
export const MEMBER_AVATARS_TO_SHOW_COUNT = 15;
export const GROUP_MEMBER_AVATARS_TO_SHOW_COUNT = 5;
export const DELETE_DATASET_DOCS_LINK =
  'https://voxel51.com/docs/fiftyone/user_guide/using_datasets.html#dataset-persistence';
export const DATASET_CREATION_DOCUMENTATION_LINK =
  'https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/index.html';
export const DOCUMENTATION_LINK = 'https://fiftyone.ai/';
export const CONTACT_LINK = 'mailto:support@voxel51.com';
export const SLACK_LINK = 'https://slack.voxel51.com';
export const GITHUB_LINK = 'https://github.com/voxel51/fiftyone';
export const TERMS_OF_SERVICE_LINK = 'https://voxel51.com/terms';
export const PRIVACY_POLICY_LINK = 'https://voxel51.com/privacy';
export const CLONE_DATASET_DOCUMENTATION_LINK =
  'https://voxel51.com/docs/fiftyone/user_guide/using_datasets.html#cloning-datasets';
export const INITIAL_PINNED_DATASETS_LIMIT = 5;
export const INITIAL_PINNED_RUNS_LIMIT = 5;
export const INITIAL_ORCHESTRATORS_LIMIT = 5;
export const PINNED_DATASET_LOAD_MORE_LIMIT = 10;
export const PINNED_DATASETS_ORDER_DIRECTION = 'DESC';
export const DATASETS_ORDER_DIRECTION_ASC = 'ASC';
export const DATASETS_ORDER_DIRECTION_DESC = 'DESC';
export const LEARN_MORE_ABOUT_ROLES_LINK =
  'https://docs.voxel51.com/teams/roles_and_permissions.html';
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_USERS_PAGE_SIZE = 25;
export const DEFAULT_PROXY_TARGET = 'http://127.0.0.1:5151';
export const DEFAULT_LIST_PAGE_SIZE = 25;
export const DEFAULT_LIST_PAGE_SIZES: string[] = ['25', '50', '100'];
export const DEFAULT_USER_DATASETS_LIST_PAGE = 1;
export const DEFAULT_USER_DATASETS_LIST_PAGE_SIZE = 3;
export const HOW_TO_CONNECT_TO_GCP_LINK =
  'https://docs.voxel51.com/teams/installation.html#google-cloud-storage';
export const HOW_TO_CONNECT_TO_AWS_LINK =
  'https://docs.voxel51.com/teams/installation.html#amazon-s3';
export const HOW_TO_CONNECT_TO_MINIO_LINK =
  'https://docs.voxel51.com/teams/installation.html#minio';
export const HOW_TO_CONNECT_TO_AZURE_LINK =
  'https://docs.voxel51.com/teams/installation.html#microsoft-azure';
export const DATASET_PERMISSION_LINK = 'https://voxel51.com/docs/fiftyone';
export const CLOUD_EXPORT_LINK = '#';
export const CODE_EXPORT_LINK =
  'https://docs.voxel51.com/user_guide/export_datasets.html';
export const ROLES_AND_PERMISSIONS_DOCUMENTATION_LINK =
  'https://docs.voxel51.com/teams/roles_and_permissions.html';
export const SETTINGS_NAV_ITEMS = {
  personal: [
    {
      label: 'Account',
      id: 'account',
      href: '/settings/account'
    },
    {
      label: 'API keys',
      id: 'api_keys',
      href: '/settings/api_keys',
      minimumRole: 'COLLABORATOR'
    }
  ],
  organization: [
    {
      label: 'Cloud storage',
      id: 'cloud_storage_credentials',
      href: '/settings/cloud_storage_credentials'
    },
    {
      label: 'Team',
      id: 'team',
      href: '/settings/team/users',
      subItems: [
        {
          label: 'Users',
          id: 'team_users',
          href: '/settings/team/users'
        },
        {
          label: 'Groups',
          id: 'team_groups',
          href: '/settings/team/groups'
        }
      ]
    },
    {
      label: 'Security',
      id: 'security',
      href: '/settings/security/config',
      subItems: [
        {
          label: 'Config',
          id: 'security_config',
          href: '/settings/security/config'
        },
        {
          label: 'Roles',
          id: 'security_roles',
          href: '/settings/security/roles'
        }
      ]
    },
    {
      label: 'Plugins',
      id: 'plugins',
      href: '/settings/plugins'
    },
    {
      label: 'Secrets',
      id: 'secrets',
      href: '/settings/secrets',
      minimumRole: 'ADMIN'
    }
  ]
};
export const { API_URL } = process.env;
export const NEXTJS_PROXY_TIMEOUT =
  parseInt(process.env.NEXTJS_PROXY_TIMEOUT) || 10 * 60 * 1000; // 10 minutes
export const COMPANY_NAME = 'Voxel51';
export const SEARCH_INPUT_DEBOUNCE = 500; // ms
export const DEFAULT_SUGGESTION_COUNT = 5;
export const FIFTYONE_TEAMS_PROXY_ENDPOINT = '/api/proxy/fiftyone-teams';
export const CLOUD_STORAGE_PROVIDERS = {
  GCP: {
    id: 'GCP',
    label: 'Google Cloud Platform'
  },
  AWS: {
    id: 'AWS',
    label: 'Amazon Web Services'
  },
  AZURE: {
    id: 'AZURE',
    label: 'Microsoft Azure'
  },
  MINIO: {
    id: 'MINIO',
    label: 'MinIO'
  }
};
export const CLOUD_STORAGE_TEXT = {
  subTitlePrefix: `
  If you do not supply any bucket names below, these credentials will be used as
  `,
  subTitleSuffix: `
  for all buckets that do not have bucket-specific credentials registered.
  `
};
export const EXPORT_DATA_ITEMS = {
  'media-labels': {
    id: 'media-labels',
    label: 'Media and labels',
    title: 'Media and labels'
  },
  media: { id: 'media', label: 'Media only', title: 'Media' },
  labels: { id: 'labels', label: 'Labels only', title: 'Labels' },
  'filepaths-tags': {
    id: 'filepaths-tags',
    label: 'Filepaths and tags',
    title: 'Filepaths and tags'
  },
  filepaths: { id: 'filepaths', label: 'Filepaths only', title: 'Filepaths' }
};
export const MAX_EXPORT_SIZE = '100MB';
export const EXPORTED_FILE_BASE_PATH = '/api/proxy/file-';
export const SESSION_STORAGE_KEY = 'FIFTYONE_APP_SESSION';
export const ALLOW_MEDIA_EXPORT_ENV_KEY = 'FIFTYONE_APP_ALLOW_MEDIA_EXPORT';
export const FIFTYONE_VERSION_ENV_KEY =
  'FIFTYONE_APP_TEAMS_SDK_RECOMMENDED_VERSION';
export const PYPI_INDEX_URL_ENV_KEY = 'FIFTYONE_APP_TEAMS_INDEX_URL';
export const FIFTYONE_PACKAGE_NAME_ENV_KEY =
  'FIFTYONE_APP_FIFTYONE_PACKAGE_NAME';
export const FIFTYONE_APP_INSTALL_FIFTYONE_OVERRIDE =
  'FIFTYONE_APP_INSTALL_FIFTYONE_OVERRIDE';
export const APP_THEME_ENV_KEY = 'FIFTYONE_APP_THEME';
export const APP_THEME_INIT_LOCAL_STORAGE_KEY = 'APP_THEME_INIT';
export const FIFTYONE_APP_SERVICE_WORKER_ENABLED =
  'FIFTYONE_APP_SERVICE_WORKER_ENABLED';
export const FIFTYONE_APP_SEGMENT_WRITE_KEY = 'FIFTYONE_APP_SEGMENT_WRITE_KEY';
export const FIFTYONE_APP_ANONYMOUS_ANALYTICS_ENABLED = 'FIFTYONE_APP_ANONYMOUS_ANALYTICS_ENABLED';
export const VALID_THEMES = ['dark', 'light'];
export const NON_OVERRIDABLE_THEME_PREFIX = 'always-';
export const USER_ROLES = [
  // {
  //   id: 'owner',
  //   label: 'Owner',
  //   description: 'Access to all datasets and manages billing'
  // },
  {
    id: 'ADMIN',
    label: 'Admin',
    description: 'Access to all datasets, and can invite new members'
  },
  {
    id: 'MEMBER',
    label: 'Member',
    description: 'Can access all team datasets, but cannot invite members'
  },
  {
    id: 'COLLABORATOR',
    label: 'Collaborator',
    description: 'Can only access datasets they are invited to'
  },
  {
    id: 'GUEST',
    label: 'Guest',
    description: 'Can only view datasets they are invited to'
  }
];

export const OPERATOR_USER_ROLES = USER_ROLES.map((role) => ({
  ...role,
  description: `People with ${role.label} role or higher can execute operator`
}));

export const DATASET_PERMISSION_NO_ACCESS_ID = 'NO_ACCESS';

export const DATASET_PERMISSIONS = [
  {
    id: DATASET_PERMISSION_NO_ACCESS_ID,
    label: 'No access',
    description: 'Cannot view dataset or its samples',
    enum: 0
  },
  {
    id: 'VIEW',
    label: 'Can view',
    description: 'Can view samples, but not add, edit, or delete samples',
    enum: 1
  },
  {
    id: 'TAG',
    label: 'Can tag',
    description:
      'Can view samples and add sample and label tags, but not add, edit, or delete samples',
    enum: 2
  },
  {
    id: 'EDIT',
    label: 'Can edit',
    description:
      'Can view samples, edit them, add new samples, and delete samples',
    enum: 3
  },
  {
    id: 'MANAGE',
    label: 'Can manage',
    description:
      'Can view and edit samples, invite additional users, and delete the entire dataset',
    enum: 4
  }
];

export const OPERATOR_DATASET_PERMISSIONS = [
  {
    id: 'VIEW',
    label: 'Can view',
    description:
      'People with Can view permission or higher on the current dataset can execute operator'
  },
  {
    id: 'EDIT',
    label: 'Can edit',
    description:
      'People with Can edit permission or higher on the current dataset can execute operator'
  },
  {
    id: 'TAG',
    label: 'Can tag',
    description:
      'People with Can tag permission or higher on the current dataset can execute operator'
  },
  {
    id: 'MANAGE',
    label: 'Can manage',
    description:
      'People with Can manage permission or higher on the current dataset can execute operator'
  }
];

export const MAX_DATASET_NAME_LEN = 100;
export const FILE_REST_ENDPOINT = '/api/proxy/file';
export const DATASET_TABS = [
  { label: 'Samples', path: 'samples', pattern: /samples(\/)?(\?.*?)?$/ },
  { label: 'History', path: 'history' },
  { label: 'Runs', path: 'runs', pattern: /\/runs\/[^\/]*$/ },
  {
    label: 'Manage',
    path: 'manage/basic_info',
    subPaths: ['manage/access', 'manage/danger_zone']
  }
];
export const SAMPLES_NEXT_PATH = '/datasets/[slug]/samples';
export const LEARN_MORE_ABOUT_DATASET_SNAPSHOT_LINK =
  'https://docs.voxel51.com/teams/dataset_versioning.html';
export const OPERATOR_RUN_STATES = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  QUEUED: 'queued',
  RUNNING: 'running'
};

export const mediaTypeItems = [
  { id: 'THREE_D', label: '3D' },
  { id: 'GROUP', label: 'Group' },
  { id: 'IMAGE', label: 'Image' },
  { id: 'POINT_CLOUD', label: 'Point cloud' },
  { id: 'VIDEO', label: 'Video' },
  { id: null, label: 'Unselect all' }
];

export const mediaTypeItemsKeys = mediaTypeItems.map(({ id }) => id);
export const AUTO_REFRESH_INTERVAL = 5000;
export const AUTO_REFRESH_INTERVAL_IN_SECONDS = AUTO_REFRESH_INTERVAL / 1000;
export const DEFAULT_ANIMATION_DURATION = 0.3;
export const DEFAULT_SECONDARY_ANIMATION_DURATION = 0.1;
export const ENABLE_ORCHESTRATOR_REGISTRATION_ENV_KEY =
  'FIFTYONE_ENABLE_ORCHESTRATOR_REGISTRATION';
export const FIFTYONE_SNAPSHOTS_ARCHIVE_PATH_ENV_KEY =
  'FIFTYONE_SNAPSHOTS_ARCHIVE_PATH';

export const PYTHON_START_TEXT = `import fiftyone as fo
dataset = fo.load_dataset(...)`;
export const API_CONNECTION =
  'https://docs.voxel51.com/teams/api_connection.html';
export const FIFTYONE_API_URI = 'FIFTYONE_API_URI';
export const FEATURE_FLAG_ENABLE_INVITATIONS_ENV_KEY =
  'FEATURE_FLAG_ENABLE_INVITATIONS';
export const FEATURE_FLAG_ENABLE_MANUAL_USER_GROUP_MANAGEMENT_ENV_KEY =
  'FEATURE_FLAG_ENABLE_MANUAL_USER_GROUP_MANAGEMENT';
export const SIGN_IN_ENDPOINT = '/cas/api/auth/signin?callbackUrl=/datasets';

export const SIGN_IN_ENDPOINT_WITH_ERROR_PREFIX = '/cas/api/auth/signin?error=';

export const SESSION_ENDPOINT = '/cas/api/auth/session';
export const SIGN_OUT_ENDPOINT = '/cas/api/auth/signout?callbackUrl=/sign-out';
export const CSRF_ENDPOINT = '/cas/api/auth/csrf';
export const SIGN_OUT_PAGE = '/sign-out';
export const MIN_CHARACTER_TO_SEARCH = 2;
export const DEBOUNCE_TIME = 500;
export const FIFTYONE_APP_DEMO_MODE = 'FIFTYONE_APP_DEMO_MODE';
export const FIFTYONE_APP_ENABLE_WORKFLOWS_ENV_KEY =
  'FIFTYONE_APP_ENABLE_WORKFLOWS';
export const FIFTYONE_DO_NOT_TRACK_LS = 'fiftyone-do-not-track';
export const SIGN_IN_PAGE_ENDPOINT = '/cas/auth/signin';

export const userAttributeActions = {
  ACT_ON_BEHALF_OF_USER: 'ACT_ON_BEHALF_OF_USER',
  CREATE_DATASETS: 'CREATE_DATASETS',
  EDIT_USERS: 'EDIT_USERS',
  VIEW_USERS: 'VIEW_USERS', 
  EXPORT_DATASETS: 'EXPORT_DATASETS',
  EXECUTE_BUILTIN_PLUGINS: 'EXECUTE_BUILTIN_PLUGINS',
  EXECUTE_CUSTOM_PLUGINS: 'EXECUTE_CUSTOM_PLUGINS',
  DATASETS_ACCESS_LEVEL: 'DATASETS_ACCESS_LEVEL',
  USE_API_KEYS: 'USE_API_KEYS',
  MAX_DATASET_PERMISSION: 'MAX_DATASET_PERMISSION',
  MANAGE_INVITATIONS: 'MANAGE_INVITATIONS',
  MANAGE_THE_ORGANIZATION: 'MANAGE_ORGANIZATION'
};

export const MANUAL_GROUP_MGMT_DISABLED_TEXT =
  'manual user group management is disabled';

export const CLONE_OPTIONS = {
  WITH_FILTER: {
    id: 'view',
    label: 'Current filters'
  },
  DATASET_WITHOUT_RUN: {
    id: 'view-no-filter',
    label: 'Entire dataset (excluding views, workspaces, and runs)'
  },
  DATASET_WITH_RUN: {
    id: 'dataset',
    label: 'Entire dataset'
  }
};

export const EXPORT_OPTIONS = {
  WITH_FILTER: {
    id: 'view',
    label: 'Current filters'
  },
  DATASET_WITHOUT_RUN: {
    id: 'dataset',
    label: 'Entire dataset'
  }
};

export const SALES_CONTACT = 'mailto:sales@voxel51.com';
