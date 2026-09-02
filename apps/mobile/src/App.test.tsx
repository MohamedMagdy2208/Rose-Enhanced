// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

let root: Root;

beforeEach(async () => {
  window.history.replaceState({}, "", "/");
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<App />));
});

afterEach(async () => {
  await act(async () => root.unmount());
});

describe("mobile QR navigation", () => {
  it("enables pairing after same-document QR navigation without a reload", async () => {
    const pairingButton = document.querySelector<HTMLButtonElement>(".pair-card button")!;
    expect(pairingButton.disabled).toBe(true);

    await act(async () => {
      window.history.pushState({}, "", "/#room=room-12345678&secret=one-time-secret&relay=https%3A%2F%2Frelay.example%2F&key=desktop-key");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(pairingButton.disabled).toBe(false);
    expect(document.querySelector("#pair-title")?.textContent).toBe("Connect this phone");
  });
});
