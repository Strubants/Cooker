import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const cuisines = ["", "Asian", "Italian", "Mexican", "Indian", "Mediterranean", "Dutch", "French"];

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const limit = Number(Deno.env.get("RECIPE_DAILY_LIMIT") || "20");
  if (!url || !serviceKey || !apiKey || !Number.isInteger(limit) || limit < 1 || limit > 10000) {
    console.error("Recipe service configuration is incomplete or invalid.");
    return json({ error: "The recipe service is not configured correctly." }, 500);
  }
  const admin = createClient(url, serviceKey);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Sign in to find recipes." }, 401);

  let input: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 30000) return json({ error: "The request is too large." }, 400);
    input = JSON.parse(text);
  } catch {
    return json({ error: "Send a valid JSON request." }, 400);
  }
  if (!input || !stringList(input.ingredients) || !input.ingredients.length ||
      !stringList(input.priority) || typeof input.onlyHave !== "boolean" ||
      typeof input.cuisine !== "string" || !cuisines.includes(input.cuisine)) {
    return json({ error: "Enter up to 100 ingredients of at most 120 characters each and valid recipe preferences." }, 400);
  }
  const ingredients = input.ingredients;
  const priority = input.priority;
  if (!priority.every((item) => ingredients.includes(item))) {
    return json({ error: "Priority ingredients must be in your ingredient list." }, 400);
  }

  const { data: reserved, error: usageError } = await admin.rpc("reserve_kookapp_recipe_request", {
    p_user_id: auth.user.id, p_limit: limit,
  });
  if (usageError) {
    console.error("Failed to reserve recipe request:", usageError.message);
    return json({ error: "Could not check the recipe usage limit." }, 500);
  }
  if (!reserved) return json({ error: `Daily recipe limit (${limit}) reached. Try again after midnight UTC.` }, 429);

  const prompt = `My ingredients: ${JSON.stringify(ingredients)}.\n` +
    `Suggest 3 to 5 recipes I can cook${input.cuisine ? ` in the ${input.cuisine} style` : ""}. ` +
    (input.onlyHave
      ? "Use ONLY these ingredients (plus salt, pepper, water, and basic oil). "
      : "Mark any extra ingredients I would need to buy. ") +
    (priority.length ? `Prioritize these ingredients: ${JSON.stringify(priority)}. ` : "") +
    "Include ingredient amounts and keep the steps short.";

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        max_tokens: 3000,
        messages: [
          { role: "system", content: "You are a practical home-cooking assistant." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "recipe_suggestions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["recipes"],
              properties: {
                recipes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "ingredients", "steps"],
                    properties: {
                      title: { type: "string" },
                      ingredients: { type: "array", items: { type: "string" } },
                      steps: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });
  } catch {
    console.error("Could not reach OpenAI.");
    return json({ error: "Could not reach the recipe service. Try again later." }, 502);
  }
  if (!response.ok) {
    console.error("OpenAI recipe request failed:", response.status);
    return json({ error: "The recipe service failed. Try again later." }, 502);
  }
  try {
    const payload = await response.json();
    const result = JSON.parse(payload.choices[0].message.content);
    if (!Array.isArray(result.recipes) || result.recipes.length < 3 || result.recipes.length > 5 ||
        !result.recipes.every((recipe: Record<string, unknown>) => recipe && typeof recipe.title === "string" &&
          stringList(recipe.ingredients) && stringList(recipe.steps))) {
      throw new Error("Invalid recipe shape");
    }
    return json({ recipes: result.recipes });
  } catch {
    console.error("OpenAI returned an invalid recipe response.");
    return json({ error: "The recipe service returned an unreadable answer. Try again." }, 502);
  }
});
