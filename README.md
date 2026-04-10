# Kids TV Launcher

A kids-friendly show picker for an **LG OLED TV (WebOS 5.0)**. Big poster cards, D-pad + Magic Remote navigation, deep-links directly into Netflix, YouTube, and Videoland.

---

## Quick start (first time)

### 1 — Install ares-cli

```bash
npm i -g @webosose/ares-cli
```

### 2 — Enable Developer Mode on the TV

1. Open the LG Content Store on the TV.
2. Search for **Developer Mode** and install it.
3. Open the app, sign in with a free LG Developer account, and turn Developer Mode **ON**.
4. Note the TV's IP address (Settings → Network → Wi-Fi Connection → Advanced).

> The Developer Mode session expires every ~50 hours. When it expires, just reopen the Developer Mode app and turn it on again — no reinstall needed.

### 3 — Register the TV with ares

```bash
ares-setup-device
```

Use device name **`lgtv`** and enter the TV's IP address. Default port is 9922.  
Accept the pairing PIN shown on-screen.

### 4 — Deploy

```bash
./deploy.sh
```

This packages the app into a `.ipk`, installs it on the TV, and launches it.

---

## Adding or changing shows

Edit `shows.json`. Each show has this shape:

```json
{
  "title":   "Show Name",
  "image":   "https://...",
  "platform": "netflix" | "youtube" | "videoland" | "direct",

  // Netflix only
  "contentId":  "80057281",
  "mediaType":  "show",

  // YouTube / Videoland / direct only
  "contentTarget": "https://..."
}
```

### Finding a Netflix content ID

Go to `netflix.com/title/XXXXXXXXX` — the number at the end is the `contentId`.

### Finding a YouTube channel / video URL

- Channel: `https://www.youtube.com/channel/UCXXXXXXXX`
- Single video: `https://www.youtube.com/watch?v=XXXXXXXXXXX`

### Videoland

Use the series URL from `videoland.com`. Deep-linking opens the app; it may land on the home screen instead of the specific show depending on the app version.

### Direct video

Set `"platform": "direct"` and `"url": "https://..."`. The video plays in an in-app HTML5 `<video>` element. Only works for unencrypted streams.

---

## Redeploying after changes

```bash
./deploy.sh
```

Or just package without installing:

```bash
./deploy.sh --package   # creates dist/com.smartneighbor.kidslauncher_1.0.0_all.ipk
```

---

## Project structure

```
kids-launcher/
  appinfo.json        WebOS app metadata (ID, version, entry point)
  index.html          App shell
  styles.css          TV-optimised layout & styling
  app.js              App logic (grid, D-pad nav, deep-link launch)
  shows.json          Show list — edit this to change content
  webOSTVjs/
    webOSTV.js        Minimal PalmServiceBridge wrapper (works on-device + browser)
  icon_80.png         App icon (80×80)
  icon_130.png        App icon (130×130)
  deploy.sh           One-command package + install + launch
  dist/               Built .ipk files (git-ignored)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ares-install` fails with "session expired" | Reopen Developer Mode app on TV and turn it back on |
| App launches but shows blank screen | Check TV's internet connection; poster images are remote URLs |
| Netflix/YouTube won't open | The streaming app may not be installed on the TV |
| Videoland shows toast "App-ID onbekend" | The app auto-discovers on boot; wait a moment and retry |
| `ares-setup-device` can't connect | Verify TV IP, ensure both devices are on the same network |
