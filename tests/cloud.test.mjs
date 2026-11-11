import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../cloud.js", import.meta.url), "utf8");
const project = "https://ytcbsmqiwyezhoazeeql.supabase.co";
const publicKey = "sb_publishable_n4trcOusI8JDSYGsttUtSg_9sXyKZAa";

function createCloud(initial = {}, response = { access_token: "access", refresh_token: "refresh", expires_in: 3600 }) {
  const storage = new Map(Object.entries(initial));
  const calls = [];
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const context = {
    localStorage,
    location: { origin: "https://app.example", pathname: "/Kookapp/", search: "", hash: "" },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(url.includes("/rest/v1/kookapp_data") ? [] : response), { status: 200 });
    },
    Response, URLSearchParams, Date, JSON,
  };
  const cloud = runInNewContext(`${source}\ncloud`, context);
  return { cloud, storage, calls };
}

test("signup uses the built-in project without browser configuration", async () => {
  const { cloud, calls } = createCloud();
  await cloud.signUp("cook@example.com", "password");
  assert.equal(cloud.config().url, project);
  assert.equal(cloud.config().publicKey, publicKey);
  assert.equal(typeof cloud.configure, "undefined");
  assert.equal(calls[0].url, `${project}/auth/v1/signup?redirect_to=${encodeURIComponent("https://app.example/Kookapp/")}`);
  assert.equal(calls[0].options.headers.apikey, publicKey);
  assert.ok(cloud.session());
});

test("migrates only sessions belonging to the configured project", () => {
  const session = JSON.stringify({ access_token: "old", refresh_token: "refresh" });
  const matching = createCloud({
    "kookapp-cloud-config": JSON.stringify({ url: project }),
    "kookapp-cloud-session": session,
  });
  assert.equal(matching.cloud.session().access_token, "old");
  assert.equal(matching.storage.has("kookapp-cloud-session"), false);
  matching.cloud.forgetSession();
  assert.equal(matching.cloud.session(), null);

  const other = createCloud({
    "kookapp-cloud-config": JSON.stringify({ url: "https://other.supabase.co" }),
    "kookapp-cloud-session": session,
    items: JSON.stringify(["rice"]),
  });
  assert.equal(other.cloud.session(), null);
  assert.equal(other.storage.get("kookapp-cloud-session"), session);
  assert.equal(other.storage.get("items"), JSON.stringify(["rice"]));
});

test("prefers an existing project-scoped session during migration", () => {
  const { cloud } = createCloud({
    "kookapp-cloud-config": JSON.stringify({ url: project }),
    "kookapp-cloud-session": JSON.stringify({ access_token: "old" }),
    [`kookapp-cloud-session:${project}`]: JSON.stringify({ access_token: "current" }),
  });
  assert.equal(cloud.session().access_token, "current");
});

test("refresh preserves the stored user and uses the refreshed token", async () => {
  const { cloud, calls } = createCloud({
    [`kookapp-cloud-session:${project}`]: JSON.stringify({
      access_token: "old", refresh_token: "refresh", expires_at: 1,
      user: { id: "user-1", email: "cook@example.com" },
    }),
  });
  await cloud.getData("user-1");
  assert.equal(cloud.session().access_token, "access");
  assert.equal(cloud.session().user.id, "user-1");
  assert.match(calls[0].url, /grant_type=refresh_token/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer access");
});
