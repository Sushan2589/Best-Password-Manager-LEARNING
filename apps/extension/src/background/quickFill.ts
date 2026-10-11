import { z } from "zod";
import { formOperation, type FormResult, type FormChoice } from "../content/forms";
import { matchingOrigin, matchesWebsite } from "../popup/sites/matching";
import type { SessionReply, SessionRequest } from "../messaging/session";

const ticketSchema = z.object({ id: z.string().uuid(), tabId: z.number().int(), windowId: z.number().int(),
  uiTabId: z.number().int(), origin: z.string(), documentId: z.string(), expires: z.number(),
  forms: z.array(z.object({ index: z.number().int(), signature: z.string(), label: z.string() })).max(20) });
const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fill/view"), request: z.string().uuid() }).strict(),
  z.object({ type: z.literal("fill/cancel"), request: z.string().uuid() }).strict(),
  z.object({ type: z.literal("fill/choose"), request: z.string().uuid(), id: z.string().uuid(), formIndex: z.number().int().min(0).max(19) }).strict(),
]);
export type QuickFillView = { origin: string; forms: FormChoice[] };

export function createQuickFill(session: (request: SessionRequest) => Promise<SessionReply>, browser: typeof chrome = chrome) {
  let opening = false;
  const filling = new Set<string>();
  async function open(tabId?: number, documentId?: string) {
    if (opening) return;
    opening = true;
    try {
      const tab = tabId === undefined ? (await browser.tabs.query({ active: true, currentWindow: true }))[0] : await browser.tabs.get(tabId);
      const origin = matchingOrigin(tab?.url);
      if (!tab?.id || !tab.active || tab.windowId === undefined || !origin || tab.status === "loading") return;
      const result = (await browser.scripting.executeScript({ target: documentId ? { tabId: tab.id, documentIds: [documentId] } : { tabId: tab.id, frameIds: [0] },
        world: "ISOLATED", func: formOperation, args: [{ mode: "probe", origin }] }))[0];
      const probe = result?.result as FormResult | undefined;
      if (result?.frameId !== 0 || !result.documentId || !probe?.ok || !("forms" in probe) || !probe.forms.length) return;
      const id = crypto.randomUUID();
      const picker = await browser.windows.create({ url: browser.runtime.getURL(`fill.html?request=${id}`), type: "popup", width: 420, height: 560, focused: true });
      const uiTabId = picker?.tabs?.[0]?.id;
      if (!uiTabId) return;
      // Only nonsecret target metadata is saved to memory-only session storage.
      // This keeps the chooser valid if the MV3 service worker is suspended.
      await browser.storage.session.set({ fillRequest: { id, tabId: tab.id, windowId: tab.windowId, uiTabId, origin,
        documentId: result.documentId, forms: probe.forms, expires: Date.now() + 120000 } });
    } catch { /* Unsupported/restricted pages are never filled. */ }
    finally { opening = false; }
  }
  async function handle(message: unknown, sender: chrome.runtime.MessageSender) {
    const request = requestSchema.safeParse(message);
    if (!request.success) return { ok: false };
    const stored = await browser.storage.session.get("fillRequest");
    const parsed = ticketSchema.safeParse(stored.fillRequest);
    if (!parsed.success) return { ok: false };
    const ticket = parsed.data;
    if (ticket.expires <= Date.now() || ticket.id !== request.data.request || sender.tab?.id !== ticket.uiTabId ||
      sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL(`fill.html?request=${ticket.id}`)) return { ok: false };
    if (request.data.type === "fill/cancel") { await browser.storage.session.remove("fillRequest"); return { ok: true }; }
    async function validate() {
      const current = await browser.tabs.get(ticket.tabId);
      const ui = await browser.tabs.get(ticket.uiTabId);
      if (ui.url !== browser.runtime.getURL(`fill.html?request=${ticket.id}`)) throw new Error("Chooser closed.");
      if (!current.active || current.windowId !== ticket.windowId || current.status === "loading" || matchingOrigin(current.url) !== ticket.origin || ticket.expires <= Date.now()) throw new Error("Website changed.");
      const latest = await browser.storage.session.get("fillRequest");
      const latestTicket = ticketSchema.safeParse(latest.fillRequest);
      if (!latestTicket.success || latestTicket.data.id !== ticket.id) throw new Error("Request replaced.");
    }
    let claimed = false;
    try {
      await validate();
      if (request.data.type === "fill/view") return { ok: true, origin: ticket.origin, forms: ticket.forms };
      if (filling.has(ticket.id)) return { ok: false };
      filling.add(ticket.id);
      claimed = true;
      const choice = ticket.forms[request.data.formIndex];
      if (!choice) return { ok: false };
      const result = await session({ type: "session/entry", id: request.data.id });
      if (!result.ok || !result.authorized || !result.entry || !matchesWebsite(result.entry.website, ticket.origin)) return { ok: false };
      await validate();
      // Consume before delivery to prevent retries or concurrent clicks reusing it.
      await browser.storage.session.remove("fillRequest");
      const responses = await browser.scripting.executeScript({ target: { tabId: ticket.tabId, documentIds: [ticket.documentId] }, world: "ISOLATED",
        func: formOperation, args: [{ mode: "fill", origin: ticket.origin, index: choice.index, signature: choice.signature,
          username: result.entry.username || result.entry.email || "", password: result.entry.password }] });
      result.entry = null;
      const filled = responses.length === 1 && responses[0]?.frameId === 0 && responses[0].documentId === ticket.documentId && responses[0].result?.ok === true;
      if (filled) await browser.windows.update(ticket.windowId, { focused: true });
      return { ok: filled };
    } catch { return { ok: false }; }
    finally { if (claimed) filling.delete(ticket.id); }
  }
  return { open, handle, clear: () => browser.storage.session.remove("fillRequest"), cancelTab: async (tabId: number) => {
    const stored = await browser.storage.session.get("fillRequest");
    const ticket = ticketSchema.safeParse(stored.fillRequest);
    if (ticket.success && [ticket.data.tabId, ticket.data.uiTabId].includes(tabId)) await browser.storage.session.remove("fillRequest");
  } };
}
