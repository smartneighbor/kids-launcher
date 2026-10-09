// Copy to config.js and fill in. config.js is gitignored.
// Each card: `name` (exact Jellyfin series/movie name) or `id`.
// Optional `title` overrides the Jellyfin name on the card. Artwork comes from Jellyfin.
window.KIDS_TV_CONFIG = {
  jellyfinUrl: "http://192.168.1.31:8096",
  apiKey: "PASTE_JELLYFIN_API_KEY",
  series: [
    { name: "Buurman en Buurman" },
    { name: "Dikkie Dik" },
    { name: "Freeks Wilde Wereld" },
    { name: "Bing" },
    { name: "Dikkertje Dap" },
    { id: "13a98cb559fa611725fbff482529291e", title: "Bluey" }
  ]
};
