"""
FiftyOne Teams config

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import fiftyone.core.config as foc

import fiftyone.teams.constants as fotc


class EnvConfig(foc.EnvConfig):
    def __repr__(self):
        return self.__str__()


class FiftyOneTeamsConfig(EnvConfig):
    """FiftyOne Teams configuration settings."""

    def __init__(self, d=None):
        if d is None:
            d = {}

        self.audience = self.parse_string(
            d,
            "audience",
            default="https://voxelapi.dev.fiftyone.ai",
            env_var="FIFTYONE_TEAMS_AUDIENCE",
        )
        self.client_id = self.parse_string(
            d,
            "client_id",
            default="bHQ8tHZw6f8qOMYU2KU5oj4SCGm5y78E",
            env_var="FIFTYONE_TEAMS_CLIENT_ID",
        )
        self.domain = self.parse_string(
            d,
            "domain",
            default="dev-fiftyone.us.auth0.com",
            env_var="FIFTYONE_TEAMS_DOMAIN",
        )
        self.organization = self.parse_string(
            d,
            "organization",
            default="org_6nvHI0NrwCmc2fXp",
            env_var="FIFTYONE_TEAMS_ORGANIZATION",
        )


def load_config():
    """Loads the FiftyOne Teams config

    Returns:
        a :class:`FiftyOneConfig` instance
    """
    config_path = locate_config()
    if os.path.isfile(config_path):
        return FiftyOneTeamsConfig.from_json(config_path)

    return FiftyOneTeamsConfig()


def locate_config():
    """Returns the path to the :class:`FiftyOneTeamsConfig` on disk.

    The default location is ``~/.fiftyone/teams_config.json``, but you can override
    this path by setting the ``FIFTYONE_TEAMS_CONFIG_PATH`` environment variable.

    Note that a config file may not actually exist on disk in the default
    location, in which case the default config settings will be used.

    Returns:
        the path to the :class:`FiftyOneTeamsConfig` on disk

    Raises:
        OSError: if the config path has been customized but the file does not
            exist on disk
    """
    if "FIFTYONE_TEAMS_CONFIG_PATH" not in os.environ:
        return fotc.FIFTYONE_TEAMS_CONFIG_PATH

    config_path = os.environ["FIFTYONE_TEAMS_CONFIG_PATH"]
    if not os.path.isfile(config_path):
        raise OSError("Config file '%s' not found" % config_path)

    return config_path
