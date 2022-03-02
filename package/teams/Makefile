.PHONY: app python docker docker-export

.DEFAULT_GOAL := docker-export

app:
	@cd ../../app && yarn && yarn build-teams-app && cd -

python: app
	@python setup.py sdist bdist_wheel

docker: python
	@docker build -t voxel51/fiftyone-teams-app .

docker-export: docker
	@docker save voxel51/fiftyone-teams-app:latest | gzip > fiftyone-teams-app.tar.gz
