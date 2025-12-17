# Deploying jaenib.com

This repo deploys to the server at `82.165.45.100` via a bare git repo with a post-receive hook.

## Layout on the server

- Bare repo: `/srv/jaenib.git`
- Work tree served by Nginx: `/var/www/jaenib`
- Nginx site config: `/etc/nginx/sites-available/jaenib.conf` (symlinked into sites-enabled)
- Web root falls back to `cv/index.html`, so hitting `/` or `/cv` serves the CV.

## Deploying changes

1) Make local changes and commit to `main`.
2) Push to the production remote:

```bash
git push production main
```

The post-receive hook checks out the latest `main` into `/var/www/jaenib`.

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
