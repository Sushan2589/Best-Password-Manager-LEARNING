import "./style.css";

const request = new URLSearchParams(location.search).get("request");
const container = document.getElementById("accounts")!;
let busy = false;
function action(label: string, run: () => Promise<void>, title?: string, username?: string) {
  const button = document.createElement("button");
  button.type = "button"; button.setAttribute("aria-label", label);
  if (title !== undefined) {
    const icon = document.createElement("span"); icon.className = "icon"; icon.textContent = title.slice(0, 1).toUpperCase() || "●"; icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span"); const name = document.createElement("strong"); name.textContent = title;
    const detail = document.createElement("small"); detail.textContent = username || "Saved account"; text.append(name, detail); button.append(icon, text);
  } else button.textContent = label;
  button.addEventListener("click", event => { if (!event.isTrusted || busy) return; busy = true; button.disabled = true; void run().catch(failed); });
  return button;
}
function failed() { container.replaceChildren(); container.textContent = "Picker expired. Click the login field again."; }
async function start() {
  if (!request || !/^[0-9a-f-]{36}$/.test(request) || window.top === window) return failed();
  const result = await chrome.runtime.sendMessage({ type: "suggestions/view", request });
  if (!result?.ok) return failed();
  container.replaceChildren(); container.removeAttribute("role");
  if (result.locked) {
    container.append(action("Unlock in Password Manager", async () => {
      const reply = await chrome.runtime.sendMessage({ type: "suggestions/unlock", request });
      if (!reply?.ok) return failed();
      container.textContent = "Continue in the extension window.";
    }));
    return;
  }
  if (!result.accounts.length && result.approvalAvailable) {
    container.append(action("Review login website", async () => {
      const reply = await chrome.runtime.sendMessage({ type: "suggestions/unlock", request });
      if (!reply?.ok) return failed();
      container.textContent = "Review the website in the extension window.";
    }));
    return;
  }
  if (!result.accounts.length) { container.textContent = "No saved accounts for this website."; return; }
  container.setAttribute("role", "list"); container.setAttribute("aria-label", "Matching accounts");
  for (const account of result.accounts as Array<{ id: string; title: string; username: string }>) {
    const row = document.createElement("div"); row.setAttribute("role", "listitem");
    row.append(action(`${account.title} ${account.username}`.trim(), async () => {
      const reply = await chrome.runtime.sendMessage({ type: "suggestions/choose", request, id: account.id });
      if (!reply?.ok) return failed();
      container.replaceChildren(); container.textContent = "Login fields filled.";
    }, account.title, account.username)); container.append(row);
  }
}
document.addEventListener("keydown", event => {
  if (!event.isTrusted) return;
  const buttons = [...container.querySelectorAll("button")];
  if (event.key === "Escape") { void chrome.runtime.sendMessage({ type: "suggestions/dismiss", request }); return; }
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault(); const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && ["session/destroyed", "session/changed"].includes(message?.type) && message.status !== "unlocked") {
    container.replaceChildren(); container.textContent = "Vault locked. Click the login field again.";
  }
});
void start().catch(failed);
