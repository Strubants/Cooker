const cloud = (() => {
  const CONFIG = Object.freeze({
    url: "https://ytcbsmqiwyezhoazeeql.supabase.co",
    publicKey: "sb_publishable_n4trcOusI8JDSYGsttUtSg_9sXyKZAa",
  });
  const LEGACY_CONFIG = "kookapp-cloud-config";
  const LEGACY_SESSION = "kookapp-cloud-session";
  const SESSION = `${LEGACY_SESSION}:${CONFIG.url}`;
  let refreshing = null;
  const read = (key) => JSON.parse(localStorage.getItem(key) || "null");
  const config = () => CONFIG;
  const session = () => read(SESSION);
  const setSession = (value) => {
    if (value) localStorage.setItem(SESSION, JSON.stringify(value));
    else localStorage.removeItem(SESSION);
  };

  const legacyConfig = read(LEGACY_CONFIG);
  if (legacyConfig?.url === CONFIG.url && localStorage.getItem(LEGACY_SESSION)) {
    if (!session()) localStorage.setItem(SESSION, localStorage.getItem(LEGACY_SESSION));
    localStorage.removeItem(LEGACY_SESSION);
  }

  async function request(path, { method = "GET", body, token } = {}) {
    const settings = config();
    let response;
    try {
      response = await fetch(settings.url + path, {
        method,
        headers: {
          apikey: settings.publicKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(`Could not reach Supabase: ${error.message}`);
    }
    const text = await response.text();
    let result = null;
    if (text) {
      try { result = JSON.parse(text); }
      catch { throw new Error(`Supabase returned an unreadable response (HTTP ${response.status}).`); }
    }
    if (!response.ok) throw new Error(result?.msg || result?.message || result?.error_description || result?.error || `Supabase returned HTTP ${response.status}.`);
    return result;
  }

  function saveSession(value) {
    if (!value?.access_token || !value?.refresh_token) throw new Error("Supabase returned an invalid session.");
    const next = { ...value, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600) };
    setSession(next);
    return next;
  }

  async function signUp(email, password) {
    const redirect = location.origin + location.pathname;
    const result = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`, {
      method: "POST", body: { email, password },
    });
    return result?.access_token ? saveSession(result) : null;
  }

  async function signIn(email, password) {
    return saveSession(await request("/auth/v1/token?grant_type=password", {
      method: "POST", body: { email, password },
    }));
  }

  async function token() {
    const current = session();
    if (!current?.refresh_token) throw new Error("Sign in first.");
    if (current.expires_at > Math.floor(Date.now() / 1000) + 60) return current.access_token;
    if (!refreshing) {
      refreshing = request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST", body: { refresh_token: current.refresh_token },
      }).then((result) => saveSession({ ...result, user: result.user || current.user }))
        .finally(() => { refreshing = null; });
    }
    return (await refreshing).access_token;
  }

  async function restore() {
    if (!session()) return null;
    const accessToken = await token();
    const user = await request("/auth/v1/user", { token: accessToken });
    const current = { ...session(), user };
    setSession(current);
    return current;
  }

  async function consumeAuthRedirect() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.has("access_token") && !params.has("error")) return false;
    history.replaceState(null, "", location.pathname + location.search);
    if (params.has("error")) throw new Error(params.get("error_description") || "Email confirmation failed.");
    saveSession({
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
      expires_in: Number(params.get("expires_in")) || 3600,
    });
    return true;
  }

  async function signOut() {
    const current = session();
    if (current) await request("/auth/v1/logout", { method: "POST", token: await token() });
    setSession(null);
  }

  function forgetSession() {
    setSession(null);
  }

  async function getData(userId) {
    const rows = await request(`/rest/v1/kookapp_data?select=data,revision&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { token: await token() });
    if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid cloud copy.");
    return rows[0] || null;
  }

  async function saveData(data, revision) {
    const rows = await request("/rest/v1/rpc/save_kookapp_data", {
      method: "POST", token: await token(), body: { p_data: data, p_expected_revision: revision },
    });
    if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid sync response.");
    return rows[0] || null;
  }

  async function recipes(input) {
    const result = await request("/functions/v1/recipe-suggestions", {
      method: "POST", token: await token(), body: input,
    });
    if (!Array.isArray(result?.recipes)) throw new Error("The recipe service returned an invalid response.");
    return result.recipes;
  }

  return { config, session, signUp, signIn, signOut, forgetSession, restore, consumeAuthRedirect, getData, saveData, recipes };
})();
