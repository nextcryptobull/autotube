# AutoTube Studio — Oracle Cloud Always Free Deployment

This guide walks you through deploying AutoTube Studio to a **free-forever** Oracle Cloud
Ampere A1 VM. After setup, you'll have:

- A public HTTPS URL (via free Cloudflare Tunnel — no domain purchase required)
- SQLite database on local persistent disk (no DB service needed)
- ffmpeg available (voiceover route works untouched)
- Auto-restart on crash + reboot (pm2 + systemd)
- One-command updates from `git push` to `main`

**Total cost: $0/month forever.** Oracle's Always Free tier is genuinely free — not a
12-month trial. You get 4 ARM cores, 24 GB RAM, 200 GB disk, 10 TB egress/month.

**Total setup time: ~45 minutes** (one-time).

---

## Prerequisites

- A credit/debit card (for Oracle verification — **never charged**, just anti-abuse)
- A phone number for SMS verification
- A GitHub account (the repo is already at `nextcryptobull/autotube`)
- A Cloudflare account (free — for HTTPS tunnel)
- Your Z.ai API credentials (`baseUrl` + `apiKey`) for the `z-ai-web-dev-sdk`

---

## Step 1 — Create Oracle Cloud Account

1. Go to <https://signup.cloud.oracle.com/>
2. Use a real-looking name + address (Oracle sometimes rejects fake-looking data)
3. Pick the **Home Region** closest to your audience (US-East, US-West, or any EU region are fine for Always Free)
4. Verify your email, then add a payment method (card not charged)
5. Complete SMS verification
6. Wait for the welcome email (usually arrives in 1-5 minutes; sometimes 1-2 hours)

⚠️ If signup is rejected, wait 24 hours and try again with the same card.
Oracle's anti-fraud is aggressive. Trying repeatedly in the same day tends to fail.

---

## Step 2 — Provision the Always Free VM

1. Log in to <https://cloud.oracle.com> → top-left hamburger menu → **Compute** → **Instances**
2. Click **Create instance**
3. Configure as follows:

   | Field | Value |
   |---|---|
   | Name | `autotube` |
   | Image and shape | Click **Edit** |
   | Image | **Canonical Ubuntu 22.04** (or 24.04) — click "Change image" if it shows something else |
   | Shape | **Ampere** → `VM.Standard.A1.Flex` |
   | OCPUs | `4` |
   | Memory | `24` GB |
   | Shape | Confirm |

4. **SSH key pairs** (IMPORTANT — you cannot SSH in without this):
   - Choose **"Save private key"** and **"Save public key"**
   - This downloads two files to your laptop — keep them safe (e.g. `~/.ssh/autotube_key` and `~/.ssh/autotube_key.pub`)
   - **If you lose these, you'll be locked out of the VM**
   - On macOS/Linux, run: `chmod 600 ~/.ssh/autotube_key` (else SSH will refuse to use it)

5. **Networking** — leave defaults (new VCN + public subnet, auto-assign public IP)
6. Click **Create** — wait ~2 minutes for the VM to come up
7. Note the **Public IP** shown on the instance page (e.g. `152.70.120.45`)

⚠️ **Common gotcha**: Oracle sometimes shows "Out of capacity" when you try to create the VM. This is region-specific. If you hit it:
   - Try a different region (you may need to subscribe to a new region in your account)
   - Or wait 24 hours and try again (capacity is freed up regularly)
   - Or create a smaller VM first (1 OCPU, 6 GB) and edit the shape later

---

## Step 3 — Open Inbound Ports in Oracle's Security List

Oracle blocks ALL inbound traffic by default. You need to allow SSH (22), HTTP (80), HTTPS (443).

1. Go to **Networking** → **Virtual Cloud Networks** → click your VCN (named `Default-VCN-...`)
2. Click **Security Lists** in the left sidebar → click the **Default Security List**
3. Click **Add Ingress Rules** and add three rules:

   | Source CIDR | IP Protocol | Source Port | Destination Port | Description |
   |---|---|---|---|---|
   | `0.0.0.0/0` | TCP | All | `22` | SSH |
   | `0.0.0.0/0` | TCP | All | `80` | HTTP |
   | `0.0.0.0/0` | TCP | All | `443` | HTTPS |

4. Click **Add Ingress Rules** at the bottom to save all three

---

## Step 4 — SSH Into the VM

From your laptop:

```bash
ssh -i ~/.ssh/autotube_key ubuntu@<VM_PUBLIC_IP>
```

Type `yes` when prompted to accept the host fingerprint. You should now be at a `ubuntu@instance-…:~$` prompt.

