import os


def test_db_import():
    import fiftyone.db

    assert os.path.isfile(
        os.path.join(fiftyone.db.FIFTYONE_DB_BIN_DIR, "mongod")
    )
