import os
import sys
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import pytest

# The engine imports without fiftyone; its tests import it directly rather
# than through the plugin package, whose __init__ pulls the operator shell.
PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PLUGIN_DIR)

# The shells do need the package, for their relative imports. Anything that
# touches the shells must reach the engine through ``cloud.engine`` too —
# two copies of the module would mean two copies of the error classes, and
# ``except RefusedError`` would quietly stop matching.
sys.path.insert(0, os.path.dirname(PLUGIN_DIR))


@dataclass
class RecordedCall:
    method: str
    url: str
    headers: Optional[Dict[str, str]]
    json: Optional[Dict[str, Any]]
    data: Any
    params: Optional[Dict[str, str]]


class FakeResponse:
    def __init__(self, status: int, payload: Optional[dict] = None):
        self.status_code = status
        self.__payload = payload
        self.text = "" if payload is None else str(payload)

    def json(self):
        if self.__payload is None:
            raise ValueError("no body")
        return self.__payload


@dataclass
class FakeSession:
    """A `requests.Session` stand-in: answers from a handler or a queue and
    records every call."""

    handler: Optional[Callable[[RecordedCall], FakeResponse]] = None
    replies: List[FakeResponse] = field(default_factory=list)
    calls: List[RecordedCall] = field(default_factory=list)

    def request(
        self,
        method,
        url,
        headers=None,
        json=None,
        data=None,
        params=None,
        timeout=None,
    ):
        call = RecordedCall(
            method=method,
            url=url,
            headers=headers,
            json=json,
            data=data,
            params=params,
        )
        self.calls.append(call)
        if self.handler is not None:
            return self.handler(call)
        return self.replies.pop(0)


@pytest.fixture(name="no_sleep")
def fixture_no_sleep():
    slept = []
    return slept, slept.append


# --- App-side fakes -------------------------------------------------------
#
# The panel and the operators are duck-typed against a handful of fiftyone
# surfaces. Faking them keeps their tests as fast and as import-free as the
# engine's, and lets a test assert on exactly which snapshots were emitted.


@dataclass
class FakeStore:
    """An ``ExecutionStore`` stand-in: dict-backed, recording the ``ttl``
    each ``set`` was given so the terminal-TTL rule is assertable."""

    values: Dict[str, Any] = field(default_factory=dict)
    ttls: Dict[str, Optional[int]] = field(default_factory=dict)
    writes: List[Any] = field(default_factory=list)
    fault: Optional[BaseException] = None

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, ttl=None):
        if self.fault is not None:
            raise self.fault
        self.values[key] = value
        self.ttls[key] = ttl
        self.writes.append(value)

    def delete(self, key):
        self.ttls.pop(key, None)
        return self.values.pop(key, None) is not None


@dataclass(frozen=True)
class FakeRequest:
    """What ``ctx.ops.*`` hands back to a generator: an opaque invocation
    request the executor would forward to the App."""

    name: str
    params: Dict[str, Any]


class FakeOps:
    def __init__(self):
        self.calls: List[FakeRequest] = []

    def patch_panel_data(self, data, panel_id=None):
        return self.__record(
            "patch_panel_data", {"data": data, "panel_id": panel_id}
        )

    def open_panel(self, name):
        return self.__record("open_panel", {"name": name})

    def show_panel_output(self, output):
        return self.__record("show_panel_output", {"output": output})

    def __record(self, name, params):
        request = FakeRequest(name=name, params=params)
        self.calls.append(request)
        return request


class FakePanel:
    """``ctx.panel``. Data is write-only in the real thing, so this only
    records."""

    def __init__(self):
        self.data: Dict[str, Any] = {}
        self.writes: List[tuple] = []

    def set_data(self, key, value=None):
        self.data[key] = value
        self.writes.append((key, value))


@dataclass
class FakeSample:
    """The two attributes ``build_push_plan`` uses."""

    filepath: str
    doc: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self, include_private=False):
        return dict(self.doc, filepath=self.filepath)


@dataclass
class FakeDataset:
    """The two things the shells ask a dataset for."""

    name: str = "local-dataset"
    samples: List[FakeSample] = field(default_factory=list)

    def __len__(self):
        return len(self.samples)

    def __iter__(self):
        return iter(self.samples)


@dataclass
class FakeCtx:
    """An ``ExecutionContext`` stand-in for panel methods and operators."""

    params: Dict[str, Any] = field(default_factory=dict)
    store_: FakeStore = field(default_factory=FakeStore)
    dataset: Any = field(default_factory=FakeDataset)
    view: Any = None
    panel_id: str = "panel-1"
    has_custom_view: bool = False
    panel: FakePanel = field(default_factory=FakePanel)
    ops: FakeOps = field(default_factory=FakeOps)

    def store(self, name):
        return self.store_

    def panel_data(self, key):
        """The last value written under a panel-data key."""
        return self.panel.data.get(key)


@pytest.fixture(name="profile_dir")
def fixture_profile_dir(tmp_path, monkeypatch):
    """Points ``FIFTYONE_CLOUD_CONFIG`` at a temp file and clears the two
    URL env vars, so profile tests never touch the real ``~/.fiftyone``."""
    path = tmp_path / "cloud.json"
    monkeypatch.setenv("FIFTYONE_CLOUD_CONFIG", str(path))
    monkeypatch.delenv("FIFTYONE_CLOUD_API_URL", raising=False)
    monkeypatch.delenv("FIFTYONE_CLOUD_AUTH_URL", raising=False)
    yield path
