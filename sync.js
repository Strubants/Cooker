const LINK_KEY = "kookapp-sync-link";
const DATA_KEYS = ["items", "groups", "cats", "saved", "marinades"];
let cloudUser = null;
let cloudChoice = null;
let syncBusy = false;
let syncAgain = false;
let syncTimer;
let restoringCloud = false;
let restorePending = false;

const link = () => load(LINK_KEY, null);
const setLink = (value) => localStorage.setItem(LINK_KEY, JSON.stringify(value));
const linkedTo = (value, user) => value && user && value.userId === user.id && value.project === cloud.config()?.url;
const snapshot = () => ({
  items: load("items", []),
  groups: load("groups", null),
  cats: load("cats", {}),
  saved: load("saved", []),
  marinades: load("marinades", []),
});

function validData(data) {
  const strings = (value) => Array.isArray(value) && value.every((x) => typeof x === "string");
  return data && strings(data.items) && (data.groups === null || strings(data.groups)) &&
    data.cats && typeof data.cats === "object" && !Array.isArray(data.cats) &&
    Object.values(data.cats).every((x) => typeof x === "string") &&
    Array.isArray(data.saved) && data.saved.every((r) =>
      r && typeof r.title === "string" && strings(r.ingredients) && strings(r.steps)) &&
    Array.isArray(data.marinades) && data.marinades.every((m) =>
      m && typeof m.meat === "string" && Array.isArray(m.lines) &&
      m.lines.every((line) => line && typeof line.name === "string" && typeof line.unit === "string"));
}

function applyData(data) {
  if (!validData(data)) throw new Error("The cloud copy is not valid Kookapp data. Your device copy was not replaced.");
  for (const key of DATA_KEYS) localStorage.setItem(key, JSON.stringify(data[key]));
  items = data.items;
  groups = data.groups ?? Object.keys(SUGGESTIONS);
  cats = data.cats;
  savedRecipes = data.saved;
  marinades = data.marinades;
  selected.clear();
  priority.clear();
  render();
  renderSaved();
  renderMarinades();
}

function syncStatus(message) {
  $("syncStatus").textContent = message;
}

function showChoice(remote, message) {
  cloudChoice = { remote };
  $("syncChoice").hidden = false;
  $("useCloud").hidden = !remote;
  syncStatus(message);
}

function clearChoice() {
  cloudChoice = null;
  $("syncChoice").hidden = true;
}

function showAccount() {
  $("authForm").hidden = !!cloudUser;
  $("signedIn").hidden = !cloudUser;
  $("forgetSession").hidden = !!cloudUser || !cloud.session();
  $("accountEmail").textContent = cloudUser ? `Signed in as ${cloudUser.email || cloudUser.id}` : "";
  $("closeAccount").textContent = cloudUser ? "Close" : "Continue without an account";
}

function queueSync() {
  if (!cloudUser || cloudChoice) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(checkSync, 900);
}

onDataChanged = () => {
  const current = link();
  if (current) setLink({ ...current, dirty: true });
  queueSync();
};

async function checkSync() {
  if (!cloudUser || cloudChoice) return;
  if (syncBusy) {
    syncAgain = true;
    return;
  }
  syncBusy = true;
  const user = cloudUser;
  const before = JSON.stringify(snapshot());
  syncStatus("Checking cloud sync...");
  try {
    const remote = await cloud.getData(user.id);
    if (cloudUser !== user) return;
    const current = link();
    if (!linkedTo(current, user)) {
      showChoice(remote, remote
        ? "Choose whether to use the existing cloud copy or upload this device."
        : "No cloud copy exists yet. Upload this device to start syncing.");
    } else if (!remote) {
      showChoice(null, "The cloud copy is missing. Choose whether to upload this device.");
    } else if (current.revision !== remote.revision && current.dirty) {
      showChoice(remote, "Both this device and the cloud have changes. Choose which copy to keep.");
    } else if (current.revision !== remote.revision) {
      if (JSON.stringify(snapshot()) !== before || link()?.dirty) {
        syncAgain = true;
      } else {
        applyData(remote.data);
        setLink({ ...current, revision: remote.revision, dirty: false });
        syncStatus(`Cloud copy loaded. Revision ${remote.revision}.`);
      }
    } else if (current.dirty) {
      const data = snapshot();
      const saved = await cloud.saveData(data, current.revision);
      if (cloudUser !== user) return;
      if (!saved) {
        showChoice(await cloud.getData(user.id), "The cloud copy changed while saving. Choose which copy to keep.");
      } else {
        const dirty = JSON.stringify(snapshot()) !== JSON.stringify(data);
        setLink({ ...current, revision: saved.revision, dirty });
        syncStatus(dirty ? "More local changes are waiting to sync." : `Synced. Revision ${saved.revision}.`);
        if (dirty) syncAgain = true;
      }
    } else {
      syncStatus(`Synced. Revision ${current.revision}.`);
    }
  } catch (error) {
    syncStatus(`Saved on this device. Cloud sync failed: ${error.message}`);
  } finally {
    syncBusy = false;
    if (syncAgain) {
      syncAgain = false;
      queueSync();
    }
  }
}

