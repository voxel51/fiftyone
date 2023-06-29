# 1. update PYTHONPATH 
# 2. update VENV_PATH
# 3. remove these comments
# 4. rename to dev.launch.sh
# 5. run `chmod +x dev.launch.sh`

export PYTHONPATH=$PYTHONPATH:/Users/sashankaryal/fiftyone/code/voxel51/fiftyone

export VENV_PATH=/Users/sashankaryal/fiftyone/venvs/oss/bin/activate

# source $VENV_PATH && python ../fiftyone/server/main.py --address 0.0.0.0 --port 8787