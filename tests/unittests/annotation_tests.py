"""
FiftyOne annotation-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from functools import wraps
import unittest

import fiftyone as fo
import fiftyone.utils.cvat as fouc
import fiftyone.zoo as foz

from decorators import drop_datasets


def update_annot_backends(backend_name, backend_dict):
    def update_backends(func):
        """Decorator that updates annotation backends."""

        @wraps(func)
        def wrapper(*args, **kwargs):
            fo.annotation_config.backends[backend_name] = backend_dict
            results = func(*args, **kwargs)
            fo.annotation_config.backends.pop(backend_name, None)
            return results

        return wrapper

    return update_backends


class CVATTestBackendConfig(fouc.CVATBackendConfig):
    pass


_CVAT_TEST_BACKEND = {
    "config_cls": CVATTestBackendConfig,
    "username": "USERNAME",
    "password": "PASSWORD",
    "url": "http://test",
}


class CVATTestBackend(fouc.CVATBackend):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._api = None

    def connect_to_api(self):
        if self._api is None:
            self._api = CVATTestAnnotationAPI(
                self.config.name,
                self.config.url,
                username=self.config.username,
                password=self.config.password,
                headers=self.config.headers,
            )

        return self._api


class Resp(object):
    def __init__(self, resp={}):
        self.resp = resp

    def json(self):
        return self.resp


class CVATTestAnnotationAPI(fouc.CVATAnnotationAPI):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._mock_requests = defaultdict(Resp)
        self._next_id = 0

    @property
    def next_id(self):
        _next_id = self._next_id
        self._next_id += 1
        return _next_id

    def _setup(self):
        if not self._url:
            raise ValueError(
                "You must provide/configure the `url` of the CVAT server"
            )

        username = self._username
        password = self._password

        if username is None or password is None:
            username, password = self._prompt_username_password(
                self._name, username=username, password=password
            )

            self._username = username
            self._password = password

        # Skip authentication

    def get(self, url, **kwargs):
        return self._mock_requests[url]

    def post(self, url, **kwargs):
        resp = Resp()
        if url == self.tasks_url:
            resp_dict = kwargs["json"]
            task_id = self.next_id
            resp_dict["id"] = task_id
            for label in resp_dict["labels"]:
                label["id"] = self.next_id
                for attr in label["attributes"]:
                    attr["id"] = self.next_id
            resp = Resp(resp_dict)
            self._mock_requests[self.task_url(task_id)] = resp
            job_list = [{"id": self.next_id}]
            job_resp = Resp(job_list)
            self._mock_requests[self.jobs_url(task_id)] = job_resp

        return resp

    def put(self, url, **kwargs):
        resp = Resp()
        if "annotation" in url:
            resp_dict = kwargs["json"]
            for anno_type in ["shapes", "tags", "tracks"]:
                for anno in resp_dict[anno_type]:
                    anno["id"] = self.next_id
            resp = Resp(resp_dict)
            self._mock_requests[url] = resp

        return resp


class CVATTests(unittest.TestCase):
    @drop_datasets
    @update_annot_backends("cvat_unit_test", _CVAT_TEST_BACKEND)
    def test_upload(self):
        dataset = foz.load_zoo_dataset("quickstart", max_samples=1).clone()

        results = dataset.annotate(
            "anno_key_1", backend="cvat_unit_test", label_field="ground_truth",
        )
        api = results.connect_to_api()
        self._run_assertions(dataset, results, api)

    @classmethod
    def _run_assertions(cls, dataset, results, api):
        sample_id = list(list(results.frame_id_map.values())[0].values())[0][
            "sample_id"
        ]
        assert sample_id == dataset.first().id

        assert api._username == "USERNAME"
        assert api._password == "PASSWORD"


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
