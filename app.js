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

function render() {
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

document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $("pantry").hidden = t.dataset.tab !== "pantry";
    $("recipes").hidden = t.dataset.tab !== "recipes";
  };
});

$("settingsBtn").onclick = () => {
  $("apiKey").value = localStorage.getItem("apiKey") ?? "";
  $("model").value = localStorage.getItem("model") ?? "";
  $("settings").showModal();
};
$("settings").onclose = () => {
  if ($("settings").returnValue === "save") {
    localStorage.setItem("apiKey", $("apiKey").value.trim());
    localStorage.setItem("model", $("model").value.trim());
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

$("askBtn").onclick = async () => {
  const key = localStorage.getItem("apiKey");
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
    "For each recipe give: a title, ingredients used, and short numbered steps. Be concise.";

  $("askBtn").disabled = true;
  showMarkdown("Thinking…");
  try {
    const model = localStorage.getItem("model") || "gemini-3.8-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are a practical home-cooking assistant." }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? res.statusText);
    showMarkdown(data.candidates[0].content.parts.map((p) => p.text).join(""));
  } catch (err) {
    showMarkdown("Error: " + err.message);
  } finally {
    $("askBtn").disabled = false;
  }
};

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
