import { expect, test as base, type Locator, type Page } from "@playwright/test";

export { expect, type Locator, type Page };

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    const onPageError = (error: Error) => {
      errors.push(`pageerror: ${error.message}`);
    };
    const onConsole = (message: import("@playwright/test").ConsoleMessage) => {
      if (message.type() !== "error") return;
      const location = message.location();
      const source = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : "";
      errors.push(`console.error: ${message.text()}${source}`);
    };
    const onRequest = (request: import("@playwright/test").Request) => {
      if (isAllowedLocalUrl(request.url())) return;
      errors.push(`external request: ${request.method()} ${request.url()}`);
    };
    const onWebSocket = (webSocket: import("@playwright/test").WebSocket) => {
      if (isAllowedLocalUrl(webSocket.url())) return;
      errors.push(`external websocket: ${webSocket.url()}`);
    };

    page.on("pageerror", onPageError);
    page.on("console", onConsole);
    page.on("request", onRequest);
    page.on("websocket", onWebSocket);

    await use(page);

    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("request", onRequest);
    page.off("websocket", onWebSocket);
    expect(errors).toEqual([]);
  }
});

function isAllowedLocalUrl(value: string) {
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("about:")) return true;

  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
