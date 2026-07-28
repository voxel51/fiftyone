.PHONY: app python docker docker-export

.DEFAULT_GOAL := docker-export

app:
	@cd app && yarn && yarn build && cd ..

clean:
	@rm -rf ./dist/*

python: app
	@uv build --clear --sdist
	@test "$$(find dist -maxdepth 1 -type f -name 'fiftyone-*.tar.gz' | wc -l | tr -d ' ')" -eq 1
	@uv build --wheel dist/fiftyone-*.tar.gz
	@uv run --locked --only-group build twine check --strict dist/*
	@uv run --locked --only-group build check-wheel-contents dist/*.whl

docker: python
	@docker build -t local/fiftyone .

docker-export: docker
	@docker save local/fiftyone | gzip > fiftyone.tar.gz
