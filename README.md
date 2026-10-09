# Kids TV

Kindvriendelijke Jellyfin-player voor de **LG OLED48CX** (webOS 5, Chrome 68). Zelfde look als de tablet-app (Kids Car Launcher): grote kaarten, bediening met pijltjes en OK, afspelen in de eigen player.

## Bediening

| Scherm | Toets | Actie |
|---|---|---|
| Home | Omhoog (bovenste rij) | Naar de tabs Series / Films |
| Tabs | Links / rechts | Series of Films (standaard Series) |
| Home | Pijltjes | Kaart kiezen |
| Home | OK | Serie afspelen (Jellyfin Next Up: verder waar je was) |
| Player | OK | Pauze / verder |
| Player | Links / rechts | 15 seconden terug / vooruit |
| Player | Omlaag | Naar de knoppen (pauze / Volgende) |
| Player | CH+ / CH− | Volgende / vorige aflevering |
| Player | Terug | Naar home (positie wordt in Jellyfin bewaard) |

Op home doet Terug bewust niets; de Home-knop van de afstandsbediening werkt altijd.

## Opbouw

`app/` is de complete tv-app (HTML/CSS/JS). Hij wordt als geheel op de tv geïnstalleerd en heeft alleen Jellyfin nodig.

## Setup

```bash
npm i -g @webos-tools/cli
ares-setup-device                        # device "tv", TV in Developer Mode
cp app/config.example.js app/config.js   # Jellyfin-gebruiker + wachtwoord invullen
./deploy.sh                              # installeert op de tv (zonder de app te openen)
./deploy.sh --launch                     # installeert en opent de app
```

UI-preview in een gewone browser (alleen op de always-on Mac, Caddy-blok in `/opt/homebrew/etc/Caddyfile`, `bind 127.0.0.1`):
`http://127.0.0.1:8790/?zoom=0.75` — de tv hangt hier niet van af.

Elke serie of film die de Jellyfin-gebruiker `Kids` mag zien, wordt een kaart (alfabetisch). `Kids` ziet alleen items met de tag `kids`: content toevoegen = in Jellyfin de tag `kids` op de serie of film zetten. Alles wat data is komt uit Jellyfin: afleveringen, artwork, streams, en wat er gekeken is.
De app logt in als Jellyfin-gebruiker `Kids` en meldt het afspelen bij Jellyfin zoals elke Jellyfin-client. Waar een serie verdergaat bepaalt Jellyfin (Next Up + hervatpositie).
Afspelen gaat direct (bestand zonder transcoding); als dat faalt valt de app terug op Jellyfin-HLS.

## Debuggen

```bash
ares-inspect -d tv -a nl.joey.kidstv   # geeft een DevTools-URL
# of de UI-preview: http://127.0.0.1:8790/?zoom=0.75
```

Let op: Chrome 68 — geen `?.`, `??`, CSS `aspect-ratio` of `inset`.
