const $ = (id) => document.getElementById(id);
const load = (k, d) => JSON.parse(localStorage.getItem(k) ?? JSON.stringify(d));
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let items = load("items", []);

const SUGGESTIONS = {
  "Basics": ["salt", "pepper", "olive oil", "sunflower oil", "butter", "sugar", "flour", "vinegar", "honey", "eggs", "milk"],
  "Vegetables": ["onion", "garlic", "potato", "sweet potato", "carrot", "tomato", "bell pepper", "cucumber", "zucchini", "broccoli", "cauliflower", "spinach", "lettuce", "mushrooms", "leek", "cabbage", "corn", "peas", "green beans", "eggplant", "spring onion", "ginger", "chili pepper", "pak choi", "bean sprouts"],
  "Fruit": ["lemon", "lime", "apple", "banana", "orange", "avocado", "coconut"],
  "Meat & fish": ["chicken breast", "chicken thighs", "minced beef", "minced pork", "bacon", "sausage", "ham", "beef steak", "pork chops", "salmon", "cod", "tuna", "shrimp"],
  "Dairy": ["cheese", "parmesan", "mozzarella", "feta", "cream", "yogurt", "sour cream", "cream cheese", "coconut milk"],
  "Grains & pasta": ["rice", "jasmine rice", "basmati rice", "spaghetti", "penne", "noodles", "rice noodles", "couscous", "oats", "bread", "tortillas", "breadcrumbs", "panko"],
  "Cans & jars": ["canned tomatoes", "tomato paste", "passata", "chickpeas", "kidney beans", "lentils", "canned tuna", "stock cubes", "peanut butter", "mustard", "mayonnaise", "ketchup"],
  "Herbs": ["basil", "parsley", "coriander", "thyme", "rosemary", "oregano", "mint", "chives", "bay leaf", "dill", "lemongrass", "curry leaves"],
  "Spices (general)": ["paprika powder", "smoked paprika", "chili flakes", "cayenne", "cumin", "coriander seeds", "turmeric", "cinnamon", "nutmeg", "cloves", "mixed herbs", "italian herbs", "garlic powder", "onion powder", "black pepper corns", "mustard seeds", "vanilla"],
  "Indian": ["garam masala", "curry powder", "cardamom", "fenugreek", "tandoori masala", "tikka masala paste", "ghee", "paneer", "fennel seeds", "asafoetida"],
  "Asian": ["soy sauce", "fish sauce", "oyster sauce", "hoisin sauce", "mirin", "rice vinegar", "sesame oil", "sesame seeds", "red curry paste", "yellow curry paste", "green curry paste", "shrimp paste", "sambal", "sriracha", "gochujang", "miso", "tamarind", "star anise", "five spice", "szechuan pepper", "wasabi", "nori", "tofu", "kecap manis", "palm sugar", "cornstarch"],
  "Mexican & other": ["taco seasoning", "chipotle", "jalapeno", "salsa", "black beans", "harissa", "za'atar", "tahini"],
};

function renderSuggestions() {
  const have = new Set(items.map((i) => i.toLowerCase()));
  const box = $("suggestions");
  const open = new Set([...box.querySelectorAll("details[open]")].map((d) => d.dataset.cat));
  box.innerHTML = "";
  for (const [cat, names] of Object.entries(SUGGESTIONS)) {
    const d = document.createElement("details");
    d.dataset.cat = cat;
    d.open = open.has(cat);
    const s = document.createElement("summary");
    s.textContent = cat;
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const name of names) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (have.has(name) ? " on" : "");
      b.textContent = name;
      b.onclick = () => {
        if (have.has(name)) items = items.filter((i) => i.toLowerCase() !== name);
        else items.unshift(name);
        save("items", items);
        render();
      };
      chips.append(b);
    }
    d.append(s, chips);
    box.append(d);
  }
}

const priority = new Set();
const CATEGORY_OF = Object.fromEntries(
  Object.entries(SUGGESTIONS).flatMap(([cat, names]) => names.map((n) => [n, cat]))
);

function renderPriority() {
  const box = $("priority");
  const open = new Set([...box.querySelectorAll("details[open]")].map((d) => d.dataset.cat));
  box.innerHTML = "";
  priority.forEach((p) => !items.includes(p) && priority.delete(p));
  $("priSummary").textContent = "Prioritize ingredients" + (priority.size ? ` (${priority.size} selected)` : "");

  const groups = {};
  items.forEach((name) => {
    const cat = CATEGORY_OF[name.toLowerCase()] ?? "Other";
    (groups[cat] ??= []).push(name);
  });
  [...Object.keys(SUGGESTIONS), "Other"].filter((c) => groups[c]).forEach((cat) => {
    const d = document.createElement("details");
    d.dataset.cat = cat;
    d.open = open.has(cat);
    const s = document.createElement("summary");
    s.textContent = cat;
    const chips = document.createElement("div");
    chips.className = "chips";
    groups[cat].forEach((name) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (priority.has(name) ? " on" : "");
      b.textContent = name;
      b.onclick = () => {
        priority.has(name) ? priority.delete(name) : priority.add(name);
        renderPriority();
      };
      chips.append(b);
    });
    d.append(s, chips);
    box.append(d);
  });
}

