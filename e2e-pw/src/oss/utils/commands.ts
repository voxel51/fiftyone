export const getPythonCommand = (argv: string[]) => {
  const cmd = `python ${argv.join(" ")}`;

  if (process.env.CI) {
    return cmd;
  }

  if (!process.env.VENV_PATH) {
    throw new Error(
      "VENV_PATH is not defined. Your .env.dev file is probably missing or misconfigured"
    );
  }

  return `source ${process.env.VENV_PATH}/bin/activate && export PYTHONPATH=${process.env.PYTHONPATH} && ${cmd}`;
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
