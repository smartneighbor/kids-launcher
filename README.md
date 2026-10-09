# Kids TV

Kindvriendelijke Jellyfin-player voor de **LG OLED48CX** (webOS 5, Chrome 68). Zelfde look als de tablet-app (Kids Car Launcher): grote kaarten, bediening met pijltjes en OK, afspelen in de eigen player.

## Bediening

| Scherm | Toets | Actie |
|---|---|---|
| Home | Pijltjes | Kaart kiezen |
| Home | OK | Serie afspelen (Jellyfin Next Up: verder waar je was) |
| Player | OK | Pauze / verder |
| Player | Links / rechts | 15 seconden terug / vooruit |
| Player | Omlaag | Naar de knoppen (pauze / Volgende) |
| Player | CH+ / CH− | Volgende / vorige aflevering |
| Player | Terug | Naar home (positie wordt in Jellyfin bewaard) |

Op home doet Terug bewust niets; de Home-knop van de afstandsbediening werkt altijd.

## Opbouw

- `web/` — de echte app. Caddy op de always-on Mac serveert deze map op `http://192.168.1.61:8790/`. Wijzigingen zijn direct live: de tv laadt bij elke start de nieuwste versie.
- `tv/` — een klein lader-appje dat op de tv geïnstalleerd is en `web/` opent. Alleen opnieuw installeren als `tv/` verandert.

## Setup

```bash
npm i -g @webos-tools/cli
ares-setup-device                        # device "tv", TV in Developer Mode
cp web/config.example.js web/config.js   # Jellyfin-gebruiker + wachtwoord invullen
./deploy.sh                              # installeert tv/ (zonder de app te openen)
```

Caddy-blok (in `/opt/homebrew/etc/Caddyfile`):

```
http://:8790 {
	root * /Users/joeygermeraad/Projects/kids-launcher/web
	header Cache-Control "no-cache"
	file_server
}
```

Elke serie of film die de Jellyfin-gebruiker `Kids` mag zien, wordt een kaart (alfabetisch). `Kids` ziet alleen items met de tag `kids`: content toevoegen = in Jellyfin de tag `kids` op de serie of film zetten. Alles wat data is komt uit Jellyfin: afleveringen, artwork, streams, en wat er gekeken is.
De app logt in als Jellyfin-gebruiker `Kids` en meldt het afspelen bij Jellyfin zoals elke Jellyfin-client. Waar een serie verdergaat bepaalt Jellyfin (Next Up + hervatpositie).
Afspelen gaat direct (bestand zonder transcoding); als dat faalt valt de app terug op Jellyfin-HLS.

## Debuggen

```bash
ares-inspect -d tv -a nl.joey.kidstv   # geeft een DevTools-URL
# of open http://192.168.1.61:8790/ in een gewone browser
```

Let op: Chrome 68 — geen `?.`, `??`, CSS `aspect-ratio` of `inset`.
