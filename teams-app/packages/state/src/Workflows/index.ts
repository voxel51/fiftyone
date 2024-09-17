import { atom } from 'recoil';

export const teamsGettingStartedAtom = atom({
  key: 'teamsGettingStarted',
  default: false,
  effects: [
    ({ setSelf, onSet }) => {
      const key = 'teamsGettingStartedShown';
      const savedValue = sessionStorage.getItem(key);
      if (savedValue !== 'true') {
        setSelf(true);
      }
      onSet(() => {
        sessionStorage.setItem(key, 'true');
      });
    }
  ]
});
