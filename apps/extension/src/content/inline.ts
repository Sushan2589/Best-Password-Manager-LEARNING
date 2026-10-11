// Classic isolated-world script: account metadata stays in the extension iframe.
(() => {
  if (window !== window.top || location.protocol !== "https:") return;
  const scope = globalThis as typeof globalThis & { passwordManagerInlineStop?: () => void };
  scope.passwordManagerInlineStop?.();
  let stopped = false;
  let generation = 0;
  let anchor: HTMLInputElement | null = null;
  let host: HTMLDivElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  let ticket = "";
  let pickerHeight = 104;
  function visible(input: HTMLInputElement) {
    const style = getComputedStyle(input);
    return input.isConnected && !input.disabled && !input.readOnly && input.getClientRects().length > 0 && style.display !== "none" && style.visibility === "visible" && Number(style.opacity) !== 0;
  }
  function eligible(input: Element | null): input is HTMLInputElement {
    // Cheap event filter only. The background's shared detector decides which
    // fields belong to a supported login group before creating a picker.
    return input instanceof HTMLInputElement && visible(input) && !/\b(new-password|one-time-code)\b/.test(input.autocomplete) &&
      ["text", "email", "tel", "password"].includes(input.type);
  }
  function focusedInput() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }
  function eventInput(event: Event): Element | null { return event.composedPath().find(node => node instanceof HTMLInputElement) as HTMLInputElement | undefined ?? event.target as Element | null; }
  function close() { generation++; host?.remove(); host = null; frame = null; anchor = null; ticket = ""; }
  function position() {
    if (!host || !anchor) return;
    if (!visible(anchor)) return close();
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(380, Math.max(280, rect.width), window.innerWidth - 16);
    const height = Math.min(pickerHeight, window.innerHeight - 16);
    const below = rect.bottom + 6;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 6);
    // Avoid generating a MutationObserver loop when our own styles change.
    for (const [name, value] of Object.entries({ left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })) {
      if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value, "important");
    }
  }
  async function show(input: HTMLInputElement) {
    if (stopped || !eligible(input)) return;
    if (anchor === input && host) return;
    close(); anchor = input;
    const version = generation;
    try {
      const reply = await chrome.runtime.sendMessage({ type: "suggestions/prepare" });
      if (stopped || version !== generation || focusedInput() !== input || !reply?.ok || !/^[0-9a-f-]{36}$/.test(reply.request)) return;
      host = document.createElement("div"); host.setAttribute("data-password-manager-control", "suggestions");
      ticket = reply.request; pickerHeight = 104;
      host.style.cssText = "all:initial!important;position:fixed!important;display:block!important;z-index:2147483647!important;border:1px solid #e9dfd8!important;border-radius:10px!important;background:white!important;box-shadow:0 5px 24px #33221b24!important;overflow:hidden!important";
      const shadow = host.attachShadow({ mode: "closed" });
      frame = document.createElement("iframe"); frame.title = "Password Manager accounts";
      frame.src = chrome.runtime.getURL(`suggestions.html?request=${reply.request}`);
      frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:white;color-scheme:light";
      shadow.append(frame); document.documentElement.append(host); position();
    } catch { close(); }
  }
  const onFocus = (event: FocusEvent) => { if (event.isTrusted && eligible(eventInput(event))) void show(eventInput(event) as HTMLInputElement); else if (event.target !== host) close(); };
  const onClick = (event: MouseEvent) => {
    if (!event.isTrusted) return;
    if (eligible(eventInput(event))) void show(eventInput(event) as HTMLInputElement);
    else if (event.target !== host) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (!event.isTrusted) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown" && host && frame && focusedInput() === anchor) { event.preventDefault(); frame.focus(); }
  };
  document.addEventListener("focusin", onFocus, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", position, true); window.addEventListener("resize", position);
  const observer = new MutationObserver(position);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "style", "class", "disabled", "readonly", "autocomplete"] });
  const stop = () => {
    stopped = true; close(); observer.disconnect();
    document.removeEventListener("focusin", onFocus, true); document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", position, true); window.removeEventListener("resize", position);
    chrome.runtime.onMessage.removeListener(onMessage);
  };
  const onMessage = (message: { type?: string; request?: string; height?: number }, sender: chrome.runtime.MessageSender) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return;
    if (message?.type === "inline/stop") stop();
    if (message?.request !== ticket) return;
    if (message.type === "inline/complete") close();
    if (message.type === "inline/size" && typeof message.height === "number" && message.height >= 80 && message.height <= 220) { pickerHeight = message.height; position(); }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  scope.passwordManagerInlineStop = stop;
  window.addEventListener("pagehide", stop, { once: true });
})();
