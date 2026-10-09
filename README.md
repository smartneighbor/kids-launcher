# Kids TV

Kindvriendelijke Jellyfin-player voor de **LG OLED48CX** (webOS 5, Chrome 68). Zelfde look als de tablet-app (Kids Car Launcher): grote kaarten, bediening met pijltjes en OK, afspelen in de eigen player.

## Bediening

| Scherm | Toets | Actie |
|---|---|---|
| Home | Pijltjes | Kaart kiezen |
| Home | OK | Serie afspelen (gaat verder waar je was) |
| Player | OK | Pauze / verder |
| Player | Links / rechts | 15 seconden terug / vooruit |
| Player | Terug | Naar home (positie wordt bewaard) |

Op home doet Terug bewust niets; de Home-knop van de afstandsbediening werkt altijd.

## Setup

```bash
npm i -g @webos-tools/cli
ares-setup-device            # device "tv", TV in Developer Mode
cp config.example.js config.js   # Jellyfin API key invullen
./deploy.sh
```

Series staan in `config.js` (`series: [{ id, title }]`). Afleveringen, afbeeldingen en streams komen uit Jellyfin.
Afspelen gaat direct (bestand zonder transcoding); als dat faalt valt de app terug op Jellyfin-HLS.

## Debuggen

```bash
ares-inspect -d tv -a nl.joey.kidstv   # geeft een DevTools-URL
```

Let op: Chrome 68 — geen `?.`, `??`, CSS `aspect-ratio` of `inset`.
