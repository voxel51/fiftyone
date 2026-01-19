import { CommandDescriptor } from "./useCommand";

export type CommandHookReturn = {
  callback: () => void;
  descriptor: CommandDescriptor;
};