async function chooseCopy(useCloud) {
  if (!cloudUser || !cloudChoice || syncBusy) return;
  if (!confirm(useCloud
    ? "Replace the data on this device with the cloud copy?"
    : "Replace the cloud copy with the data on this device?")) return;
  syncBusy = true;
  const user = cloudUser;
  const expected = cloudChoice.remote?.revision ?? null;
  const before = JSON.stringify(snapshot());
  try {
    const latest = await cloud.getData(user.id);
    if ((latest?.revision ?? null) !== expected) {
      showChoice(latest, "The cloud copy changed. Review your choice and try again.");
      return;
    }
    if (useCloud) {
      if (!latest) throw new Error("The cloud copy no longer exists.");
      if (JSON.stringify(snapshot()) !== before) throw new Error("Device data changed. Review your choice and try again.");
      applyData(latest.data);
      setLink({ project: cloud.config().url, userId: user.id, revision: latest.revision, dirty: false });
      syncStatus(`Cloud copy loaded. Revision ${latest.revision}.`);
    } else {
      const data = snapshot();
      const saved = await cloud.saveData(data, expected);
      if (!saved) {
        showChoice(await cloud.getData(user.id), "The cloud copy changed. Review your choice and try again.");
        return;
      }
      const dirty = JSON.stringify(snapshot()) !== JSON.stringify(data);
      setLink({ project: cloud.config().url, userId: user.id, revision: saved.revision, dirty });
      syncStatus(dirty ? "More local changes are waiting to sync." : `Synced. Revision ${saved.revision}.`);
      if (dirty) syncAgain = true;
    }
    clearChoice();
  } catch (error) {
    syncStatus(`Could not apply your choice: ${error.message}`);
  } finally {
    syncBusy = false;
    if (syncAgain) {
      syncAgain = false;
      queueSync();
    }
  }
}

$("settingsBtn").onclick = () => {
  showAccount();
  if (!$("settings").open) $("settings").showModal();
};

async function authenticate(signUp) {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!$("authForm").reportValidity()) return;
  $("authForm").querySelectorAll("button").forEach((button) => { button.disabled = true; });
  $("accountStatus").textContent = signUp ? "Creating account..." : "Signing in...";
  try {
    const result = signUp ? await cloud.signUp(email, password) : await cloud.signIn(email, password);
    $("authPassword").value = "";
    if (!result) {
      $("accountStatus").textContent = "Check your email to confirm your account, then sign in.";
      return;
    }
    const current = await cloud.restore();
    cloudUser = current.user;
    restorePending = false;
    $("accountStatus").textContent = "Signed in.";
    showAccount();
    await checkSync();
  } catch (error) {
    $("accountStatus").textContent = error.message;
  } finally {
    $("authForm").querySelectorAll("button").forEach((button) => { button.disabled = false; });
  }
}

$("authForm").onsubmit = (event) => { event.preventDefault(); authenticate(false); };
$("signUp").onclick = () => authenticate(true);
$("forgetSession").onclick = () => {
  if (!confirm("Remove the stored session from this device? This does not sign it out on Supabase.")) return;
  cloud.forgetSession();
  showAccount();
  $("accountStatus").textContent = "Session removed from this device. Your data remains here.";
};
$("useCloud").onclick = () => chooseCopy(true);
$("uploadLocal").onclick = () => chooseCopy(false);
$("syncNow").onclick = () => {
  clearChoice();
  checkSync();
};
$("signOut").onclick = async () => {
  if (syncBusy) {
    syncStatus("Wait for the current sync to finish before signing out.");
    return;
  }
  clearTimeout(syncTimer);
  syncBusy = true;
  try {
    await cloud.signOut();
    cloudUser = null;
    restorePending = false;
    clearChoice();
    showAccount();
    $("accountStatus").textContent = "Signed out. Your data remains on this device.";
  } catch (error) {
    $("accountStatus").textContent = `Could not sign out: ${error.message}`;
    if (confirm("Could not sign out from Supabase. Remove the session from this device anyway?")) {
      cloud.forgetSession();
      cloudUser = null;
      restorePending = false;
      clearChoice();
      showAccount();
      $("accountStatus").textContent = "Session removed from this device; remote sign-out could not be confirmed.";
    }
  } finally {
    syncBusy = false;
    if (cloudUser) queueSync();
  }
};

window.addEventListener("online", () => {
  if (restorePending) startCloud();
  else if (!cloudChoice) checkSync();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !cloudChoice) checkSync();
});

async function startCloud() {
  if (restoringCloud) return;
  restoringCloud = true;
  showAccount();
  try {
    const confirmed = await cloud.consumeAuthRedirect();
    const current = await cloud.restore();
    if (current) {
      restorePending = false;
      cloudUser = current.user;
      $("accountStatus").textContent = "Signed in.";
      showAccount();
      await checkSync();
      if (confirmed && cloudChoice) $("settingsBtn").click();
    } else {
      $("accountStatus").textContent = "Sign in to sync your data and find recipes.";
      $("settingsBtn").click();
    }
  } catch (error) {
    const stored = cloud.session();
    if (stored?.user && error.message.startsWith("Could not reach Supabase:")) {
      cloudUser = stored.user;
      restorePending = true;
      $("accountStatus").textContent = `Signed in on this device. Could not restore your session: ${error.message}`;
      syncStatus("Offline. Changes remain on this device until the connection is restored.");
      showAccount();
    } else {
      restorePending = false;
      $("accountStatus").textContent = `Account connection failed: ${error.message}`;
      $("settingsBtn").click();
    }
  } finally {
    restoringCloud = false;
  }
}
startCloud();
