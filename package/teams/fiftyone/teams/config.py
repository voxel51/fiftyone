"""
FiftyOne Teams config

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import fiftyone.core.config as foc

from fiftyone.teams.constants import FIFTYONE_TEAMS_CONFIG_PATH


class EnvConfig(foc.EnvConfig):
    def __repr__(self):
        return self.__str__()


class FiftyOneTeamsConfig(EnvConfig):
    """FiftyOne Teams configuration settings."""

    def __init__(self, d=None):
        if d is None:
            d = {}

        self.auth_secret = self.parse_string(
            d,
            "auth_secret",
            default=None,
            env_var="FIFTYONE_AUTH_SECRET",
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

    """
    if "FIFTYONE_TEAMS_CONFIG_PATH" not in os.environ:
        return FIFTYONE_TEAMS_CONFIG_PATH

    return os.environ["FIFTYONE_TEAMS_CONFIG_PATH"]