//
// HTML for the three pages `serve-plans.ts` adds: the landing page, a rendered
// Markdown file and the bundle graph. Kept out of the server so that routing and
// rendering stay separable; the server owns paths, this module owns markup.
//
// Cytoscape and marked come from a version-pinned CDN — no build step, no
// dependency in the application.

import type { Bundle, Finding } from "./bundle.ts";

const CYTOSCAPE = "https://cdn.jsdelivr.net/npm/cytoscape@3.34.0/dist/cytoscape.min.js";
const MARKED = "https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.umd.js";

export type BundleEntry = { path: string; nodes: number; findings: number };
export type Prototype = { label: string; href: string };
export type TaskEntry = {
  key: string;
  title: string;
  area: string;
  plan: string | null;
  bundles: BundleEntry[];
  prototypes: Prototype[];
};

/** Node payload for the graph page; the body arrives with section keys stripped. */
export type GraphNode = Bundle["nodes"][number] & { href: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!));

/** `</script>` inside embedded JSON would end the block early. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const BASE_STYLE = `
  :root { --border:#e2e8f0; --ink:#0f172a; --muted:#64748b; --bg:#f8fafc; }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color:var(--ink); background:var(--bg); }
  a { color:#1d4ed8; }
  code { background:#eef2f7; padding:1px 4px; border-radius:4px; }
`;

function page(title: string, head: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${BASE_STYLE}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

// ---------------------------------------------------------------- landing page

function taskCard(task: TaskEntry): string {
  const links = [
    task.plan ? `<a href="${task.plan}">Plan</a>` : null,
    ...task.bundles.map((bundle) =>
      `<a href="/graph/${bundle.path}">Graph</a> <span class="count">${bundle.nodes} Knoten${
        bundle.findings > 0 ? `, <span class="warn">${bundle.findings} Beanstandungen</span>` : ""
      }</span>`
    ),
    ...task.prototypes.map((proto) => `<a href="${proto.href}">Prototyp: ${escapeHtml(proto.label)}</a>`),
    `<a href="/${task.area}/${task.key}/">Ordner</a>`,
  ].filter(Boolean);

  return `<li>
  <div class="key">${escapeHtml(task.key)}</div>
  <div class="title">${escapeHtml(task.title)}</div>
  <div class="links">${links.join(" · ")}</div>
</li>`;
}

export function renderIndexPage(groups: { area: string; label: string; tasks: TaskEntry[] }[]): string {
  const style = `<style>
  main { max-width:940px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:19px; margin:0 0 4px; }
  p.lead { color:var(--muted); margin:0 0 28px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted);
       margin:30px 0 10px; }
  ul { list-style:none; margin:0; padding:0; }
  li { background:#fff; border:1px solid var(--border); border-radius:10px;
       padding:12px 14px; margin-bottom:8px; }
  .key { font-weight:650; font-size:12px; letter-spacing:.04em; color:var(--muted); }
  .title { margin:1px 0 7px; }
  .links { font-size:13px; }
  .count { color:var(--muted); font-size:12px; }
  .warn { color:#b45309; }
  .empty { color:var(--muted); }
</style>`;

  const body = `<main>
<h1>Pläne, Bundles und Prototypen</h1>
<p class="lead">Alles unter <code>docs/tasks/</code> dieses Worktrees. Markdown wird gerendert, jedes Bundle hat einen Graphen.</p>
${
    groups.map((group) => `<h2>${escapeHtml(group.label)}</h2>
${
      group.tasks.length === 0
        ? '<p class="empty">nichts vorhanden</p>'
        : `<ul>\n${group.tasks.map(taskCard).join("\n")}\n</ul>`
    }`).join("\n")
  }
</main>`;

  return page("Pläne — task-untangle", style, body);
}

// ------------------------------------------------------------- markdown viewer

export function renderMarkdownPage(path: string, markdown: string): string {
  const style = `<style>
  header { background:#fff; border-bottom:1px solid var(--border); padding:9px 20px;
           font-size:12px; color:var(--muted); position:sticky; top:0; }
  article { max-width:880px; margin:0 auto; padding:8px 20px 80px; }
  article h1 { font-size:24px; margin:26px 0 10px; }
  article h2 { font-size:18px; margin:26px 0 8px; }
  article h3 { font-size:15px; margin:20px 0 6px; }
  article pre { background:#fff; border:1px solid var(--border); border-radius:8px;
                padding:12px; overflow:auto; }
  article table { border-collapse:collapse; }
  article th, article td { border:1px solid var(--border); padding:5px 9px; text-align:left; }
  article blockquote { margin:12px 0; padding:2px 14px; border-left:3px solid var(--border);
                       color:var(--muted); }
</style>
<script src="${MARKED}"></script>`;

  const body = `<header><a href="/">Übersicht</a> · ${escapeHtml(path)}</header>
<article id="out"></article>
<script>
document.getElementById("out").innerHTML = marked.parse(${embed(markdown)});
</script>`;

  return page(path, style, body);
}

// ---------------------------------------------------------------- bundle graph

export function renderGraphPage(
  bundlePath: string,
  nodes: GraphNode[],
  edges: Bundle["edges"],
  current: string[],
  findings: Finding[],
): string {
  const style = `<style>
  body { height:100vh; display:grid; grid-template-rows:auto 1fr auto; }
  header { display:flex; align-items:center; gap:16px; flex-wrap:wrap; padding:9px 16px;
           background:#fff; border-bottom:1px solid var(--border); }
  header h1 { font-size:13px; font-weight:650; margin:0; }
  header .sep { width:1px; height:20px; background:var(--border); }
  label.check { display:inline-flex; align-items:center; gap:5px; cursor:pointer; user-select:none; }
  button { font:inherit; padding:4px 9px; border:1px solid var(--border); border-radius:7px;
           background:#fff; color:inherit; cursor:pointer; }
  button:hover { background:var(--bg); }
  .swatches { display:flex; gap:10px; flex-wrap:wrap; margin-left:auto; color:var(--muted); font-size:12px; }
  .swatch { display:inline-flex; align-items:center; gap:5px; }
  .dot { width:11px; height:11px; border-radius:3px; border:1.5px solid; }

  main { display:grid; grid-template-columns:1fr 0; min-height:0; transition:grid-template-columns .18s; }
  main.open { grid-template-columns:1fr 440px; }
  #cy { min-width:0; }

  aside { overflow:auto; background:#fff; border-left:1px solid var(--border); min-width:0; }
  main:not(.open) aside { display:none; }
  aside .head { position:sticky; top:0; background:#fff; border-bottom:1px solid var(--border);
                padding:11px 16px; display:flex; align-items:start; gap:10px; }
  aside .head .id { font-weight:700; letter-spacing:.04em; }
  aside .head .meta { color:var(--muted); font-size:12px; }
  aside .body { padding:4px 16px 40px; }
  aside .body h1 { font-size:17px; margin:16px 0 8px; }
  aside .body h2 { font-size:13px; margin:18px 0 6px; color:var(--muted);
                   text-transform:uppercase; letter-spacing:.05em; }
  aside .body blockquote { margin:8px 0; padding-left:12px; border-left:3px solid var(--border);
                           color:var(--muted); }
  aside .close { margin-left:auto; }

  footer { padding:6px 16px; background:#fff; border-top:1px solid var(--border);
           color:var(--muted); font-size:12px; }
  footer .row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
  footer .warn { color:#b45309; }
  footer ol { margin:6px 0 2px; padding-left:22px; max-height:150px; overflow:auto; }
</style>
<script src="${CYTOSCAPE}"></script>
<script src="${MARKED}"></script>`;

  const body = `<header>
  <h1><a href="/">Übersicht</a> · ${escapeHtml(bundlePath)}</h1>
  <div class="sep"></div>
  <label class="check"><input type="checkbox" id="front"> nur lebende Front</label>
  <label class="check"><input type="checkbox" id="conflicts"> Konflikte</label>
  <div class="sep"></div>
  <span id="types"></span>
  <button id="reset">Ansicht zurücksetzen</button>
  <div class="swatches" id="legend"></div>
</header>

<main id="main">
  <div id="cy"></div>
  <aside>
    <div class="head">
      <div>
        <div class="id" id="p-id"></div>
        <div class="meta" id="p-meta"></div>
      </div>
      <button class="close" id="p-close">schließen</button>
    </div>
    <div class="body" id="p-body"></div>
  </aside>
</main>

<footer>
  <div class="row">
    <span id="stat-nodes"></span>
    <span id="stat-edges"></span>
    <span id="stat-findings"></span>
    <span>Klick auf einen Knoten: Text rechts, Umgebung hervorgehoben. Klick ins Leere hebt den Fokus auf.</span>
  </div>
  <ol id="finding-list" hidden></ol>
</footer>

<script>
const DATA = {
  nodes: ${embed(nodes)},
  edges: ${embed(edges)},
  current: ${embed(current)},
  findings: ${embed(findings)},
};

// The colour carries the role — type and status together, as the skill's palette
// already has it. The drafted amber is the one addition the map did not name.
const ROLES = {
  idea:       { type:"idea",     label:"Idee",                 fill:"#ffedd5", line:"#ea580c" },
  open:       { type:"question", label:"Frage offen",          fill:"#fee2e2", line:"#dc2626" },
  drafted:    { type:"question", label:"Frage entworfen",      fill:"#fef3c7", line:"#d97706" },
  answered:   { type:"question", label:"Frage beantwortet",    fill:"#dcfce7", line:"#16a34a" },
  decision:   { type:"decision", label:"Entscheidung",         fill:"#f3e8ff", line:"#9333ea" },
  superseded: { type:"decision", label:"Entscheidung ersetzt", fill:"#faf5ff", line:"#c084fc" },
  fact:       { type:"fact",     label:"Fakt",                 fill:"#e0f2fe", line:"#0284c7" },
  task:       { type:"task",     label:"Task",                 fill:"#e5e7eb", line:"#6b7280" },
};

const TYPE_LABELS = { idea:"Idee", question:"Frage", decision:"Entscheidung", fact:"Fakt", task:"Task" };

// The emoji says what a node is, the colour says how it stands — two systems for
// two facts. Taken from the skill's chat markers; only the idea has none there.
const TYPE_EMOJI = { idea:"💡", question:"❓", decision:"✅", fact:"📌", task:"🔧" };
const LIVE = { question:["open","drafted"], task:["open","running"] };

function roleOf(node) {
  if (node.type === "question") {
    return node.status === "answered" ? "answered" : node.status === "drafted" ? "drafted" : "open";
  }
  if (node.type === "decision") return node.status === "superseded" ? "superseded" : "decision";
  if (node.type === "fact") return "fact";
  if (node.type === "idea") return "idea";
  return "task";
}

const isLive = (node) => (LIVE[node.type] ?? []).includes(node.status);
// The idea carries no number, so uppercasing would turn it into "IDEA".
const labelId = (node) => (node.type === "idea" ? "" : node.id.toUpperCase() + "\\n");

let cy = null;
const hiddenTypes = new Set();

document.getElementById("legend").innerHTML = Object.values(ROLES).map((role) =>
  '<span class="swatch"><span class="dot" style="background:' + role.fill + ';border-color:' + role.line +
  '"></span>' + TYPE_EMOJI[role.type] + " " + role.label + "</span>"
).join("");

const presentTypes = [...new Set(DATA.nodes.map((node) => node.type))];
document.getElementById("types").innerHTML = presentTypes.map((type) =>
  '<label class="check"><input type="checkbox" data-type="' + type + '" checked> ' +
  (TYPE_EMOJI[type] ?? "") + " " + (TYPE_LABELS[type] ?? type) + "</label>"
).join(" ");
document.querySelectorAll("#types input").forEach((box) => {
  box.onchange = () => {
    box.checked ? hiddenTypes.delete(box.dataset.type) : hiddenTypes.add(box.dataset.type);
    render();
  };
});

function render() {
  const frontOnly = document.getElementById("front").checked;
  const withConflicts = document.getElementById("conflicts").checked;

  const visible = DATA.nodes.filter((node) => !hiddenTypes.has(node.type) && (!frontOnly || isLive(node)));
  const visibleIds = new Set(visible.map((node) => node.id));
  const drawnEdges = DATA.edges.filter((edge) =>
    (withConflicts || edge.predicate !== "conflicts_with") &&
    visibleIds.has(edge.source) && visibleIds.has(edge.target)
  );
  const hasParent = new Set(drawnEdges.filter((e) => e.predicate !== "conflicts_with").map((e) => e.target));

  const elements = [
    ...visible.map((node) => ({
      data: {
        id: node.id,
        label: (TYPE_EMOJI[node.type] ?? "•") + " " + labelId(node) + node.title,
        fill: ROLES[roleOf(node)].fill,
        line: ROLES[roleOf(node)].line,
        dashed: roleOf(node) === "superseded" ? "dashed" : "solid",
      },
    })),
    ...drawnEdges.map((edge) => ({ data: { ...edge } })),
  ];

  if (cy) cy.destroy();
  cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    style: [
      { selector: "node", style: {
          label: "data(label)", "text-wrap": "wrap", "text-max-width": "168px",
          "text-valign": "center", "font-size": "10px", "line-height": 1.35,
          // Cytoscape draws labels on a canvas with its own default stack, which
          // has no emoji font — without this the type symbol renders as a box.
          "font-family": '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", ui-sans-serif, system-ui, sans-serif',
          shape: "round-rectangle", width: 184, height: "label", padding: "9px",
          "background-color": "data(fill)", "border-color": "data(line)",
          "border-width": 1.5, "border-style": "data(dashed)", color: "#1f2937",
      }},
      { selector: "edge", style: {
          width: 1.4, "curve-style": "bezier", "target-arrow-shape": "triangle",
          "arrow-scale": 0.8, "line-color": "#cbd5e1", "target-arrow-color": "#cbd5e1",
      }},
      { selector: 'edge[predicate = "answered_by"]', style: { "line-color": "#86efac", "target-arrow-color": "#86efac" } },
      { selector: 'edge[predicate = "conflicts_with"]', style: {
          "line-color": "#dc2626", "target-arrow-color": "#dc2626", "line-style": "dashed",
      }},
      { selector: ".faded", style: { opacity: 0.12, "text-opacity": 0.25 } },
      { selector: ".here", style: { "border-width": 4, "border-color": "#0f172a" } },
      { selector: ".selected", style: { "border-width": 3 } },
    ],
    layout: {
      name: "breadthfirst", directed: true, padding: 40, spacingFactor: 1.15,
      avoidOverlap: true, animate: false,
      roots: visible.filter((node) => !hasParent.has(node.id)).map((node) => node.id),
    },
  });

  cy.nodes().filter((node) => DATA.current.includes(node.id())).addClass("here");

  cy.on("tap", "node", (event) => {
    const node = event.target;
    cy.elements().addClass("faded");
    node.predecessors().removeClass("faded");
    node.successors().removeClass("faded");
    node.removeClass("faded").addClass("selected");
    showPanel(node.id());
  });
  cy.on("tap", (event) => {
    if (event.target === cy) {
      cy.elements().removeClass("faded selected");
      closePanel();
    }
  });

  document.getElementById("stat-nodes").textContent = visible.length + " von " + DATA.nodes.length + " Knoten";
  document.getElementById("stat-edges").textContent = cy.edges().length + " Kanten";
}

function showPanel(id) {
  const node = DATA.nodes.find((candidate) => candidate.id === id);
  if (!node) return;
  document.getElementById("p-id").textContent = (TYPE_EMOJI[node.type] ?? "") + " " +
    (node.type === "idea" ? node.type : id.toUpperCase());
  document.getElementById("p-meta").innerHTML =
    (TYPE_LABELS[node.type] ?? node.type) + (node.status ? " · " + node.status : "") +
    (node.scope ? " · " + node.scope : "") + ' · <a href="' + node.href + '">Datei</a>';
  document.getElementById("p-body").innerHTML = marked.parse(node.body);
  document.getElementById("main").classList.add("open");
}

function closePanel() {
  document.getElementById("main").classList.remove("open");
}

const list = document.getElementById("finding-list");
const stat = document.getElementById("stat-findings");
if (DATA.findings.length === 0) {
  stat.textContent = "keine Beanstandungen";
} else {
  stat.innerHTML = '<a href="#" class="warn">' + DATA.findings.length + " Beanstandungen</a>";
  list.innerHTML = DATA.findings.map((finding) =>
    "<li>" + finding.kind + ": " + finding.file + " — " + finding.detail + "</li>"
  ).join("");
  stat.querySelector("a").onclick = (event) => {
    event.preventDefault();
    list.hidden = !list.hidden;
  };
}

document.getElementById("front").onchange = render;
document.getElementById("conflicts").onchange = render;
document.getElementById("reset").onclick = () => {
  cy.elements().removeClass("faded selected");
  cy.fit(undefined, 40);
};
document.getElementById("p-close").onclick = closePanel;
render();
</script>`;

  return page(`Graph — ${bundlePath}`, style, body);
}