⚠️ If SSH hangs: re-check that your security list allows port 22 from `0.0.0.0/0`, and that your local `~/.ssh/autotube_key` has `chmod 600` permissions.

---

## Step 5 — Run the Setup Script

You're now on the VM. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/nextcryptobull/autotube/main/deploy/setup.sh | sudo bash
```

This takes ~3-5 minutes and installs:
- Node 20 LTS + npm
- ffmpeg + sqlite3
- pm2 (process manager)
- cloudflared (free HTTPS tunnel)
- UFW firewall (only SSH/80/443 inbound allowed)
- The repo itself at `/opt/autotube`
- All npm dependencies
- A built Next.js production bundle
- A running app under pm2 (on `localhost:3000`)
- Auto-restart on crash + VM reboot

When the script finishes, you'll see a "Setup complete!" message with next steps.

---

## Step 6 — Add Your Z.ai API Credentials

The AI generation routes (script, voiceover, scene images) call `z-ai-web-dev-sdk`,
which needs a config file with your API key.

```bash
sudo nano /opt/autotube/.z-ai-config
```

Paste this (replace with your actual credentials):

```json
{
  "baseUrl": "https://api.z.ai/api/paas/v4",
  "apiKey": "YOUR_Z_AI_API_KEY"
}
```

Save with `Ctrl+O` → Enter → `Ctrl+X`.

Make it readable only by the autotube service user:

```bash
sudo chown autotube:autotube /opt/autotube/.z-ai-config
sudo chmod 600 /opt/autotube/.z-ai-config
sudo -u autotube pm2 restart autotube
```

---

## Step 7 — Expose to the Internet with Cloudflare Tunnel (Free HTTPS)

You have two options:

### Option A — Quick (random URL, changes on restart)

```bash
sudo -u autotube cloudflared tunnel --url http://localhost:3000
```

This prints a URL like `https://random-words-1234.trycloudflare.com` — open it in
your browser. The app is live.

⚠️ The URL changes every time you restart the tunnel. Good for testing, bad for sharing.

Press `Ctrl+C` to stop.

### Option B — Stable URL (recommended)

For a permanent `https://autotube.cfargotunnel.com` URL:

```bash
sudo -u autotube bash /opt/autotube/deploy/cloudflared-setup.sh --named
```

