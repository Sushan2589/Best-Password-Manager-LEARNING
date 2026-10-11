import { z } from "zod";
import { formOperation, type FormChoice, type FormResult } from "../content/forms";
import { matchingOrigin, matchesCredential, canOfferLoginOrigin } from "../popup/sites/matching";
import { inlineSiteAllowed } from "./inlinePermissions";
import type { SessionReply, SessionRequest } from "../messaging/session";

const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("suggestions/prepare") }).strict(),
  z.object({ type: z.literal("suggestions/view"), request: z.string().uuid() }).strict(),
  z.object({ type: z.literal("suggestions/choose"), request: z.string().uuid(), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("suggestions/unlock"), request: z.string().uuid() }).strict(),
  z.object({ type: z.literal("suggestions/dismiss"), request: z.string().uuid() }).strict(),
]);
type Ticket = { id: string; tabId: number; windowId: number; documentId: string; origin: string; form: FormChoice; expires: number; frameDocument?: string };

// Tickets are memory-only and contain no account data. Suspension invalidates
// them safely; focusing the input again creates a fresh picker.
export function createSuggestions(session: (request: SessionRequest) => Promise<SessionReply>, open: (tabId: number, documentId: string) => Promise<void>, browser: typeof chrome = chrome) {
  const tickets = new Map<number, Ticket>();
  let revision = 0;
  async function valid(ticket: Ticket) {
    const tab = await browser.tabs.get(ticket.tabId);
    // Loading the picker iframe temporarily marks the entire tab as loading.
    // Pinned parent document + exact origin checks detect navigation instead.
    if (tickets.get(ticket.tabId) !== ticket || ticket.expires <= Date.now() || !tab.active ||
      tab.windowId !== ticket.windowId || matchingOrigin(tab.url) !== ticket.origin ||
      !await inlineSiteAllowed(ticket.origin, browser)) throw new Error("Invalid target");
    // Prove the original parent document still exists before exposing metadata.
    const results = await browser.scripting.executeScript({ target: { tabId: ticket.tabId, documentIds: [ticket.documentId] }, world: "ISOLATED", func: formOperation, args: [{ mode: "probe", origin: ticket.origin }] });
    const probe = results[0]?.result as FormResult | undefined;
    if (results.length !== 1 || results[0]?.frameId !== 0 || results[0].documentId !== ticket.documentId || !probe?.ok || !("forms" in probe) ||
      !probe.forms.some(form => form.index === ticket.form.index && form.signature === ticket.form.signature)) throw new Error("Form changed");
    if (tickets.get(ticket.tabId) !== ticket || ticket.expires <= Date.now()) throw new Error("Picker replaced");
  }
  async function handle(message: unknown, sender: chrome.runtime.MessageSender) {
    const parsed = requestSchema.safeParse(message);
    if (!parsed.success || sender.id !== browser.runtime.id || !sender.tab?.id || !sender.documentId) return { ok: false };
    const request = parsed.data;
    try {
      if (request.type === "suggestions/prepare") {
        const origin = matchingOrigin(sender.url);
        if (!origin || sender.origin !== origin || sender.frameId !== 0) return { ok: false };
        const tab = await browser.tabs.get(sender.tab.id);
        if (tab.windowId === undefined) return { ok: false };
        const ticket: Ticket = { id: crypto.randomUUID(), tabId: sender.tab.id, windowId: tab.windowId, documentId: sender.documentId,
          origin, form: { index: -1, signature: "", label: "" }, expires: Date.now() + 120000 };
        if (!tab.active || matchingOrigin(tab.url) !== origin || !await inlineSiteAllowed(origin, browser)) return { ok: false };
        const results = await browser.scripting.executeScript({ target: { tabId: ticket.tabId, documentIds: [ticket.documentId] }, world: "ISOLATED", func: formOperation, args: [{ mode: "probe", origin, focusedOnly: true }] });
        const probe = results[0]?.result as FormResult | undefined;
        if (results.length !== 1 || results[0]?.frameId !== 0 || results[0].documentId !== ticket.documentId || !probe?.ok || !("forms" in probe) || probe.forms.length !== 1) return { ok: false };
        ticket.form = probe.forms[0]!;
        revision++;
        tickets.set(ticket.tabId, ticket);
        await valid(ticket);
        return { ok: true, request: ticket.id };
      }
      const ticket = tickets.get(sender.tab.id);
      if (!ticket || ticket.id !== request.request || sender.frameId === undefined || sender.frameId === 0 ||
        sender.url !== browser.runtime.getURL(`suggestions.html?request=${ticket.id}`) ||
        (ticket.frameDocument && ticket.frameDocument !== sender.documentId)) return { ok: false };
      await valid(ticket);
      // The first extension-owned iframe binds the ticket to its document.
      if (ticket.frameDocument && ticket.frameDocument !== sender.documentId) return { ok: false };
      ticket.frameDocument = sender.documentId;
      async function notify(type: "inline/complete" | "inline/size", height?: number) {
        await browser.tabs.sendMessage(ticket!.tabId, { type, request: ticket!.id, height }, { documentId: ticket!.documentId }).catch(() => {});
      }
      if (request.type === "suggestions/dismiss") {
        tickets.delete(ticket.tabId);
        await notify("inline/complete"); return { ok: true };
      }
      if (request.type === "suggestions/view") {
        const result = await session({ type: "session/view" });
        await valid(ticket);
        if (!result.ok || result.view.state.status !== "unlocked") { await notify("inline/size", 104); return { ok: true, locked: true, accounts: [] }; }
        const accounts = result.view.items.filter(item => matchesCredential(item, ticket.origin)).slice(0, 100)
          .map(item => ({ id: item.id, title: item.title, username: item.username || item.email || "" }));
        const approvalAvailable = result.view.items.some(item => !matchesCredential(item, ticket.origin) && canOfferLoginOrigin(item.website, ticket.origin));
        result.view.items = [];
        await notify("inline/size", Math.min(220, Math.max(104, 48 + accounts.length * 66)));
        return { ok: true, locked: false, accounts, ...(approvalAvailable ? { approvalAvailable: true } : {}) };
      }
      if (request.type === "suggestions/unlock") {
        tickets.delete(ticket.tabId);
        await open(ticket.tabId, ticket.documentId);
        return { ok: true };
      }
      // Consume before the asynchronous authorization, so duplicate clicks fail.
      const version = revision;
      tickets.delete(ticket.tabId);
      const result = await session({ type: "session/entry", id: request.id });
      if (!result.ok || !result.authorized || !result.entry || !matchesCredential(result.entry, ticket.origin)) return { ok: false };
      // A consumed ticket remains valid only if no replacement picker appeared.
      if (revision !== version || tickets.has(ticket.tabId)) return { ok: false };
      tickets.set(ticket.tabId, ticket);
      await valid(ticket);
      tickets.delete(ticket.tabId);
      const results = await browser.scripting.executeScript({ target: { tabId: ticket.tabId, documentIds: [ticket.documentId] }, world: "ISOLATED", func: formOperation,
        args: [{ mode: "fill", origin: ticket.origin, index: ticket.form.index, signature: ticket.form.signature,
          username: result.entry.username || result.entry.email || "", password: result.entry.password }] });
      result.entry = null;
      const filled = results.length === 1 && results[0]?.frameId === 0 && results[0].documentId === ticket.documentId && results[0].result?.ok === true;
      if (filled) await notify("inline/complete");
      return { ok: filled };
    } catch { return { ok: false }; }
  }
  return { handle, clear: () => { revision++; tickets.clear(); }, cancelTab: (tabId: number) => { revision++; tickets.delete(tabId); } };
}
