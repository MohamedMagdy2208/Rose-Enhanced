import { PRODUCT_ICON_DATA_URL, PRODUCT_MARK, PRODUCT_NAME } from "@summonerkit/contracts";

/**
 * Shared visual mark used by every web surface. Keeping the image inline makes
 * it safe for the sandboxed desktop renderer and the authenticated League tab
 * while avoiding a filesystem path or a second icon asset.
 */
export function BrandMark({ className = "", label = false }: { className?: string; label?: boolean }) {
  const classes = ["brand-mark", className].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      role={label ? "img" : undefined}
      aria-label={label ? `${PRODUCT_NAME} ${PRODUCT_MARK} mark` : undefined}
      aria-hidden={label ? undefined : true}
    >
      <img src={PRODUCT_ICON_DATA_URL} alt="" />
    </span>
  );
}
