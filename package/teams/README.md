FiftyOne Teams deployments for [FiftyOne](https://pypi.org/project/fiftyone).

### Install

```sh
pip install -e .
```

### Configuration

For development, the development [organization](https://manage.auth0.com/dashboard/us/dev-uqppzklh/organizations/org_wtMMZE61j2gnmxsm/overview) ID and [client](https://manage.auth0.com/dashboard/us/dev-uqppzklh/applications/pJWJhgTswZu2rF0OUOdEC5QZdNtqsUIE/settings) ID should be set:
```
export FIFTYONE_TEAMS_CLIENT_ID=pJWJhgTswZu2rF0OUOdEC5QZdNtqsUIE
export FIFTYONE_TEAMS_ORGANIZATION=org_wtMMZE61j2gnmxsm
```

### Running the API server 
```
hypercorn fiftyone.teams.app:app --bind 0.0.0.0:5151 --reload
```

### Developing the App
```
export VITE_API=http://localhost:5151 # indicate that the API is running on 5151
cd ./app/packages/teams && yarn && yarn dev
```
