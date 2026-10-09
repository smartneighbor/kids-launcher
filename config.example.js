// Copy to config.js and fill in. config.js is gitignored.
// Each card: `name` (exact Jellyfin series/movie name) or `id`.
// Optional `title` overrides the Jellyfin name on the card. Artwork comes from Jellyfin.
window.KIDS_TV_CONFIG = {
  jellyfinUrl: "http://192.168.1.31:8096",
  // Jellyfin user the app logs in as (watched state, resume and Next Up live in Jellyfin).
  username: "Kids",
  password: "PASTE_PASSWORD",
  series: [
    { name: "Buurman & Buurman" },
    { name: "Dikkie Dik" },
    { name: "Freeks Wilde Wereld" },
    { name: "Bing" },
    { name: "Dikkertje Dap" },
    { id: "13a98cb559fa611725fbff482529291e", title: "Bluey" }
  ]
};
