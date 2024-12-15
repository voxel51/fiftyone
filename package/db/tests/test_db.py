import os
import subprocess


def test_db_import():
    import fiftyone.db

    assert os.path.isfile(
        os.path.join(fiftyone.db.FIFTYONE_DB_BIN_DIR, "mongod")
    )


def test_db_exec():
    import fiftyone.db

    subprocess.check_call(
        [os.path.join(fiftyone.db.FIFTYONE_DB_BIN_DIR, "mongod"), "--version"]
    )