function render() {
  renderPriority();
  $("list").innerHTML = "";
  items.forEach((name, i) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = name;
    const del = document.createElement("button");
    del.textContent = "✕";
    del.setAttribute("aria-label", `Remove ${name}`);
    del.onclick = () => {
      items.splice(i, 1);
      save("items", items);
      render();
    };
    li.append(span, del);
    $("list").append(li);
  });
  $("empty").hidden = items.length > 0;
  renderSuggestions();
}

$("addForm").onsubmit = (e) => {
  e.preventDefault();
  const v = $("newItem").value.trim();
  if (v) {
    items.unshift(v);
    save("items", items);
    $("newItem").value = "";
    render();
  }
};

const SECTIONS = ["pantry", "recipes", "saved", "marinades"];
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    SECTIONS.forEach((s) => ($(s).hidden = s !== t.dataset.tab));
  };
});

const PROVIDERS = {
  gemini: { keyLabel: "Gemini API key", keyHint: "AIza...", models: ["gemini-3.8-flash", "gemini-2.5-pro"] },
  claude: { keyLabel: "Claude API key", keyHint: "sk-ant-...", models: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-5"] },
};
const CUSTOM = "__custom";

// Migrate settings from the single-provider version.
if (localStorage.getItem("apiKey") && !localStorage.getItem("key_gemini")) {
  localStorage.setItem("key_gemini", localStorage.getItem("apiKey"));
  localStorage.setItem("model_gemini", localStorage.getItem("model") ?? "");
}

const currentProvider = () => localStorage.getItem("provider") || "gemini";

function fillSettings(p) {
  const cfg = PROVIDERS[p];
  const model = localStorage.getItem(`model_${p}`) || cfg.models[0];
  $("provider").value = p;
  $("keyLabel").textContent = cfg.keyLabel;
  $("apiKey").placeholder = cfg.keyHint;
  $("apiKey").value = localStorage.getItem(`key_${p}`) ?? "";
  const sel = $("modelSelect");
  sel.innerHTML = "";
  cfg.models.forEach((m) => sel.append(new Option(m, m)));
  sel.append(new Option("Other (type name)…", CUSTOM));
  const known = cfg.models.includes(model);
  sel.value = known ? model : CUSTOM;
  $("modelCustom").value = known ? "" : model;
  $("modelCustom").hidden = known;
}

$("provider").onchange = () => fillSettings($("provider").value);
$("modelSelect").onchange = () => ($("modelCustom").hidden = $("modelSelect").value !== CUSTOM);

$("settingsBtn").onclick = () => {
  fillSettings(currentProvider());
  $("settings").showModal();
};
$("settings").onclose = () => {
  if ($("settings").returnValue === "save") {
    const p = $("provider").value;
    const model = $("modelSelect").value === CUSTOM ? $("modelCustom").value.trim() : $("modelSelect").value;
    localStorage.setItem("provider", p);
    localStorage.setItem(`key_${p}`, $("apiKey").value.trim());
    localStorage.setItem(`model_${p}`, model);
  }
};

function showMarkdown(text) {
  // Minimal rendering: escape HTML, then handle headings, bold and bullets.
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  $("result").innerHTML = esc
    .replace(/^#{1,6}\s*(.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^[-*]\s+(.+)$/gm, "• $1")
    .replace(/\n/g, "<br>");
}

const SYSTEM = "You are a practical home-cooking assistant.";

async function askAI(prompt) {
  const p = currentProvider();
  const key = localStorage.getItem(`key_${p}`);
  const model = localStorage.getItem(`model_${p}`) || PROVIDERS[p].models[0];

  if (p === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: 4096, system: SYSTEM, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? res.statusText);
    return data.content.map((c) => c.text ?? "").join("");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? res.statusText);
  return data.candidates[0].content.parts.map((p) => p.text).join("");
}

$("askBtn").onclick = async () => {
  const key = localStorage.getItem(`key_${currentProvider()}`);
  if (!key) return $("settingsBtn").click();
  if (!items.length) return showMarkdown("Add some ingredients first.");

  const cuisine = $("cuisine").value;
  const only = $("onlyHave").checked;
  const prompt =
    `My ingredients: ${items.join(", ")}.\n` +
    `Suggest 3 to 5 recipes I can cook${cuisine ? ` in the ${cuisine} style` : ""}. ` +
    (only
      ? "Use ONLY these ingredients (plus salt, pepper, water, and basic oil). "
      : "Mark any extra ingredients I would need to buy. ") +
    (priority.size ? `Prioritize recipes that use these ingredients: ${[...priority].join(", ")}. ` : "") +
    "Return ONLY a JSON array of recipes, each shaped like " +
    '{"title": string, "ingredients": string[] (with amounts), "steps": string[]}. ' +
    "Keep steps short.";

  $("askBtn").disabled = true;
  showMarkdown("Thinking…");
  try {
    const text = await askAI(prompt);
    showRecipes(JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)));
  } catch (err) {
    showMarkdown("Error: " + err.message);
  } finally {
    $("askBtn").disabled = false;
  }
};

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

