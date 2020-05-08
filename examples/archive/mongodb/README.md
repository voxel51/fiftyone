# MongoDB noSQL Database

This directory is a set of examples for interacting with a MongoDB database.

This code is **NOT** dependent on the `fiftyone` python module. It stands as
an example of using MongoDB for the use case of image dataset representation.

## Requirements

```
pip install pymongo
```

You will also need to
[install MongoDB](https://www.mongodb.com/download-center/community). Note
that this is different from the `fiftyone` install process.

You will also need to have downloaded the example CIFAR100 dataset via:
```bash
python ../download_data.py
```

## Scripts

1. Test your connection to the server via `test_db_conn.py`
2. Ingest (and reset) the database via `ingest_data.py` and `drop_database.py`
3. Explore the data via `explore_data.py`
