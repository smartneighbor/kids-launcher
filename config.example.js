// Copy to config.js and fill in. config.js is gitignored.
// Each card: `name` (exact Jellyfin series/movie name) or `id`.
// `cover` = image in this app (same covers as the tablet); `plain: true` = title/badge are already in the image.
window.KIDS_TV_CONFIG = {
  jellyfinUrl: "http://192.168.1.31:8096",
  apiKey: "PASTE_JELLYFIN_API_KEY",
  series: [
    { name: "Buurman en Buurman", cover: "images/buurman.png", plain: true },
    { name: "Dikkie Dik", cover: "images/dikkie-dik.png", plain: true },
    { name: "Freeks Wilde Wereld", cover: "images/freek-vonk.png", plain: true },
    { name: "Bing", cover: "images/bing.jpg" },
    { name: "Dikkertje Dap", cover: "images/dikkertje-dap.jpg" },
    { id: "13a98cb559fa611725fbff482529291e", title: "Bluey" }
  ]
};
