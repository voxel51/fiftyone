import multiprocessing
import os
import random
import shutil
import tempfile
import time
from typing import Any, Dict, Optional, Union, Type

import pytest

import fiftyone.core.utils as focu


INPUT_PATHS = [
    "alpha",
    "alpha.jpg",
    "alpha.jpg",
    "alpha.png",
    "bravo.png",
    "bravo.png",
    "bravo.png",
    "charlie.jpg",
    "charlie.png",
    "delta.png",
    "echo",
    "echo.jpg",
    "echo.png",
    "foxtrot.png",
    "foxtrot.png",
    "foxtrot.png",
    "golf.jpg",
    "golf.png",
    "hotel.png",
    "india.jpg",
    "india.png",
    "juliet",
    "juliet.png",
]


@pytest.fixture(autouse=True, scope="session")
def cleanup():
    """cleanup after all tests complete"""
    pid = os.getpid()

    yield

    # registered `atexit` cleanup function is not working with pytest, however
    # it does work when manually running
    # cleaning up touched files after the session finishes
    try:
        shutil.rmtree(f"/tmp/fo-unq/{pid}")
    except Exception:
        ...


@pytest.mark.parametrize(
    "existing_filepaths",
    (
        pytest.param(set(), id="empty-directory"),
        pytest.param(set([INPUT_PATHS[0]]), id="one-file-exists"),
        pytest.param(
            {i for i in INPUT_PATHS if "alpha" in i},
            id="some-files-exist",
        ),
        pytest.param(set(INPUT_PATHS), id="all-files-exist"),
    ),
)
@pytest.mark.parametrize(
    "unique_filename_maker_kwargs",
    (
        pytest.param({}, id="{idempotent=True}"),
        pytest.param({"idempotent": False}, id="{idempotent=False}"),
        pytest.param(
            {"ignore_existing": True, "idempotent": False},
            id="{ignore_existing=True, idempotent=False}",
        ),
        pytest.param(
            {"ignore_existing": True},
            id="{ignore_existing=True, idempotent=True}",
        ),
        pytest.param(
            {"ignore_exts": True, "idempotent": False},
            id="{ignore_exts=True, idempotent=False}",
        ),
        pytest.param(
            {"ignore_exts": True, "idempotent": True},
            id="{ignore_exts=True, idempotent=True}",
        ),
    ),
)
@pytest.mark.parametrize(
    "unique_filename_maker_cls",
    (
        # The following is the original UniqueFilenameMaker just renamed
        # Uncomment to see that it does not work when run with multiprocessing
        # ====================================================================
        # pytest.param(focu.InMemoryUniqueFilenameMaker),
        # ====================================================================
        pytest.param(focu.MultiProcessUniqueFilenameMaker),
    ),
)
def test_existing_input_paths(
    unique_filename_maker_cls,
    unique_filename_maker_kwargs,
    existing_filepaths,
):
    """test baseline vs parallel with existing input paths"""

    with tempfile.TemporaryDirectory() as tmp_dir:
        for existing_filepath in existing_filepaths:
            with open(
                os.path.join(tmp_dir, existing_filepath),
                "w",
                encoding="utf-8",
            ):
                ...

        # The following is the original UniqueFilenameMaker just renamed
        filename_maker = focu.InMemoryUniqueFilenameMaker(
            tmp_dir, **unique_filename_maker_kwargs
        )

        # This is the original behavior of `get_output_path``, used as the
        # baseline.
        expected = [
            filename_maker.get_output_path(input_path)
            for input_path in INPUT_PATHS
        ]

        # Run multiple workers with their own instance UniqueFilenameMaker and
        # aggregate the calls to `get_output_path`.
        with multiprocessing.Pool(
            processes=4,
            initializer=initialize_worker,
            initargs=(
                unique_filename_maker_cls,
                tmp_dir,
                unique_filename_maker_kwargs,
            ),
        ) as pool:
            actual = list(pool.imap_unordered(worker, INPUT_PATHS))

        # Normalize results
        ignore_exts = unique_filename_maker_kwargs.get("ignore_exts") is True
        for output_paths in (expected, actual):
            for idx, output_path in enumerate(output_paths):
                # The numbering should be the same but the extension might be
                #  different as the order called isn't ensured.
                if ignore_exts:
                    output_path, _ = os.path.splitext(output_path)

                output_paths[idx] = output_path

        assert sorted(expected) == sorted(actual)


@pytest.mark.parametrize(
    "default_ext",
    (
        pytest.param(None, id="default_ext=None"),
        *[
            pytest.param(ext, id=f"default_ext='{ext}'")
            for ext in (".jpg", ".jpeg", ".png")
        ],
    ),
)
def test_non_existent_input_paths(default_ext):
    """test with input path set to None"""

    with (
        tempfile.TemporaryDirectory() as tmp_dir_1,
        tempfile.TemporaryDirectory() as tmp_dir_2,
    ):
        input_paths = [None for _ in range(100)]

        # This is the original class just renamed
        filename_maker = focu.InMemoryUniqueFilenameMaker(
            tmp_dir_1, default_ext=default_ext
        )

        expected = [
            filename_maker.get_output_path(input_path)
            for input_path in input_paths
        ]

        with multiprocessing.Pool(
            processes=4,
            initializer=initialize_worker,
            initargs=(
                focu.MultiProcessUniqueFilenameMaker,
                tmp_dir_2,
                {"default_ext": default_ext},
            ),
        ) as pool:
            actual = list(pool.imap_unordered(worker, input_paths))

        assert len(expected) == len(actual)

        if default_ext:
            for output_paths in (expected, actual):
                for output_path in output_paths:
                    _, ext = os.path.splitext(output_path)
                    assert default_ext == ext


@pytest.mark.parametrize(
    ("kwargs", "expected_cls"),
    (
        pytest.param(
            {"chunk_size": 100},
            focu.InMemoryUniqueFilenameMaker,
            id="chunk_size-is-set",
        ),
        pytest.param(
            {}, focu.MultiProcessUniqueFilenameMaker, id="chunk_size-unset"
        ),
    ),
)
def test_implementation_switch(kwargs, expected_cls):
    """select unique filename maker implementation"""
    filename_maker = focu.UniqueFilenameMaker(**kwargs)
    assert isinstance(filename_maker, expected_cls)


def initialize_worker(
    cls: Type[
        Union[
            focu.InMemoryUniqueFilenameMaker,
            focu.MultiProcessUniqueFilenameMaker,
        ]
    ],
    output_dir: str,
    unique_filename_maker_kwargs: Optional[Dict[str, Any]] = None,
) -> None:
    """initialize multiprocessing worker"""

    # pylint:disable-next=global-variable-undefined
    global worker_filename_maker

    worker_filename_maker = cls(
        output_dir, **(unique_filename_maker_kwargs or {})
    )


def worker(input_path: str) -> str:
    """multiprocessing worker"""

    # random sleep to allow for multiprocessing to get names out of order
    time.sleep(random.randint(0, 10) / 100)

    return worker_filename_maker.get_output_path(input_path)
