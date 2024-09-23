const appEnvsPrefix = 'FIFTYONE_APP_';
const appEnvsNames = [
  'FIFTYONE_ENABLE_ORCHESTRATOR_REGISTRATION',
  'FIFTYONE_SNAPSHOTS_ARCHIVE_PATH',
  'FIFTYONE_API_URI',
  'API_URL',
  'FEATURE_FLAG_ENABLE_INVITATIONS',
  'FEATURE_FLAG_ENABLE_MANUAL_USER_GROUP_MANAGEMENT',
  'APP_SERVICE_WORKER_TOKEN_HEADER_KEY'
];

export function getEnv() {
  const appEnvs = {};
  for (const env in process.env) {
    if (env.startsWith(appEnvsPrefix) || appEnvsNames.includes(env)) {
      const transformer = transformers[env];
      const rawValue = process.env[env];
      appEnvs[env] = transformer ? transformer(rawValue) : rawValue;
    }
  }

  return { envs: appEnvs };
}

export function getServerSideProps() {
  return { props: getEnv() };
}

const transformers = {
  // to prevent leaking the path to client-side
  FIFTYONE_SNAPSHOTS_ARCHIVE_PATH: (value: string) => {
    return typeof value === 'string' && value.trim().length > 0;
  }
};
