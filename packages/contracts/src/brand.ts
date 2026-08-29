export const PRODUCT_NAME = "SummonerKit";
export const PRODUCT_MARK = "SK";
export const PRODUCT_AUTHOR = "Mohamed Magdy";
export const PRODUCT_TAGLINE = "A privacy-first League companion.";
export const PRODUCT_DESCRIPTION =
  "A privacy-first Windows companion for League of Legends.";
export const PRODUCT_REPOSITORY = "MohamedMagdy2208/SummonerKit";

/**
 * Small inline version of the SummonerKit chest mark.
 *
 * The packaged desktop and tray icons are generated from the high-resolution
 * artwork in docs/branding. This vector keeps the same identity available to
 * the renderer, client tab, and mobile PWA without exposing filesystem paths.
 */
const PRODUCT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3cf72"/><stop offset="1" stop-color="#b87824"/></linearGradient><linearGradient id="rose" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6f7f"/><stop offset="1" stop-color="#b9284b"/></linearGradient></defs><rect x="5" y="6" width="54" height="52" rx="12" fill="#12161d" stroke="url(#gold)" stroke-width="3"/><path d="M10 25 32 9l22 16-6 12H16Z" fill="#232834" stroke="#d8a94d" stroke-width="2"/><path d="m19 28 13-10 13 10-13 10Z" fill="url(#rose)" stroke="#ff8d8f" stroke-width="1.5"/><path d="M11 37h42v12a7 7 0 0 1-7 7H18a7 7 0 0 1-7-7Z" fill="#202630" stroke="url(#gold)" stroke-width="3"/><path d="M25 38h14v10a7 7 0 0 1-14 0Z" fill="#12161d" stroke="#d8a94d" stroke-width="2"/><circle cx="47" cy="47" r="3.5" fill="#24d7ef"/></svg>`;
export const PRODUCT_ICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(PRODUCT_ICON_SVG)}`;

export const PRODUCT_URLS = Object.freeze({
  source: `https://github.com/${PRODUCT_REPOSITORY}`,
  releases: `https://github.com/${PRODUCT_REPOSITORY}/releases`,
  userGuide: `https://github.com/${PRODUCT_REPOSITORY}/blob/main/docs/USER_GUIDE.md`,
  license: `https://github.com/${PRODUCT_REPOSITORY}/blob/main/LICENSE`,
});