function stars(value, onChange) {
  const box = el("div", { className: "stars" });
  for (let i = 1; i <= 5; i++) {
    box.append(el("button", {
      type: "button",
      className: "star" + (i <= value ? " on" : ""),
      textContent: "★",
      title: `${i} stars`,
      onclick: () => onChange(i === value ? 0 : i),
    }));
  }
  return box;
}

function recipeBody(r) {
  return [
    el("b", {}, "Ingredients"),
    el("ul", {}, ...(r.ingredients ?? []).map((x) => el("li", {}, String(x)))),
    el("b", {}, "Steps"),
    el("ol", {}, ...(r.steps ?? []).map((x) => el("li", {}, String(x)))),
  ];
}

function showRecipes(list) {
  $("result").innerHTML = "";
  list.forEach((r) => {
    const btn = el("button", { type: "button", className: "small", textContent: "Save recipe" });
    btn.onclick = () => {
      savedRecipes.unshift({ id: Date.now() + Math.random(), title: r.title, ingredients: r.ingredients, steps: r.steps, rating: 0 });
      save("saved", savedRecipes);
      btn.disabled = true;
      btn.textContent = "Saved";
      renderSaved();
    };
    $("result").append(el("div", { className: "card" }, el("h3", {}, r.title), ...recipeBody(r), btn));
  });
}

let savedRecipes = load("saved", []);

function renderSaved() {
  const box = $("savedList");
  const open = new Set([...box.querySelectorAll("details[open]")].map((d) => d.dataset.id));
  box.innerHTML = "";
  $("savedEmpty").hidden = savedRecipes.length > 0;
  savedRecipes.forEach((r) => {
    const details = el("details", {}, el("summary", {}, "Show recipe"), ...recipeBody(r));
    details.dataset.id = r.id;
    details.open = open.has(String(r.id));
    const del = el("button", { type: "button", className: "small", textContent: "Delete" });
    del.onclick = () => {
      if (!confirm(`Delete "${r.title}"?`)) return;
      savedRecipes = savedRecipes.filter((x) => x.id !== r.id);
      save("saved", savedRecipes);
      renderSaved();
    };
    const rate = stars(r.rating, (v) => {
      r.rating = v;
      save("saved", savedRecipes);
      renderSaved();
    });
    box.append(el("div", { className: "card" }, el("div", { className: "head" }, el("h3", {}, r.title), rate), details, del));
  });
}

let marinades = load("marinades", []);
let draft = [];

function renderDraft() {
  $("mDraft").innerHTML = "";
  draft.forEach((l, i) => {
    const x = el("button", { type: "button", textContent: "✕", onclick: () => { draft.splice(i, 1); renderDraft(); } });
    $("mDraft").append(el("li", {}, el("span", {}, `${l.amount} ${l.unit} ${l.name}`), x));
  });
}

$("mAddLine").onclick = () => {
  const amount = parseFloat($("mAmount").value);
  const name = $("mItem").value.trim();
  if (!(amount > 0) || !name) {
    $("mMsg").textContent = "Enter an amount and an ingredient.";
    return;
  }
  $("mMsg").textContent = "";
  draft.push({ amount, unit: $("mUnit").value, name });
  $("mAmount").value = "";
  $("mItem").value = "";
  renderDraft();
};

$("mSave").onclick = () => {
  const grams = parseFloat($("mGrams").value);
  const meat = $("mMeat").value.trim();
  if (!(grams > 0) || !meat || !draft.length) {
    $("mMsg").textContent = "Add the meat amount, a meat, and at least one spice.";
    return;
  }
  marinades.unshift({ id: Date.now(), name: $("mName").value.trim(), grams, meat, lines: draft, rating: 0 });
  save("marinades", marinades);
  draft = [];
  $("mName").value = "";
  $("mGrams").value = "";
  $("mMeat").value = "";
  $("mMsg").textContent = "";
  renderDraft();
  renderMarinades();
};

function renderMarinades() {
  const box = $("mList");
  box.innerHTML = "";
  $("mEmpty").hidden = marinades.length > 0;
  marinades.forEach((m) => {
    const title = m.name || `${m.meat} marinade`;
    const del = el("button", { type: "button", className: "small", textContent: "Delete" });
    del.onclick = () => {
      if (!confirm(`Delete "${title}"?`)) return;
      marinades = marinades.filter((x) => x.id !== m.id);
      save("marinades", marinades);
      renderMarinades();
    };
    const rate = stars(m.rating, (v) => {
      m.rating = v;
      save("marinades", marinades);
      renderMarinades();
    });
    box.append(el("div", { className: "card" },
      el("div", { className: "head" }, el("h3", {}, title), rate),
      el("ul", {}, el("li", {}, el("b", {}, `${m.grams} g ${m.meat}`)), ...m.lines.map((l) => el("li", {}, `${l.amount} ${l.unit} ${l.name}`))),
      del));
  });
}

render();
renderSaved();
renderMarinades();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
