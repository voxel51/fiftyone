import os
from unittest import mock

from fiftyone.internal.constants import API_URL_ENV_VAR
from fiftyone.internal.util import get_api_url


class TestApiUrl:
    def test_it(self, mocker):
        mocker.patch.dict(os.environ, {API_URL_ENV_VAR: "my.api.url"})
        assert get_api_url() == os.getenv(API_URL_ENV_VAR)

    def test_default_with_unset_envar(self, mocker):
        mocker.patch.dict(os.environ, {}, clear=True)
        assert API_URL_ENV_VAR not in os.environ

        default_url = get_api_url()
        assert default_url == "http://localhost:8000"

    def test_default_with_falsy_envar(self, mocker):
        mocker.patch.dict(os.environ, {API_URL_ENV_VAR: ""})
        assert API_URL_ENV_VAR in os.environ
        assert not os.getenv(API_URL_ENV_VAR)

        default_url = get_api_url()
        assert default_url == "http://localhost:8000"
