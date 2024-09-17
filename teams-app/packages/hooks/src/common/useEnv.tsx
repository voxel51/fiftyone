import { appEnvs } from '@fiftyone/teams-state';
import { useRecoilValue } from 'recoil';

export default function useEnv(env?: string) {
  const envs = useRecoilValue(appEnvs);

  return env ? envs?.[env] : envs;
}

export function useBooleanEnv(env: string, defaultTrue?: boolean) {
  const value = useEnv(env) as string;
  if (!value && defaultTrue) return true;
  return typeof value === 'string' && value.toLowerCase() === 'true';
}
