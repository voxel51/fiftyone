"""
Shared pytest configuration.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import sys
import uuid

# Isolates each run in its own database. Must run before ``fiftyone`` is
# imported, since ``fo.config`` reads the environment at import time. A name
# already carrying the test prefix is reused, so nested pytest processes share
# the parent's database.
_TEST_DATABASE_PREFIX = "fiftyone-test-"

if os.environ.get("FIFTYONE_DATABASE_NAME", "").startswith(
    _TEST_DATABASE_PREFIX
):
    _owned_test_database_name = None
else:
    _owned_test_database_name = _TEST_DATABASE_PREFIX + uuid.uuid4().hex[:12]
    os.environ["FIFTYONE_DATABASE_NAME"] = _owned_test_database_name

if "fiftyone.core.config" in sys.modules:
    import fiftyone as fo
    import fiftyone.core.odm.database as fod

    if fod._client is not None:
        raise RuntimeError(
            "fiftyone connected to database '%s' before tests/conftest.py "
            "could isolate the test database" % fo.config.database_name
        )

    fo.config.database_name = os.environ["FIFTYONE_DATABASE_NAME"]


_session_finish_message = None


def pytest_sessionstart(session):
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    if reporter is not None:
        reporter.write_line(
            "test database: %s" % os.environ["FIFTYONE_DATABASE_NAME"]
        )


def pytest_sessionfinish(session, exitstatus):
    """Drops the test database created for this run, if one was created."""
    global _session_finish_message

    if _owned_test_database_name is None:
        return

    fod = sys.modules.get("fiftyone.core.odm.database")
    if fod is None or not fod._connection_kwargs:
        return

    import fiftyone as fo

    if fo.config.database_name == _owned_test_database_name:
        fod.drop_database()
        _session_finish_message = (
            "dropped test database: %s" % _owned_test_database_name
        )
    else:
        _session_finish_message = (
            "did not drop test database %s: fo.config.database_name was "
            "changed to %s during the run"
            % (_owned_test_database_name, fo.config.database_name)
        )


def pytest_terminal_summary(terminalreporter):
    if _session_finish_message is not None:
        terminalreporter.write_line(_session_finish_message)


# freezegun swaps the real datetime classes out for fakes, so entering and
# leaving a ``freeze_time`` block walks every module in ``sys.modules`` and
# getattrs its attributes looking for references to swap. Packages that expose
# their subpackages lazily import them for real under that getattr, so the
# walk itself pulls in thousands of modules and compiles their bytecode --
# enough to blow a test's timeout. These hold no datetime reference that a
# test freezes time around, so skipping them costs nothing.
#
# Guarded because this is the root conftest: an unguarded import would fail
# collection for every test under ``tests/`` where freezegun is absent.
try:
    import freezegun
except ImportError:
    pass
else:
    freezegun.configure(
        extend_ignore_list=[
            "ipywidgets",
            "lazy_loader",
            "nbformat",
            "networkx",
            "plotly",
            "scipy",
            "skimage",
            "sympy",
            "torch",
            "transformers",
        ]
    )
