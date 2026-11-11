import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../supabase/functions/recipe-suggestions/index.ts", import.meta.url), "utf8");
const script = stripTypeScriptTypes(source.replace(/^import .*;\s*/m, ""));
const input = { ingredients: ["rice"], priority: ["rice"], onlyHave: true, cuisine: "Asian" };
const recipes = Array.from({ length: 3 }, (_, i) => ({
  title: `Recipe ${i}`, ingredients: ["1 cup rice"], steps: ["Cook."],
}));

function service({ user = { id: "user-1" }, reserved = true, usageError = null, upstreamStatus = 200, result = { recipes } } = {}) {
  let handler;
  const calls = [];
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only",
    OPENAI_API_KEY: "openai-secret",
    RECIPE_DAILY_LIMIT: "20",
  };
  const createClient = () => ({
    auth: { getUser: async (token) => ({ data: { user }, error: token === "valid" ? null : new Error("invalid token") }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: reserved, error: usageError };
    },
  });
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), {
      status: upstreamStatus,
      headers: { "Content-Type": "application/json" },
    });
  };
  runInNewContext(script, {
    Deno: { env: { get: (name) => env[name] }, serve: (fn) => { handler = fn; } },
    createClient, fetch, Response, console,
  });
  return {
    calls,
    request: (body = input, token = "valid") => handler(new Request("https://example.com", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })),
  };
}

test("requires authentication and validates input before reserving quota", async () => {
  const app = service();
  assert.equal((await app.request(input, "bad")).status, 401);
  assert.equal((await app.request({ ...input, priority: ["not in pantry"] })).status, 400);
  assert.equal(app.calls.length, 0);
});

test("enforces quota before contacting OpenAI", async () => {
  const app = service({ reserved: false });
  const response = await app.request();
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /20/);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].args.p_user_id, "user-1");
});

test("returns recipe data without exposing the server key", async () => {
  const app = service();
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { recipes });
  assert.equal(app.calls[1].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(app.calls[1].options.headers.Authorization, "Bearer openai-secret");
  assert.doesNotMatch(JSON.stringify(await (await app.request()).json()), /openai-secret/);
});

test("surfaces quota storage and upstream failures", async () => {
  assert.equal((await service({ usageError: { message: "database error" } }).request()).status, 500);
  assert.equal((await service({ upstreamStatus: 500 }).request()).status, 502);
  assert.equal((await service({ result: { recipes: [] } }).request()).status, 502);
});
