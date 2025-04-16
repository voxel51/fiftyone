import multiprocessing
import os
import random
import shutil
import tempfile
from typing import Any, Dict, Optional

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


@pytest.mark.parametrize(
    "is_main_process",
    (
        pytest.param(True, id="main-process"),
        pytest.param(False, id="sub-process"),
    ),
)
def test_implementation_switch(is_main_process):
    """select unique filename maker implementation"""
    with tempfile.TemporaryDirectory() as tmp_dir:

        if is_main_process:
            filename_maker = focu.UniqueFilenameMaker(tmp_dir)

            assert isinstance(
                filename_maker, focu.UniqueFilenameMaker
            ) and not isinstance(
                filename_maker, focu.MultiProcessUniqueFilenameMaker
            )

        else:
            with multiprocessing.Pool(
                processes=(processes := 4),
                initializer=init_process,
                initargs=(tmp_dir, {}),
            ) as pool:
                for _ in range(processes):
                    assert pool.apply(process_instance_check)


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
def test_existing_input_paths(
    unique_filename_maker_kwargs, existing_filepaths
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

        filename_maker = focu.UniqueFilenameMaker(
            tmp_dir, **unique_filename_maker_kwargs
        )

        assert isinstance(
            filename_maker, focu.UniqueFilenameMaker
        ) and not isinstance(
            filename_maker, focu.MultiProcessUniqueFilenameMaker
        )

        # This is the original behavior of `get_output_path``, used as the
        # baseline.

        random.shuffle(expected_input_paths := INPUT_PATHS[:])

        expected = list(
            map(filename_maker.get_output_path, expected_input_paths)
        )

        # Run multiple workers with their own instance UniqueFilenameMaker and
        # aggregate the calls to `get_output_path`.
        with multiprocessing.Pool(
            processes=4,
            initializer=init_process,
            initargs=(
                tmp_dir,
                unique_filename_maker_kwargs,
            ),
        ) as pool:
            random.shuffle(actual_input_paths := INPUT_PATHS[:])

            actual = list(
                pool.imap_unordered(
                    process_get_output_path, actual_input_paths
                )
            )

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

        filename_maker = focu.UniqueFilenameMaker(
            tmp_dir_1, default_ext=default_ext
        )

        assert isinstance(filename_maker, focu.UniqueFilenameMaker)

        expected = [
            filename_maker.get_output_path(input_path)
            for input_path in input_paths
        ]

        with multiprocessing.Pool(
            processes=4,
            initializer=init_process,
            initargs=(tmp_dir_2, {"default_ext": default_ext}),
        ) as pool:
            actual = list(
                pool.imap_unordered(process_get_output_path, input_paths)
            )

        assert len(expected) == len(actual)

        if default_ext:
            for output_paths in (expected, actual):
                for output_path in output_paths:
                    _, ext = os.path.splitext(output_path)
                    assert default_ext == ext


def init_process(
    output_dir: str,
    unique_filename_maker_kwargs: Optional[Dict[str, Any]] = None,
) -> None:
    """initialize multiprocessing worker"""

    # pylint:disable-next=global-variable-undefined
    global process_filename_maker

    process_filename_maker = focu.UniqueFilenameMaker(
        output_dir, **(unique_filename_maker_kwargs or {})
    )


def process_instance_check() -> bool:
    """process instance check"""
    return isinstance(
        process_filename_maker, focu.MultiProcessUniqueFilenameMaker
    ) and not isinstance(process_filename_maker, focu.UniqueFilenameMaker)


def process_get_output_path(input_path: str) -> str:
    """process get output path"""

    assert isinstance(
        process_filename_maker, focu.MultiProcessUniqueFilenameMaker
    )

    return process_filename_maker.get_output_path(input_path)
