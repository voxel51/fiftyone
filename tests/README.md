# FiftyOne Tests

FiftyOne currently uses both
[unittest](https://docs.python.org/3/library/unittest.html) and
[pytest](https://docs.pytest.org/en/stable) to implement its tests.

Tests do exist, but their coverage generally needs improvement...

## Contents

| File                     | Description                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `db_conn_test.py`        | Tests connection to the MongoDB database                                                    |
| `import_export_tests.py` | Tests for importing/exporting datasets in supported formats                                 |
| `unittests.py`           | Unit tests checking expected behavior of `fiftyone`                                         |
| `zoo_tests.py`           | Basic tests of Dataset Zoo functionality                                                    |
| `benchmarking/*.py`      | Tests related to benchmarking the performance of FiftyOne                                   |
| `isolated/*.py`          | Tests that must be run in a separate `pytest` process to avoid interfering with other tests |

## Running a test

To run a test, simply run `python <name-of-file>.py`

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
