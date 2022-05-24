# FiftyOne Tests

FiftyOne currently uses both
[unittest](https://docs.python.org/3/library/unittest.html) and
[pytest](https://docs.pytest.org/en/stable) to implement its tests.

## Contents

| File                | Description                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `unittests/*.py`    | Unit tests checking expected behavior of FiftyOne                                           |
| `benchmarking/*.py` | Tests related to benchmarking the performance of FiftyOne                                   |
| `intensive/*.py`    | Computationally intensive tests                                                             |
| `isolated/*.py`     | Tests that must be run in a separate `pytest` process to avoid interfering with other tests |
| `misc/*.py`         | Miscellaneous tests that have not been upgraded to official unit tests                      |

## Running tests

To run all unit tests, execute:

```shell
pytest unittests/
```

To run a specific test, execute:

```shell
pytest unittests/<file>.py
```

To run a specific test case, execute:

```shell
pytest unittests/<file>.py -s -k <test_function_name>
```

The `-s` flag is optional and prints all stdout from the test case.
