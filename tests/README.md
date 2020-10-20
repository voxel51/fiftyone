# FiftyOne Tests

FiftyOne currently uses both
[unittest](https://docs.python.org/3/library/unittest.html) and
[pytest](https://docs.pytest.org/en/stable) to implement its tests.

## Contents

| File                 | Description                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `unittests/*.py`     | Unit tests checking expected behavior of FiftyOne                                           |
| `benchmarking/*.py`  | Tests related to benchmarking the performance of FiftyOne                                   |
| `import_export/*.py` | Tests for importing/exporting datasets                                                      |
| `isolated/*.py`      | Tests that must be run in a separate `pytest` process to avoid interfering with other tests |
| `misc/*.py`          | Miscellaneous tests that have not been upgraded to official unit tests                      |

## Running tests

To run all unit tests, execute:

```shell
pytest unittests/
```

To run a specific test, execute:

```shell
pytest unittests/<file>.py
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
