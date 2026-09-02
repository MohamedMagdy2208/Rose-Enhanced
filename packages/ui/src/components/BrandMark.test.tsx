import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRODUCT_ICON_DATA_URL, PRODUCT_NAME } from "@summonerkit/contracts";
import { BrandMark } from "./BrandMark";

describe("SummonerKit brand mark", () => {
  it("renders the shared inline icon without a filesystem dependency", () => {
    const markup = renderToStaticMarkup(<BrandMark label />);
    expect(markup).toContain(`aria-label="${PRODUCT_NAME} SK mark"`);
    expect(markup).toContain(`src="${PRODUCT_ICON_DATA_URL}"`);
  });
});
