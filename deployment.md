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
Environment=SECRET_KEY=your-secret-key-here
Environment=EFTY_DB=/path/to/efty/db.sqlite3
ExecStart=/path/to/efty/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 server:app
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable efty
sudo systemctl start efty
```


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
