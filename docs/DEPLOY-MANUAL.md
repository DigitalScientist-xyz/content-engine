# Manual deployment to a live server (first time)

Use this when you have SSH access to a Linux server (e.g. Hostinger VPS). For shared hosting only, deploy the app elsewhere (e.g. Vercel) and point your domain there.

---

## 1. Server prerequisites

SSH into your server, then install Node.js 18+ and (optionally) Nginx and PM2.

**Node.js (Ubuntu/Debian):**
```bash
# Install Node 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should show v20.x
```

**PM2 (keeps the app running):**
```bash
sudo npm install -g pm2
```

**Nginx (reverse proxy so the app is on port 80/443):**
```bash
sudo apt-get update
sudo apt-get install -y nginx
```

---

## 2. Clone the repo and build

Pick a directory (e.g. `/var/www` or your home). Replace `YOUR_GITHUB_USER` if using a private repo with HTTPS (you’ll need a token or deploy key).

```bash
cd /var/www
sudo git clone https://github.com/DigitalScientist-xyz/content-engine.git
sudo chown -R $USER:$USER content-engine
cd content-engine
```

**Install and build:**
```bash
npm ci
npm run build
```

---

## 3. Environment variables on the server

Create `.env.local` on the server (never commit this file). Use your real OpenAI key and, if you use the Python extractor, its URL.

```bash
cd /var/www/content-engine
nano .env.local
```

Paste (and edit values):

```env
OPENAI_API_KEY=sk-proj-your-real-key-here
# Optional: only if you run the Python extractor on this server
# PYTHON_EXTRACTOR_URL=http://127.0.0.1:8000
```

Save (Ctrl+O, Enter, Ctrl+X).

---

## 4. Run the app with PM2

From the project directory:

```bash
cd /var/www/content-engine
pm2 start npm --name "content-engine" -- start
pm2 save
pm2 startup
```

Follow the command `pm2 startup` prints so the app restarts after a reboot. The app will listen on **port 3000** by default.

Check:
```bash
pm2 status
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000
```
You should get `200` or `304`.

---

## 5. Nginx reverse proxy (so the site is on port 80)

Create a site config (replace `your-domain.com` with your real domain or server IP):

```bash
sudo nano /etc/nginx/sites-available/content-engine
```

Paste:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    # Or use your server IP: server_name 123.45.67.89;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/content-engine /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Open **http://your-domain.com** (or http://YOUR_SERVER_IP) in a browser.

---

## 6. (Optional) HTTPS with Let’s Encrypt

If you use a real domain:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow the prompts. Certbot will adjust Nginx for HTTPS and auto-renewal.

---

## 7. (Optional) Python extractor on the same server

If the app uses the Python extractor:

```bash
cd /var/www/content-engine/python-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Run in background (or use systemd/supervisor)
nohup python main.py &
```

In `/var/www/content-engine/.env.local` set:

```env
PYTHON_EXTRACTOR_URL=http://127.0.0.1:8000
```

Restart the Next app so it picks up the env change:

```bash
pm2 restart content-engine
```

---

## 8. Later: deploy updates manually

**Live server mapping (use the right names so you update the correct site):**

| What | PM2 process name | Restart when |
|------|------------------|--------------|
| **Main site** (Next.js) | `whitepaper-factory` | You change app code, run deploy below |
| **Python extractor** | `whitepaper-extractor` | You change `python-service/` or deps |

On the current live server the app directory may be `/var/www/lindenhaeghe` (or `/var/www/whitepaper-factory`). Use the directory where this repo is actually cloned.

After you change code and push to GitHub:

```bash
# Replace with your actual app directory if different (e.g. /var/www/lindenhaeghe)
cd /var/www/content-engine
git pull origin main
npm ci
npm run build
pm2 restart whitepaper-factory
```

If you changed the Python extractor:

```bash
pm2 restart whitepaper-extractor
```

---

## 9. Deploy to https://whitepaper.troycollins.nl/ (live site)

The live site pulls from the **lindenhaeghe** repo. Your edits are in **content-engine**. To get updates live you must either push content-engine → lindenhaeghe, or pull from content-engine on the server.

**Option A – Push from this repo (content-engine) to lindenhaeghe, then deploy on server**

Run once locally (in content-engine) to add the live repo as a remote and push:

```bash
cd /Users/troy/Documents/Apps/content-engine
git remote add lindenhaeghe https://github.com/DigitalScientist-xyz/lindenhaeghe.git
git push lindenhaeghe main
```

If `lindenhaeghe` remote already exists, just run:

```bash
git push lindenhaeghe main
```

Then on the **server** (SSH):

```bash
cd /var/www/lindenhaeghe
git pull origin main
npm ci
npm run build
pm2 restart whitepaper-factory
```

**Option B – On server only: pull from content-engine**

On the **server** (SSH), pull from content-engine instead of lindenhaeghe:

```bash
cd /var/www/lindenhaeghe
git remote add content-engine https://github.com/DigitalScientist-xyz/content-engine.git
git fetch content-engine
git checkout main
git reset --hard content-engine/main
npm ci
npm run build
pm2 restart whitepaper-factory
```

Later deploys (Option B): `git fetch content-engine && git reset --hard content-engine/main` then `npm ci && npm run build && pm2 restart whitepaper-factory`.

---

## Quick checklist

- [ ] Node 18+ installed
- [ ] Repo cloned, `npm ci` and `npm run build` run
- [ ] `.env.local` created with `OPENAI_API_KEY` (and `PYTHON_EXTRACTOR_URL` if needed)
- [ ] PM2 running `npm -- start`, `pm2 save` and `pm2 startup` done
- [ ] Nginx proxy to port 3000 and `nginx -t` + reload
- [ ] (Optional) Certbot for HTTPS
- [ ] (Optional) Python extractor running if you use it
