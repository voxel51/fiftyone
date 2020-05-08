# End-to-End Example with Image De-duplication

## Download the data

First we download the dataset to disk. The dataset is a 1000 sample subset of
CIFAR100, a dataset of 32x32 pixel images with one of 100 different
classification labels such as `apple`, `bicycle`, `porcupine`, etc.

```bash
python download_dataset.py
```

The dataset is organized on disk as follows:

```
/tmp/fiftyone/
└── cifar100_with_duplicates/
    ├── <classA>/
    │   ├── <image1>.jpg
    │   ├── <image2>.jpg
    │   └── ...
    ├── <classB>/
    │   ├── <image1>.jpg
    │   ├── <image2>.jpg
    │   └── ...
    └── ...
```

As we will soon come to discover, some of these samples are duplicates and
we have no clue which they are!

## Walkthrough

Open an ipython session in your terminal by typing: `ipython`

```python

```
