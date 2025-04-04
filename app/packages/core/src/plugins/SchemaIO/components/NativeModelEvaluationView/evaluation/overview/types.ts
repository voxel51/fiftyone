export type PLOT_CONFIG_TYPE = {
  sortBy?: string;
  limit?: number;
  log?: boolean;
};

export type PLOT_CONFIG_DIALOG_TYPE = PLOT_CONFIG_TYPE & {
  open?: boolean;
};