This:
1. Opens a browser flow on your laptop to authorize `cloudflared` with your Cloudflare account
   (you'll need to copy a URL from the terminal into your local browser)
2. Creates a named tunnel called `autotube`
3. Configures the DNS route `autotube.cfargotunnel.com → your VM`
4. Installs a systemd service so the tunnel auto-restarts on VM reboot

After ~1 minute, your app is live at:

> **https://autotube.cfargotunnel.com**

### Option C — Your own domain

If you own a domain (e.g. `mytube.com`):

1. Add the domain to your Cloudflare account (free plan OK)
2. Update your domain's nameservers to the Cloudflare ones shown in the dashboard
3. Re-run Option B above, then:
   ```bash
   sudo -u autotube cloudflared tunnel route dns autotube yoursubdomain.mytube.com
   sudo nano ~autotube/.cloudflared/config.yml   # add the new hostname to the ingress list
   sudo systemctl restart cloudflared
   ```

---

## Step 8 — Verify It Works

Open your tunnel URL in a browser:

- Dashboard loads → ✅
- Click "Trend Lab" → 15 niches appear → ✅
- Click "Content Studio" → pick a niche → click "Generate Script" → script appears in ~15-20s → ✅
- Click "Generate Voiceover" → audio player appears in ~15-20s → ✅
- Click "Generate Scene Images" → scene cards get images in ~30-60s (rate-limited) → ✅

If anything fails:

```bash
sudo -u autotube pm2 logs autotube --lines 100   # tail app logs
sudo journalctl -u cloudflared -f                 # tail tunnel logs
```

---

## Day-to-Day Operations

### Pull latest code from GitHub (after you push a fix)

```bash
ssh -i ~/.ssh/autotube_key ubuntu@<VM_IP>
sudo -u autotube bash /opt/autotube/deploy/update.sh
```

Or one-liner from your laptop:

```bash
ssh -i ~/.ssh/autotube_key ubuntu@<VM_IP> 'sudo -u autotube bash /opt/autotube/deploy/update.sh'
```

The script:
- `git pull origin main`
- Runs `npm install` if `package.json` changed
- Regenerates Prisma client + pushes schema
- Rebuilds Next.js
- Restarts pm2

### Check app health

```bash
sudo -u autotube pm2 status              # see if app is online, CPU%, memory
sudo -u autotube pm2 logs autotube --lines 50
```

### Restart the app

```bash
sudo -u autotube pm2 restart autotube
```

### Restart the tunnel

```bash
sudo systemctl restart cloudflared
```

### Reboot the VM

```bash
sudo reboot
```

Both the app (pm2) and tunnel (cloudflared) auto-start on boot — wait ~60s after
reboot and the URL should be live again.

---

## Backups (recommended, optional)

The SQLite DB lives at `/opt/autotube/db/custom.db`. Back it up daily to a free
10 GB Backblaze B2 bucket (or any S3-compatible storage):

```bash
sudo apt install -y rclone
sudo rclone config   # follow prompts to add your B2 account
echo '0 3 * * * root sqlite3 /opt/autotube/db/custom.db ".backup /tmp/autotube-$(date +\%F).db" && rclone copy /tmp/autotube-*.db b2:autotube-backups/ && rm /tmp/autotube-*.db' | sudo tee /etc/cron.d/autotube-backup
```

---

## Troubleshooting

### "Out of capacity" when creating the VM
Try a different region. Oracle's free ARM capacity rotates. Also try at off-peak hours.

### App is up but URL shows "Bad gateway" / 502
Tunnel hasn't connected yet. Check:
```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 50
```

### `pm2 logs` shows "DATABASE_URL not set"
The `.env` file is missing or pm2 was started without the env. Fix:
```bash
sudo -u autotube cat /opt/autotube/.env   # should exist
sudo -u autotube pm2 restart autotube --update-env
```

### Image generation fails with 429
The image gen API has a rate limit. The code already throttles to one image per 3
seconds. If you still hit 429, increase the throttle in `src/app/api/content/scene-image/route.ts`
(line with `await sleep(3000)` → `await sleep(5000)`).

### Voiceover route times out
The route makes 8-12 sequential TTS calls + ffmpeg concat — takes ~15-20s on a
warm VM. If it hangs, check ffmpeg is installed:
```bash
ffmpeg -version
```

### I'm locked out of the VM (lost SSH key)
- Stop the VM in Oracle console
- Detach the boot volume → attach to another VM as data → mount → add new public
  key to `~/.ssh/authorized_keys` → detach → reattach as boot → start
- (Yes this is painful. Don't lose the key.)

### Oracle threatens to reclaim the VM
Always Free instances must show "activity". A VM sitting idle for a week can be
reclaimed. Prevent this with a simple cron that pings the app every 10 minutes:
```bash
echo '*/10 * * * * curl -sf http://localhost:3000/api/dashboard >/dev/null' | sudo tee /etc/cron.d/autotube-keepalive
```

---

## Cost Summary

| Item | Free tier | Your usage |
|---|---|---|
| Oracle Cloud VM (4 ARM cores, 24 GB RAM) | Always Free | 1 VM |
| Oracle Cloud block storage | 200 GB free | ~5 GB used |
| Oracle Cloud egress | 10 TB/month | <1 GB/month |
| Cloudflare Tunnel | Free, unlimited | 1 tunnel |
| Cloudflare DNS | Free, unlimited | 1 zone |
| Z.ai API | Your plan | — |

**Total: $0/month, forever.**

---

## What You Get

After this guide, your stack looks like:

```
                            ┌──────────────────────┐
                            │  Cloudflare Edge     │
                            │  (free HTTPS, CDN)   │
                            └──────────┬───────────┘
                                       │
                                       │ (cloudflared tunnel,
                                       │  outbound-only, no inbound ports)
                                       │
                            ┌──────────▼───────────┐
                            │  Oracle Cloud VM     │
                            │  (Ampere A1, ARM)    │
                            │                      │
                            │  ┌─────────────────┐ │
                            │  │  pm2 → Next.js  │ │  ← port 3000
                            │  │  (production)   │ │
                            │  └────────┬────────┘ │
                            │           │          │
                            │  ┌────────▼────────┐ │
                            │  │  SQLite DB      │ │  ← /opt/autotube/db/custom.db
                            │  │  (local disk)   │ │
                            │  └─────────────────┘ │
                            │                      │
                            │  ffmpeg installed    │  ← for voiceover concat
                            │  /opt/autotube/      │  ← git repo
                            │  /public/generated/  │  ← AI-generated assets
                            └──────────────────────┘
```

No external DB service, no S3, no Kubernetes, no Docker, no SSL cert renewal —
just one VM, one tunnel, one process manager. That's the beauty of the
"serverful on Always Free VM" approach.
