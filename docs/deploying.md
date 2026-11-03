# Deploying the CRM

The chat app and the CRM deploy on different paths.

Pushing the chat repo (`upgraded-chat-new`) to `main` deploys Labs, the inbox, and the enrich queue through Vercel. That push does not change the CRM.

The CRM runs in two places:

- Local: Docker on this Mac, project `upgraded-crm/upgraded-crm`, site at `http://localhost:3020`.
- Production: the DigitalOcean droplet `146.190.213.128`, site at `https://146.190.213.128.sslip.io`. Compose lives in `/opt/twenty`. The server and worker use the image `upgraded-crm:brand`. The site serves `/opt/twenty/front`, not the copy baked into the image.

GitHub's existing `cd-deploy-main` workflow dispatches Twenty's own infra. It does not update this droplet. The droplet is too small to compile Twenty, so the frontend is built elsewhere and copied on.

## What a frontend deploy changes

`scripts/deploy-crm-front.sh` builds `packages/twenty-front` and copies that build into the running server. It restarts only the server container. Postgres, Redis, and the worker stay up. The database volume is not removed.

The server reads `index.html` once at startup, so a file copy without a restart still serves the old page. The script restarts the server and waits until `/healthz` returns 200.

Production keeps the previous frontend at `/opt/twenty/front.bak-<timestamp>`.

## Deploy from the CRM repo

```bash
./scripts/deploy-crm-front.sh local
./scripts/deploy-crm-front.sh production
./scripts/deploy-crm-front.sh both
```

`SKIP_BUILD=1` reuses `packages/twenty-front/build` when that directory is already the build you want. The script refuses a build that does not contain the People header label `Run Revenue Agent`.

Production uses the SSH key already loaded for `root@146.190.213.128`. Override the host with `CRM_HOST`. In GitHub Actions the key comes from `CRM_SSH_KEY`.

## Continuous deploy

`.github/workflows/deploy-droplet.yaml` runs on every push to `main` that changes the frontend, these scripts, or the workflow. It also runs from the Actions tab via `workflow_dispatch`.

The repo needs two Actions secrets:

- `DROPLET_HOST` — `146.190.213.128`
- `DROPLET_SSH_KEY` — the private key that logs in as `root` on that droplet

The workflow builds the frontend on GitHub and runs `./scripts/deploy-crm-front.sh production`. It does not deploy the laptop. Run the `local` target on the Mac when the local CRM should match.

## What this pipeline does not do

Server and database changes are not copied by this script. Shipping a new `upgraded-crm:brand` image is a separate step: build `linux/amd64` on a machine large enough to compile Twenty, `docker load` it on the droplet, then recreate only the server and worker:

```bash
docker build --platform linux/amd64 \
  -f packages/twenty-docker/twenty/Dockerfile \
  --target twenty -t upgraded-crm:brand .
docker save upgraded-crm:brand | gzip -1 | ssh root@146.190.213.128 'gunzip | docker load'
ssh root@146.190.213.128 'cd /opt/twenty && docker compose up -d --force-recreate --no-deps server worker'
```

`--no-deps` is required. A plain `docker compose up` can recreate the database. Do not run the official Twenty installer on the droplet. It replaces `upgraded-crm:brand`.

A new server image can run database migrations on startup. A frontend deploy does not.
