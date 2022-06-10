# Deploying FiftyOne-Teams Using Helm

Edit the `values.yaml` file, paying particular attention to

| Name                   | Description                                                                                  |
|------------------------|----------------------------------------------------------------------------------------------|
| `namespace.name`       | Create a unique namespace for your deployment, or deploy in `default`                        |
| `secret.name`          | Create a secret to store the FiftyOne Teams secrets                                          |
| `secret.createSecrets` | If you set `secret.create` to `true` you can have this Helm chart create secrets for you.    |
| `env.nonsensitive`     | Non-sensitive environment variables and their values                                         |
| `env.sensitive`        | A mapping of sensitive environment variables and the key that stores their value             |
| `image.repository`     | The image to deploy                                                                          |
| `ingress.hosts.host`   | The Fully Qualified Domain Name [FQDN] of the deployment                                     |
| `tls.secretName`       | The name of the secret that contains `tls.crt` and `tls.key` values for your SSL Certificate |
| `tls.hosts`            | The FQDN of the deployment                                                                   |

You must provide `FIFTYONE_TEAMS_ORGANIZATION` and `FIFTYONE_DATABASE_URI` environment variables.  Without those variables the environment will not load correctly.

Once you have edited the `values.yaml` file you can deploy your FiftyOne Teams instance with:

  `helm install releasename ./fiftyone-teams -f values.yaml`
