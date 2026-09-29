"""
The label-schema storage must not depend on the workflows plugin.

The core module, the operators plugin and the App server's enforcement
module all import in a fresh interpreter where any import of
``plugins.workflows`` raises. Guards the boundary the later OSS move
relies on: workflows reference schema docs by id, never the reverse.
"""

import os
import subprocess
import sys

import pytest

ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)

_PROBE = """
import sys


class _Blocker:
    def find_spec(self, name, path=None, target=None):
        if name == "plugins.workflows" or name.startswith("plugins.workflows."):
            raise ImportError("boundary violation: %s imported" % name)
        return None


sys.meta_path.insert(0, _Blocker())

import importlib
import importlib.util

import fiftyone.core.label_schema_docs  # noqa: E402
import plugins.label_schemas  # noqa: E402
import plugins.label_schemas.operators  # noqa: E402

# The App server's enforcement module is Teams-only; it must also stay
# on the right side of the boundary where it exists.
if importlib.util.find_spec("fiftyone.server.field_visibility"):
    importlib.import_module("fiftyone.server.field_visibility")

leaked = [
    m
    for m in sys.modules
    if m == "plugins.workflows" or m.startswith("plugins.workflows.")
]
assert not leaked, leaked
"""


@pytest.mark.timeout(300)
def test_core_imports_without_workflows_plugin():
    env = dict(os.environ)
    env["PYTHONPATH"] = ROOT
    env.setdefault("FIFTYONE_DO_NOT_TRACK", "true")
    proc = subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=280,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr[-4000:]
