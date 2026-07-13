# Deploying jaenib.com

This repo deploys to the server at `82.165.45.100` via a bare git repo with a post-receive hook.

## Layout on the server

- Bare repo: `/srv/jaenib.git`
- Work tree served by Nginx: `/var/www/jaenib`
- Nginx site config: `/etc/nginx/sites-available/jaenib.conf` (symlinked into
  sites-enabled — restored to a real symlink July 2026; edit sites-available,
  then `nginx -t && systemctl reload nginx`)
- Web root falls back to `cv/index.html`, so hitting `/` or `/cv` serves the CV.

## Deploying changes

1) Make local changes and commit to `main`.
2) Push to the production remote:

```bash
git push production main
```

The post-receive hook checks out the latest `main` into `/var/www/jaenib`.

Note: the hook runs `git checkout -f`, which does NOT delete files that were
removed from the repo — stale files must be removed from `/var/www/jaenib`
by hand (this bit us with the old portfolio PDF).

## Large videos (not in git)

The full films are too large for the repo. They are gitignored and uploaded
directly to the web root (the hook never touches untracked files):

```bash
scp public-sentiment.mp4 sensing-abundance.mp4 dream-together.mp4 \
  root@82.165.45.100:/var/www/jaenib/cv/assets/video/
```

Web copies are H.264 crf 25 / max 1920px / aac 128k / +faststart, built with
ffmpeg from the masters on the external SSD (`/Volumes/1TB_SSD_A/Architektur/…`).

## View counter

`cv/views.js` shows and increments per-film view counts:

- Service: `/srv/viewcount/viewcount.py` (Python stdlib, port 8787),
  systemd unit `viewcount.service`, storage `/srv/viewcount/views.json`.
- Nginx proxies `/api/views/` to it (in `jaenib.conf`).
- API: `GET /api/views/<id>` → `{"views": n}`; `POST /api/views/<id>/hit`
  increments. Ids: `[a-z0-9-]`, currently `public-sentiment`,
  `sensing-abundance`, `dream-together`.

## Accessing the server

- SSH: `ssh root@82.165.45.100`
- Your local SSH key (`~/.ssh/id_ed25519`) is authorized on the server. To add another key:

```bash
ssh-copy-id -i ~/.ssh/other_key.pub root@82.165.45.100
```

## Nginx notes

- Logs: `/var/log/nginx/jaenib.access.log` and `/var/log/nginx/jaenib.error.log`
- Reload config after changes: `systemctl reload nginx`

## DNS and TLS

- Point `jaenib.com` (and optionally `www.jaenib.com`) A records to `82.165.45.100`.
- Once DNS propagates, install TLS via Certbot (optional but recommended):

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d jaenib.com -d www.jaenib.com
```
