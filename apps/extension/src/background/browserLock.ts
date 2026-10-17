// Normal browser windows define the session boundary. An extension chooser or
// Chrome background mode must not keep a vault alive after the browser closes.
export function registerBrowserLock(clear: () => Promise<void>, browser: typeof chrome = chrome) {
  browser.windows.onRemoved.addListener(() => {
    void browser.windows.getAll({ windowTypes: ["normal"] }).then(windows => {
      if (windows.length === 0) return clear();
    }).catch(() => clear().catch(() => {}));
  });
}
