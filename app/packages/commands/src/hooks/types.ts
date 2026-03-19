import { CommandDescriptor } from "./useCommand";

export type CommandHookReturn = {
  callback: () => void | Promise<void | boolean>;
  descriptor: CommandDescriptor;
  enabled: boolean;
};
