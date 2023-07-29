"""
FiftyOne plugin secret resolver tests

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest import mock
from fiftyone.internal.secrets.secret import EnvSecret
from fiftyone.plugins.secrets import PluginSecretsResolver

SECRET_KEY = "MY_SECRET_KEY"
SECRET_VALUE = "MY_SECRET_VALUE"


class TestPluginSecretsResolver:
    def test_value_exists(self):
        with mock.patch.dict(
            os.environ, {SECRET_KEY: SECRET_VALUE}, clear=True
        ):
            assert os.getenv(SECRET_KEY) == SECRET_VALUE

            secret_resolver = PluginSecretsResolver()
            secret = secret_resolver.get_secret(SECRET_KEY)

            assert type(secret) == EnvSecret
            assert secret.key == SECRET_KEY
            assert secret.value == SECRET_VALUE

    def test_value_missing(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            assert os.getenv(SECRET_KEY) is None

            secret_resolver = PluginSecretsResolver()
            secret = secret_resolver.get_secret(SECRET_KEY)

            assert secret.key == SECRET_KEY
            assert secret.value is None
