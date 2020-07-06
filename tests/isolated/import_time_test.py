"""
Test that fiftyone can be imported in a reasonable amount of time.
"""

import time

# TODO: decrease these once the DB service is started on-demand?
IMPORT_WARN_THRESHOLD = 1.5
IMPORT_ERROR_THRESHOLD = 5


def test_import_time(capsys):
    t1 = time.perf_counter()
    import fiftyone

    time_elapsed = time.perf_counter() - t1
    if time_elapsed > IMPORT_ERROR_THRESHOLD:
        raise RuntimeError("`import fiftyone` took %f seconds" % time_elapsed)
    elif time_elapsed > IMPORT_WARN_THRESHOLD:
        # disable stdout capture temporarily
        with capsys.disabled():
            # message must follow this format:
            # https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#setting-a-warning-message
            print(
                "\n::warning::`import fiftyone` took %f seconds\n"
                % time_elapsed
            )
