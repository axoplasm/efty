Deploying Efty on Ubuntu
========================

The standard setup is **nginx + gunicorn**: Gunicorn runs the Flask app as
a WSGI process, and Nginx sits in front to handle HTTPS and serve static
files directly from disk.


Install dependencies
--------------------

```bash
pip install gunicorn   # also add to requirements.in, pip freeze > requirements.txt
sudo apt install nginx
```


Test Gunicorn
-------------

```bash
gunicorn --workers 3 --bind 127.0.0.1:8000 server:app
```

`server:app` refers to the `app` object in `server.py`.


Environment file
----------------

Keep `SECRET_KEY` and other settings in an environment file that only root
can read, outside the project directory so it can’t end up in git or be
overwritten by a deploy:

```bash
sudo mkdir -p /etc/efty
sudo install -m 600 -o root -g root /dev/null /etc/efty/efty.env
```

Generate a secret key:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Then edit `/etc/efty/efty.env` (one `KEY=value` per line, no `export`):

```
SECRET_KEY=paste-the-generated-key-here
EFTY_DB=/var/lib/efty/db.sqlite3
```

Don’t put these in the unit file with `Environment=`: unit files are
world-readable, and `systemctl show` prints `Environment=` values to any user.
systemd reads the environment file as root before starting the service, so the
app’s user never needs access to it.

`SECRET_KEY` must be set. Without it, each Gunicorn worker generates its own
random key, and sessions signed by one worker are rejected by the others — you’ll
appear to be logged out at random.


Systemd service
---------------

Create `/etc/systemd/system/efty.service`:

```ini
[Unit]
Description=Efty RSS reader
After=network.target

[Service]
User=www-data
WorkingDirectory=/path/to/efty
EnvironmentFile=/etc/efty/efty.env
StateDirectory=efty
ExecStartPre=/path/to/efty/venv/bin/flask --app server init-db
ExecStart=/path/to/efty/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 server:app
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`StateDirectory=efty` makes systemd create `/var/lib/efty`, owned by the
service’s user, for the database. SQLite writes journal files next to the
database, so the app needs a writable *directory*, not just a writable file;
this avoids making the code directory writable by `www-data`.

`ExecStartPre` runs `flask --app server init-db` before each start. It creates
the database tables if they don’t exist and applies any pending migrations
after an upgrade. Gunicorn doesn’t do this itself: `python server.py` does, but
only when run directly.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable efty
sudo systemctl start efty
```

If you already have a database elsewhere, move it in now that the directory
exists:

```bash
sudo systemctl stop efty
sudo mv /path/to/efty/db.sqlite3 /var/lib/efty/db.sqlite3
sudo chown www-data:www-data /var/lib/efty/db.sqlite3
sudo systemctl start efty
```

After editing `efty.env` or the unit file later:

```bash
sudo systemctl daemon-reload
sudo systemctl restart efty
```


Create a user
-------------

Registration is disabled in the UI, so create accounts from the command line.
Run it as the service’s user so the database stays owned by `www-data`:

```bash
cd /path/to/efty
sudo -u www-data EFTY_DB=/var/lib/efty/db.sqlite3 venv/bin/python create_user.py alice
```

It warns that `SECRET_KEY` isn’t set; that’s harmless here, since creating a
user doesn’t involve sessions.


Nginx
-----

Create `/etc/nginx/sites-available/efty`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /static/ {
        alias /path/to/efty/static/;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/efty /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Nginx serves `/static/` directly from disk without touching Gunicorn.


HTTPS
-----

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot updates the Nginx config automatically and sets up auto-renewal.
