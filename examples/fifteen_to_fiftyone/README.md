# Fifteen Minutes to FiftyOne

A 15 minute overview of using the FiftyOne tool.

## Setup

The walkthrough is provided as a [Jupyter Notebook](https://jupyter.org). The
easiest way to run it is by installing Jupyter:

```sh
pip install jupyter
```

## Running the walkthrough

To launch the notebook on any machine with FiftyOne installed, run:

```sh
python -m fiftyone.examples.fifteen_to_fiftyone
```

If you would like to directly work with this notebook, you can locate it on
disk by running the following command:

```sh
NOTEBOOK_PATH="$(fiftyone constants EXAMPLES_DIR)/fifteen_to_fiftyone/15to51.ipynb"

echo $NOTEBOOK_PATH
```
