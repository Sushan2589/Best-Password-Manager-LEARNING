// No imports: this is a classic isolated-world content-script bundle.
(() => {
  if (window !== window.top || location.protocol !== "https:") return;
  const scope = globalThis as typeof globalThis & { passwordManagerInlineStop?: () => void };
  scope.passwordManagerInlineStop?.();
  const host = document.createElement("div");
  host.setAttribute("data-password-manager-control", "fill");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = ":host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647}button{font:600 12px system-ui;color:#fff;background:#c45b48;border:1px solid #a64534;border-radius:8px;padding:10px 14px;cursor:pointer;box-shadow:0 2px 8px #0002}button:focus-visible{outline:3px solid #18214d;outline-offset:3px}";
  const button = document.createElement("button");
  button.type = "button"; button.textContent = "Fill with Password Manager";
  button.addEventListener("click", event => {
    if (!event.isTrusted) return;
    void chrome.runtime.sendMessage({ type: "inline/open" }).catch(() => {});
  });
  shadow.append(style, button);
  function update() {
    const supported = [...document.querySelectorAll<HTMLInputElement>('form input[type="password"]')].some(input => {
      const style = getComputedStyle(input);
      return !input.disabled && !input.readOnly && input.autocomplete !== "new-password" && input.getClientRects().length > 0 &&
        style.display !== "none" && style.visibility === "visible" && style.opacity !== "0";
    });
    if (supported && !host.isConnected) document.documentElement.append(host);
    if (!supported) host.remove();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(records => {
    if (records.every(record => record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every(node => node === host))) return;
    clearTimeout(timer); timer = setTimeout(update, 150);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "style", "class", "disabled", "readonly", "autocomplete"] });
  const stopped = () => { observer.disconnect(); clearTimeout(timer); host.remove(); };
  scope.passwordManagerInlineStop = stopped;
  chrome.runtime.onMessage.addListener(message => { if (message?.type === "inline/stop") stopped(); });
  window.addEventListener("pagehide", stopped, { once: true });
  update();
})();
