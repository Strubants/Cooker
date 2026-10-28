const $ = (id) => document.getElementById(id);
const load = (k, d) => JSON.parse(localStorage.getItem(k) ?? JSON.stringify(d));
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let items = load("items", []);

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
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: localStorage.getItem("model") || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a practical home-cooking assistant." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? res.statusText);
    showMarkdown(data.choices[0].message.content);
  } catch (err) {
    showMarkdown("Error: " + err.message);
  } finally {
    $("askBtn").disabled = false;
  }
};

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
