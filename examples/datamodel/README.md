# Core Examples of `fiftyone` Data Model

## Data

First you must download the example CIFAR100 dataset via:
```bash
python ../download_data.py
```

Data is downloaded as:
```
{{fiftyone}}/examples/data/
└── cifar100/
    ├── test/                       # 10k INDEX.jpg test images
    ├── test_coarse.json            # coarse labels for test images
    ├── test_fine.json              # fine-grain labels for test images
    ├── train/                      # 50k INDEX.jpg train images
    ├── train_coarse.json           # coarse labels for test images
    └── train_fine.json             # fine-grain labels for train images
```

## Scripts

 - `test_db_conn.py`: test that you have the `fiftyone` MongoDB server
 properly installed
 
- `drop_database.py`: clear the database at anytime

- `document_test.py`: test the functionality of the `fiftyone.core.document`
 module which extends `eta.core.serial` for database read/write
 
- `ingest_data.py`: read CIFAR100 data into the database

- `explore_data.py`: snippets for exploring the database and example dataset

- `query_data.py`: snippets for querying the example dataset
