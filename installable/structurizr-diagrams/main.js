var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => StructurizrPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var http = __toESM(require("node:http"));
var import_node_child_process = require("node:child_process");
var import_node_crypto = require("node:crypto");
var DEFAULTS = { defaultWorkspace: "", structurizrCommand: "structurizr-cli", defaultHeight: 480, localUrl: "http://localhost:8080" };
var EMBED = /^!\[\]\(embed:([^{}\s)]+)(?:\{[^}]*\})?\)$/;
var StructurizrPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", DEFAULTS);
    __publicField(this, "server");
    __publicField(this, "port", 0);
    __publicField(this, "root", "");
    __publicField(this, "exports", /* @__PURE__ */ new Map());
    __publicField(this, "activeFrames", /* @__PURE__ */ new Set());
    __publicField(this, "workspaceInputs", /* @__PURE__ */ new Set());
    __publicField(this, "refreshErrors", /* @__PURE__ */ new Map());
    __publicField(this, "refreshTimer");
  }
  async onload() {
    this.root = path.join(this.app.vault.adapter.getBasePath(), this.manifest.dir, "generated");
    this.registerEditorExtension(livePreviewExtension((key, from, to, view) => this.makeViewer(key, view, from, to)));
    this.addSettingTab(new StructurizrSettings(this.app, this));
    this.addCommand({ id: "refresh-diagrams", name: "Refresh Structurizr diagrams", callback: () => this.refreshAll() });
    this.registerInterval(window.setInterval(() => void this.refreshAll(), 3e3));
    this.register(() => {
      if (this.server) this.server.close();
      fs.rmSync(this.root, { recursive: true, force: true });
    });
    this.settings = { ...DEFAULTS, ...await this.loadData() };
    fs.mkdirSync(this.root, { recursive: true });
    await this.startServer();
    this.registerMarkdownPostProcessor((el, ctx) => this.processReading(el, ctx));
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  workspaceFor(file) {
    const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : void 0;
    const selected = fm?.["structurizr-workspace"] ?? fm?.structurizrWorkspace ?? this.settings.defaultWorkspace;
    return typeof selected === "string" ? selected.trim() : "";
  }
  resolveWorkspace(input) {
    if (!input) throw new Error("No workspace selected. Set the default workspace in plugin settings or add structurizr-workspace to this note.");
    const full = path.isAbsolute(input) ? input : path.join(this.app.vault.adapter.getBasePath(), input);
    const resolved = path.resolve(full);
    if (!fs.existsSync(resolved)) throw new Error(`Workspace not found: ${input}`);
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) throw new Error(`Workspace must be a .dsl or .json file: ${input}`);
    if (!/\.(dsl|json)$/i.test(resolved)) throw new Error(`Workspace must be a .dsl or .json file: ${input}`);
    return resolved;
  }
  async outputFor(input, viewKey) {
    let source;
    try {
      source = this.resolveWorkspace(input);
    } catch (e) {
      throw e;
    }
    const dsl = source.endsWith(".json") ? source.replace(/\.json$/i, ".dsl") : source;
    const json = source.endsWith(".dsl") ? source.replace(/\.dsl$/i, ".json") : source;
    const actual = source.endsWith(".dsl") && fs.existsSync(json) ? json : source;
    let content = "";
    let dslText = "";
    let priorJson;
    try {
      content = fs.readFileSync(actual, "utf8");
      if (actual.endsWith(".json")) {
        priorJson = JSON.parse(content);
        dslText = fs.readFileSync(source, "utf8");
      } else dslText = content;
    } catch {
      throw new Error(`Invalid workspace file: ${path.basename(actual)} could not be parsed.`);
    }
    const embeddedDsl = priorJson?.properties?.["structurizr.dsl"] ? Buffer.from(priorJson.properties["structurizr.dsl"], "base64").toString("utf8") : "";
    const dslChanged = source.endsWith(".dsl") && actual.endsWith(".json") && embeddedDsl && normalizeDsl(dslText) !== normalizeDsl(embeddedDsl);
    const keys = viewKeys(dslChanged ? dslText : content, !dslChanged && actual.endsWith(".json"));
    if (viewKey && keys.size > 0 && !keys.has(viewKey)) throw new Error(`View \u201C${viewKey}\u201D was not found in workspace ${path.basename(source)}.`);
    const statA = fs.statSync(source);
    const statB = fs.existsSync(json) ? fs.statSync(json) : statA;
    const version = `${statA.mtimeMs}-${statA.size}-${statB.mtimeMs}-${statB.size}`;
    const id = (0, import_node_crypto.createHash)("sha1").update(source).digest("hex").slice(0, 12);
    let item = this.exports.get(id);
    if (!item) {
      item = { dir: path.join(this.root, id), version: "", source };
      this.exports.set(id, item);
    }
    if (item.version === version && fs.existsSync(path.join(item.dir, "index.html"))) return `http://127.0.0.1:${this.port}/${id}/`;
    if (!item.busy) {
      item.busy = (async () => {
        const mergeDir = path.join(this.root, `${id}-merge`);
        try {
          fs.rmSync(item.dir, { recursive: true, force: true });
          fs.mkdirSync(item.dir, { recursive: true });
          let exportWorkspace = actual;
          if (dslChanged) {
            fs.rmSync(mergeDir, { recursive: true, force: true });
            const generatedJson = await runCli(this.settings.structurizrCommand, ["export", "-workspace", source, "-format", "json", "-output", mergeDir]);
            const freshPath = path.join(mergeDir, "workspace.json");
            if (!fs.existsSync(freshPath)) throw new Error(`Structurizr did not create workspace.json. ${generatedJson.stdout} ${generatedJson.stderr}`);
            const fresh = JSON.parse(fs.readFileSync(freshPath, "utf8"));
            mergeManualLayout(fresh, priorJson);
            exportWorkspace = path.join(mergeDir, "merged-workspace.json");
            fs.writeFileSync(exportWorkspace, JSON.stringify(fresh), "utf8");
          }
          const output = await runCli(this.settings.structurizrCommand, ["export", "-workspace", exportWorkspace, "-format", "static", "-output", item.dir]);
          if (!fs.existsSync(path.join(item.dir, "index.html"))) throw new Error(`Structurizr export did not create index.html. ${output.stdout} ${output.stderr}`);
          const index = path.join(item.dir, "index.html");
          let html = fs.readFileSync(index, "utf8");
          const remoteThemes = /structurizr\.ui\.loadThemes\('https:\/\/static\.structurizr\.com\/themes\/',\s*function\(\)\s*\{\s*init\(\);\s*\}\);/;
          if (!remoteThemes.test(html)) throw new Error("This Structurizr exporter uses an unsupported theme loader. Export stopped to keep workspace data local.");
          html = html.replace(remoteThemes, "init();").replace("background: #ffffff;", "background: transparent;").replace("<head>", `<head>
    <script>document.cookie='structurizr.static.introductionModal=false; path=/; SameSite=Lax';</script>`);
          html += `<script>
            (function () {
              function reportView() { parent.postMessage({ type: 'structurizr-view-key', view: decodeURIComponent(location.hash.slice(1)) }, '*'); }
              window.addEventListener('load', reportView);
              window.addEventListener('hashchange', reportView);
              window.addEventListener('message', function (event) {
                if (event.source !== parent || !event.data || !window.structurizr || !structurizr.diagram) return;
                if (event.data.type === 'structurizr-zoom-in') structurizr.diagram.zoomIn();
                if (event.data.type === 'structurizr-zoom-out') structurizr.diagram.zoomOut();
                if (event.data.type === 'structurizr-fit') structurizr.diagram.zoomFitContent();
                if (event.data.type === 'structurizr-theme') structurizr.diagram.setDarkMode(event.data.theme === 'dark');
              });
              document.addEventListener('wheel', function (event) {
                if (event.ctrlKey) return;
                event.preventDefault();
                parent.postMessage({ type: 'structurizr-note-scroll', deltaY: event.deltaY }, '*');
              }, { passive: false, capture: true });
            })();
          </script>`;
          fs.writeFileSync(index, html, "utf8");
          item.version = version;
          return `http://127.0.0.1:${this.port}/${id}/`;
        } catch (error) {
          fs.rmSync(item.dir, { recursive: true, force: true });
          const detail = `${error?.stderr || error?.message || error?.stdout || error}`.trim();
          if (error?.code === "ENOENT") throw new Error(`Structurizr CLI is unavailable. Install it or set its executable path in plugin settings. ${detail}`);
          if (/DslParserException|workspace.*invalid|line \d+/i.test(detail)) throw new Error(`Invalid Structurizr workspace: ${detail}`);
          throw new Error(`Structurizr export failed: ${detail}`);
        } finally {
          fs.rmSync(mergeDir, { recursive: true, force: true });
          item.busy = void 0;
        }
      })();
    }
    return item.busy;
  }
  async startServer() {
    this.server = http.createServer((req, res) => {
      try {
        const parts = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname).split("/").filter(Boolean);
        const id = parts.shift();
        if (!id || !/^[a-f0-9]{12}$/.test(id)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const item = this.exports.get(id);
        if (!item) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const base = path.resolve(item.dir);
        const file = path.resolve(base, parts.join("/") || "index.html");
        if (!file.startsWith(base + path.sep) && file !== base) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2" };
        res.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
        fs.createReadStream(file).pipe(res);
      } catch {
        res.writeHead(400);
        res.end("Bad request");
      }
    });
    await new Promise((resolve2, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => resolve2());
    });
    this.port = this.server.address().port;
  }
  makeViewer(key, view, from = 0, to = 0, sourcePath) {
    const box = document.createElement("div");
    box.className = "structurizr-embed";
    box.dataset.view = key;
    const toolbar = box.createDiv({ cls: "structurizr-toolbar" });
    let currentKey = key;
    const viewLabel = toolbar.createSpan({ text: `View: ${key}`, cls: "structurizr-view-key" });
    const height = document.createElement("input");
    height.type = "range";
    height.min = "240";
    height.max = "900";
    height.step = "20";
    height.value = String(this.settings.defaultHeight);
    height.setAttribute("aria-label", "Diagram height");
    toolbar.append(height);
    const frame = document.createElement("iframe");
    frame.id = `structurizr-${(0, import_node_crypto.createHash)("sha1").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 10)}`;
    frame.title = `Structurizr diagram ${key}`;
    frame.loading = "lazy";
    frame.allow = "fullscreen";
    frame.style.height = `${this.settings.defaultHeight}px`;
    frame.setAttribute("scrolling", "no");
    const area = box.createDiv({ cls: "structurizr-frame-wrap" });
    area.append(frame);
    const noteFile = sourcePath ? this.app.vault.getAbstractFileByPath(sourcePath) : this.app.workspace.getActiveFile();
    const workspace = this.workspaceFor(noteFile instanceof import_obsidian.TFile ? noteFile : void 0);
    frame.dataset.workspace = workspace;
    if (workspace) this.workspaceInputs.add(workspace);
    this.activeFrames.add(frame);
    height.addEventListener("input", () => {
      frame.style.height = `${height.value}px`;
    });
    const button = (label, action, title) => {
      const b = toolbar.createEl("button", { text: label });
      b.type = "button";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("click", action);
    };
    button("\u2212", () => frame.contentWindow?.postMessage({ type: "structurizr-zoom-out" }, "*"), "Zoom out");
    button("+", () => frame.contentWindow?.postMessage({ type: "structurizr-zoom-in" }, "*"), "Zoom in");
    button("Fit", () => frame.contentWindow?.postMessage({ type: "structurizr-fit" }, "*"), "Fit diagram to view");
    button("Fullscreen", () => {
      void (box.requestFullscreen?.() ?? frame.requestFullscreen?.());
    }, "Open diagram fullscreen");
    button("Open in Structurizr local", () => {
      void window.open(`${this.settings.localUrl.replace(/\/$/, "")}/workspace/diagrams#${encodeURIComponent(currentKey)}`, "_blank");
    }, "Open this view in Structurizr local");
    if (view && to > from) button("Edit Markdown", () => {
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
      view.focus();
    }, "Edit the embed Markdown");
    const sendTheme = () => frame.contentWindow?.postMessage({ type: "structurizr-theme", theme: document.body.classList.contains("theme-dark") ? "dark" : "light" }, "*");
    const messageListener = (event) => {
      if (event.source !== frame.contentWindow || !event.data) return;
      if (event.data.type === "structurizr-view-key" && typeof event.data.view === "string" && event.data.view) {
        currentKey = event.data.view;
        viewLabel.textContent = `View: ${currentKey}`;
        box.dataset.view = currentKey;
        sendTheme();
      }
      if (event.data.type === "structurizr-note-scroll" && typeof event.data.deltaY === "number") box.closest(".markdown-preview-view, .cm-scroller")?.scrollBy(0, event.data.deltaY);
    };
    window.addEventListener("message", messageListener);
    const themeObserver = new MutationObserver(sendTheme);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    let cancelled = false;
    const load = async () => {
      try {
        const url = await this.outputFor(workspace, key);
        if (cancelled) return;
        area.querySelector(".structurizr-error")?.remove();
        frame.hidden = false;
        frame.src = `${url}index.html?iframe=${encodeURIComponent(frame.id)}#${encodeURIComponent(key)}`;
      } catch (e) {
        if (!cancelled) {
          area.querySelector(".structurizr-error")?.remove();
          area.prepend(errorNode(e.message));
          frame.hidden = true;
        }
      }
    };
    void load();
    const observer = new MutationObserver(() => {
      if (!box.isConnected) {
        cancelled = true;
        this.activeFrames.delete(frame);
        window.removeEventListener("message", messageListener);
        themeObserver.disconnect();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return box;
  }
  processReading(el, ctx) {
    for (const image of Array.from(el.querySelectorAll("img"))) {
      const src = image.getAttribute("src") || "";
      const match = src.match(/^embed:([^{}\s]+)(?:\{[^}]*\})?$/);
      if (!match) continue;
      const paragraph = image.closest("p") || image.parentElement;
      if (!paragraph) continue;
      const box = this.makeViewer(match[1], void 0, 0, 0, ctx.sourcePath);
      paragraph.replaceWith(box);
    }
  }
  async refreshAll() {
    for (const input of this.workspaceInputs) {
      try {
        const source = this.resolveWorkspace(input);
        const json = source.endsWith(".dsl") ? source.replace(/\.dsl$/i, ".json") : source;
        const a = fs.statSync(source);
        const b = fs.existsSync(json) ? fs.statSync(json) : a;
        const version = `${a.mtimeMs}-${a.size}-${b.mtimeMs}-${b.size}`;
        const id = (0, import_node_crypto.createHash)("sha1").update(source).digest("hex").slice(0, 12);
        let item = this.exports.get(id);
        if (!item) {
          item = { dir: path.join(this.root, id), version, source };
          this.exports.set(id, item);
          continue;
        }
        if (version === item.version || item.busy) continue;
        item.version = "";
        let url;
        try {
          url = await this.outputFor(source);
        } catch (error) {
          item.version = version;
          throw error;
        }
        for (const frame of this.activeFrames) {
          if (!frame.isConnected) continue;
          let frameWorkspace = "";
          try {
            frameWorkspace = this.resolveWorkspace(frame.dataset.workspace || "");
          } catch {
            continue;
          }
          if (frameWorkspace !== source) continue;
          const key = frame.closest(".structurizr-embed")?.dataset.view || frame.title.replace("Structurizr diagram ", "");
          frame.hidden = false;
          frame.parentElement?.querySelector(".structurizr-error")?.remove();
          frame.src = `${url}index.html?iframe=${encodeURIComponent(frame.id)}&t=${Date.now()}#${encodeURIComponent(key)}`;
        }
        this.refreshErrors.delete(input);
        new import_obsidian.Notice(`Structurizr workspace refreshed: ${path.basename(source)}`);
      } catch (e) {
        const message = e.message;
        if (this.refreshErrors.get(input) !== message) new import_obsidian.Notice(`Structurizr refresh failed: ${message}`);
        this.refreshErrors.set(input, message);
      }
    }
  }
};
function runCli(command, args) {
  return new Promise((resolve2, reject) => (0, import_node_child_process.execFile)(command, args, { timeout: 12e4, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      Object.assign(error, { stdout, stderr });
      reject(error);
    } else resolve2({ stdout, stderr });
  }));
}
function normalizeDsl(text) {
  return text.replace(/\r\n/g, "\n").trimEnd();
}
function mergeManualLayout(fresh, previous) {
  const oldViews = previous.views || {};
  for (const [type, views] of Object.entries(fresh.views || {})) {
    if (!Array.isArray(views)) continue;
    const byKey = new Map((oldViews[type] || []).map((view) => [view.key, view]));
    for (const view of views) {
      const old = byKey.get(view.key);
      if (!old) continue;
      const oldElements = new Map((old.elements || []).map((element) => [element.id, element]));
      for (const element of view.elements || []) {
        const prior = oldElements.get(element.id);
        if (!prior) continue;
        for (const field of ["x", "y", "width", "height"]) if (Number.isFinite(prior[field])) element[field] = prior[field];
      }
      const oldRelationships = new Map((old.relationships || []).map((relationship) => [relationship.id, relationship]));
      for (const relationship of view.relationships || []) {
        const prior = oldRelationships.get(relationship.id);
        if (prior?.vertices) relationship.vertices = prior.vertices;
      }
      if (old.automaticLayout === void 0) delete view.automaticLayout;
      else view.automaticLayout = old.automaticLayout;
    }
  }
  return fresh;
}
function viewKeys(content, json) {
  const keys = /* @__PURE__ */ new Set();
  if (!json) {
    for (const match of content.matchAll(/\bkey\s+["']([^"']+)["']/g)) keys.add(match[1]);
    return keys;
  }
  try {
    const views = JSON.parse(content).views;
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      if (typeof value.key === "string") keys.add(value.key);
      Object.values(value).forEach(visit);
    };
    visit(views);
  } catch {
  }
  return keys;
}
function errorNode(message) {
  const n = document.createElement("div");
  n.className = "structurizr-error";
  n.setAttribute("role", "alert");
  n.textContent = message;
  return n;
}
function livePreviewExtension(factory) {
  class EmbedWidget extends import_view.WidgetType {
    constructor(key, from, to, render) {
      super();
      this.key = key;
      this.from = from;
      this.to = to;
      this.render = render;
    }
    toDOM(view) {
      return this.render(this.key, this.from, this.to, view);
    }
    eq(other) {
      return this.key === other.key && this.from === other.from && this.to === other.to;
    }
    ignoreEvent() {
      return true;
    }
  }
  const field = import_state.StateField.define({
    create: (state) => build(state, factory, EmbedWidget),
    update: (value, tr) => tr.docChanged || tr.selection ? build(tr.state, factory, EmbedWidget) : value,
    provide: (value) => import_view.EditorView.decorations.from(value)
  });
  return import_state.Prec.highest(field);
}
function build(state, factory, Widget) {
  const builder = new import_state.RangeSetBuilder();
  for (let lineNo = 1; lineNo <= state.doc.lines; lineNo++) {
    const line = state.doc.line(lineNo);
    const m = line.text.match(EMBED);
    if (!m) continue;
    const selection = state.selection.main;
    if (selection.from >= line.from && selection.from <= line.to) continue;
    builder.add(line.from, line.to, import_view.Decoration.replace({ widget: new Widget(m[1], line.from, line.to, factory), block: true }));
  }
  return builder.finish();
}
var StructurizrSettings = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Default workspace").setDesc("Vault-relative path to workspace.dsl or workspace.json.").addText((t) => t.setPlaceholder("architecture/workspace.dsl").setValue(this.plugin.settings.defaultWorkspace).onChange(async (v) => {
      this.plugin.settings.defaultWorkspace = v.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Structurizr CLI command").setDesc("Executable name or full path. The CLI exports diagrams locally.").addText((t) => t.setValue(this.plugin.settings.structurizrCommand).onChange(async (v) => {
      this.plugin.settings.structurizrCommand = v.trim() || "structurizr-cli";
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Default diagram height").addText((t) => t.setValue(String(this.plugin.settings.defaultHeight)).onChange(async (v) => {
      const n = Number(v);
      if (n >= 240 && n <= 900) {
        this.plugin.settings.defaultHeight = n;
        await this.plugin.saveSettings();
      }
    }));
    new import_obsidian.Setting(containerEl).setName("Structurizr local URL").addText((t) => t.setValue(this.plugin.settings.localUrl).onChange(async (v) => {
      this.plugin.settings.localUrl = v.trim();
      await this.plugin.saveSettings();
    }));
  }
};
