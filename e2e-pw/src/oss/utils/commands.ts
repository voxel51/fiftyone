export const getPythonCommand = (argv: string[]) => {
  const cmd = `python ${argv.join(" ")}`;

  if (process.env.CI) {
    return cmd;
  }

  if (process.env.IS_UTILITY_DOCKER) {
    return `. /e2e/venv/bin/activate && export PYTHONPATH=/e2e/fiftyone && ${cmd}`;
  }

  return `source ${process.env.VENV_PATH}/bin/activate && export PYTHONPATH=${process.env.FIFTYONE_ROOT_DIR} && ${cmd}`;
};

export const getStringifiedKwargs = (
  kwargs: Record<string, string | number | boolean>
) => {
  const kwargsStringified =
    Object.values(kwargs).length > 0
      ? ", " +
        Object.entries(kwargs)
          .map(([key, value]) => {
            if (typeof value === "string") {
              return `${key}="${value}"`;
            }

            if (typeof value === "boolean") {
              return `${key}=${value ? "True" : "False"}`;
            }

            return `${key}=${value}`;
          })
          .join(", ")
      : "";

  return kwargsStringified;
};
