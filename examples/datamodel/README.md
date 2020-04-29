# Core Examples of `fiftyone` Data Model

## Data

First you must download the example CIFAR100 dataset via:
```bash
python ../download_data.py
```

## Scripts

 - `test_db_conn.py`: test that you have the `fiftyone` MongoDB server
 properly installed
 
- `drop_database.py`: clear the database at anytime

- `document_test.py`: test the functionality of the `fiftyone.core.document`
 module which extends `eta.core.serial` for database read/write
 
- `ingest_data.py`: read CIFAR100 data into the database

- ``
