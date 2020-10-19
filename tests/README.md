# FiftyOne Tests

FiftyOne currently uses both
[unittest](https://docs.python.org/3/library/unittest.html) and
[pytest](https://docs.pytest.org/en/stable) to implement its tests.

Tests do exist, but their coverage generally needs improvement...

## Contents

| File                 | Description                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `unittests/*.py`     | Unit tests checking expected behavior of FiftyOne                                           |
| `benchmarking/*.py`  | Tests related to benchmarking the performance of FiftyOne                                   |
| `import_export/*.py` | Tests for importing/exporting datasets                                                      |
| `isolated/*.py`      | Tests that must be run in a separate `pytest` process to avoid interfering with other tests |

## Running a test

To run all unit tests, run:

```shell
bash unittests/run_all.bash
```

To run a specific test, do:

```shell
python unittests/<file>.py
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
