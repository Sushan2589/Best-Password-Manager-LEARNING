import { checkConnection } from "../api/connection";
import { API_ORIGIN } from "../config/runtime";
import { handleMessage } from "./handler";
import { createAuthApi } from "../api/auth";
import { createVaultApi } from "../api/vault";

const auth = createAuthApi(API_ORIGIN);
const vault = createVaultApi(API_ORIGIN);

// Register synchronously on every worker start. No sensitive state or storage.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void handleMessage(message, sender, chrome.runtime.id, chrome.runtime.getURL("popup.html"),
    () => checkConnection(API_ORIGIN), auth, vault).then(sendResponse);
  return true;
});
