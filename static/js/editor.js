let editor, currentProgramId = null, currentFilename = "untitled.c", dirty = false;
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "c_syntax_studio_saved_programs";

const starterCode = `#include <stdio.h>

int main(void) {
    int number;

    printf("Enter a number: ");
    if (scanf("%d", &number) != 1) {
        printf("Invalid input.\\n");
        return 1;
    }

    if (number % 2 == 0) {
        printf("%d is even.\\n", number);
    } else {
        printf("%d is odd.\\n", number);
    }

    return 0;
}`;

require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs" } });
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create($("editor"), {
    value: starterCode,
    language: "c",
    theme: "vs",
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: "on",
    roundedSelection: false,
    scrollBeyondLastLine: false,
    wordWrap: "on",
    bracketPairColorization: { enabled: true },
    autoClosingBrackets: "always",
    autoClosingQuotes: "always",
    formatOnPaste: true,
    tabSize: 4,
    insertSpaces: true
  });
  editor.onDidChangeModelContent(() => {
    markDirty(true);
    scheduleAnalyze();
  });
  setStatus("Editor ready");
  loadPrograms();
  scheduleAnalyze();
});

function markDirty(value) {
  dirty = value;
  $("dirtyMark").style.display = value ? "inline-block" : "none";
  $("footerMessage").textContent = value ? "Unsaved changes" : "All changes saved";
}

function setStatus(text) {
  $("statusText").textContent = text;
  $("footerMessage").textContent = text;
}

function currentCode() {
  return editor ? editor.getValue() : "";
}

function setCode(code, filename) {
  if (editor) {
    editor.setValue(code);
  }
  currentFilename = filename || "untitled.c";
  currentProgramId = null;
  $("tabName").textContent = currentFilename;
  markDirty(false);
  scheduleAnalyze();
}

let analyzeTimer;
function scheduleAnalyze() {
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(analyzeCode, 700);
}

function localAnalyze(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  const stringsRemoved = withoutComments.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
  const keywords = new Set("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool _Complex _Imaginary".split(/\s+/));
  const tokens = stringsRemoved.match(/\b[A-Za-z_]\w*\b/g) || [];
  const keywordCount = tokens.filter(t => keywords.has(t)).length;
  const functions = new Set(stringsRemoved.match(/\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g) || []).size;
  const variables = new Set(stringsRemoved.match(/\b(?:char|short|int|long|float|double|unsigned|signed|_Bool)\s+(?:\*+\s*)?([A-Za-z_]\w*)/g) || []).size;
  const lines = source.split(/\r?\n/);
  return {
    lines: lines.length,
    non_empty_lines: lines.filter(l => l.trim().length > 0).length,
    comment_lines: lines.filter(l => { const t = l.trim(); return t.startsWith("//") || t.includes("/*") || t.includes("*/"); }).length,
    keywords: keywordCount,
    functions: functions,
    variables: variables,
    loops: (stringsRemoved.match(/\b(for|while|do)\b/g) || []).length,
    conditionals: (stringsRemoved.match(/\b(if|switch)\b/g) || []).length,
    estimated_complexity: 1 + (stringsRemoved.match(/\b(if|for|while|case|catch)\b|&&|\|\|/g) || []).length
  };
}

function renderStats(stats) {
  const labels = [
    ["Lines", "lines"],
    ["Non-empty lines", "non_empty_lines"],
    ["Comment lines", "comment_lines"],
    ["Keywords", "keywords"],
    ["Functions", "functions"],
    ["Variables", "variables"],
    ["Loops", "loops"],
    ["Conditionals", "conditionals"],
    ["Complexity estimate", "estimated_complexity"]
  ];
  $("statsGrid").innerHTML = labels.map(([label, key]) =>
    `<div class="stat-card"><strong>${stats[key] ?? 0}</strong><span>${label}</span></div>`
  ).join("");
}

async function analyzeCode() {
  if (!editor) return;
  const code = currentCode();
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.stats) {
        renderStats(data.stats);
        return;
      }
    }
  } catch (_) {
    // In static mode or offline, silently fallback
  }
  renderStats(localAnalyze(code));
}

async function compileRun() {
  if (!editor) return;
  $("compileBtn").disabled = true;
  $("compileBtn").textContent = "Running…";
  $("output").textContent = "Compiling and running…";
  $("errors").textContent = "";
  $("runStatus").textContent = "Working";
  showPanel("terminal");

  const code = currentCode();
  const stdin = $("stdin").value;

  // Try local backend first
  let handledLocally = false;
  try {
    const response = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, stdin })
    });
    if (response.ok || response.status === 503) {
      const data = await response.json();
      if (data.status !== "unavailable") {
        $("output").textContent = data.output || "(Program finished with no output.)";
        $("errors").textContent = data.errors || "";
        $("runStatus").textContent = data.status === "success" ? `Completed · ${data.execution_time ?? "?"}s` : (data.status || "Finished");
        $("problemText").textContent = data.errors || (data.status === "success" ? "No compiler errors reported." : "Check the terminal output.");
        if (data.status === "success") setStatus("Program completed");
        else setStatus("Compiler: " + (data.status || "error"));
        handledLocally = true;
      }
    }
  } catch (_) {
    // Not running on local Flask server
  }

  if (handledLocally) {
    $("compileBtn").disabled = false;
    $("compileBtn").textContent = "▶ Compile & Run";
    return;
  }

  // Live Cloud GCC compilation via Wandbox (powers the live GitHub Pages demo)
  try {
    setStatus("Compiling via Cloud GCC…");
    const started = performance.now();
    const response = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code,
        stdin: stdin,
        compiler: "gcc-head",
        options: "-std=c11 -Wall -O0"
      })
    });
    const data = await response.json();
    const elapsed = ((performance.now() - started) / 1000).toFixed(2);
    const out = data.program_output || (data.status === 0 ? "(Program finished with no output.)" : "");
    const err = [data.compiler_error, data.program_error].filter(Boolean).join("\n");

    $("output").textContent = out || (err ? "" : "(Program finished with no output.)");
    $("errors").textContent = err;
    $("runStatus").textContent = data.status === 0 ? `Completed · ${elapsed}s (GCC)` : "Compiler / Runtime error";
    $("problemText").textContent = data.compiler_message || data.compiler_error || (data.status === 0 ? "No compiler errors reported." : "Check terminal output.");
    setStatus(data.status === 0 ? "Program completed" : "Compilation returned warnings or errors");
  } catch (err) {
    $("output").textContent = "";
    $("errors").textContent = "Cloud compilation error: " + err.message;
    $("runStatus").textContent = "Failed";
    setStatus("Run failed");
  } finally {
    $("compileBtn").disabled = false;
    $("compileBtn").textContent = "▶ Compile & Run";
  }
}

function getLocalSavedPrograms() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalProgram(filename, code, id) {
  const programs = getLocalSavedPrograms();
  const existingIndex = id ? programs.findIndex(p => p.id === id) : -1;
  const programId = id || Date.now();
  const item = {
    id: programId,
    filename: filename || "untitled.c",
    code: code,
    updated_at: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    programs[existingIndex] = item;
  } else {
    programs.unshift(item);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(programs));
  return item;
}

async function loadPrograms() {
  try {
    const response = await fetch("/api/programs");
    if (response.ok) {
      const data = await response.json();
      renderProgramsList(data.programs, false);
      return;
    }
  } catch (_) {}

  // Fallback to localStorage
  const list = getLocalSavedPrograms().map(p => ({
    id: p.id,
    filename: p.filename,
    updated_at: p.updated_at ? p.updated_at.slice(0, 16).replace("T", " ") : "Saved"
  }));
  renderProgramsList(list, true);
}

function renderProgramsList(programs, isLocal) {
  $("savedList").innerHTML = programs.length ? "" : '<p class="muted">No saved programs yet.</p>';
  programs.forEach(p => {
    const row = document.createElement("div");
    row.className = "saved-item";
    const name = document.createElement("button");
    name.className = "saved-item";
    name.style.flex = "1";
    name.innerHTML = `<span class="file-icon">C</span><span></span>`;
    name.querySelector("span:last-child").textContent = p.filename;
    name.addEventListener("click", () => openProgram(p.id, isLocal));
    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "×";
    del.title = "Delete";
    del.addEventListener("click", async () => {
      if (!confirm("Delete " + p.filename + "?")) return;
      if (isLocal) {
        const stored = getLocalSavedPrograms().filter(item => item.id !== p.id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        loadPrograms();
      } else {
        await fetch("/api/programs/" + p.id, { method: "DELETE" });
        loadPrograms();
      }
    });
    row.append(name, del);
    $("savedList").append(row);
  });
}

async function openProgram(id, isLocal) {
  if (dirty && !confirm("Discard unsaved changes?")) return;
  if (!isLocal) {
    try {
      const response = await fetch("/api/programs/" + id);
      if (response.ok) {
        const data = await response.json();
        setCode(data.code, data.filename);
        currentProgramId = data.id;
        setStatus("Opened " + currentFilename);
        return;
      }
    } catch (_) {}
  }

  const item = getLocalSavedPrograms().find(p => p.id === id);
  if (item) {
    setCode(item.code, item.filename);
    currentProgramId = item.id;
    setStatus("Opened " + currentFilename);
  }
}

async function saveProgram() {
  const code = currentCode();
  let savedName = currentFilename || "untitled.c";
  if (!savedName.toLowerCase().endsWith(".c")) savedName += ".c";

  try {
    const response = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentProgramId, filename: savedName, code })
    });
    if (response.ok) {
      const data = await response.json();
      currentProgramId = data.id;
      currentFilename = data.filename;
      $("tabName").textContent = currentFilename;
      markDirty(false);
      setStatus("Saved " + currentFilename);
      loadPrograms();
      return;
    }
  } catch (_) {}

  // Fallback to localStorage
  const item = saveLocalProgram(savedName, code, currentProgramId);
  currentProgramId = item.id;
  currentFilename = item.filename;
  $("tabName").textContent = currentFilename;
  markDirty(false);
  setStatus("Saved " + currentFilename);
  loadPrograms();
}

function showPanel(name) {
  ["terminal", "problems", "stats"].forEach(n => {
    $(n + "Panel").classList.toggle("hidden", n !== name);
    document.querySelector(`[data-panel="${n}"]`).classList.toggle("active", n === name);
  });
}

document.querySelectorAll(".panel-tab").forEach(b => b.addEventListener("click", () => showPanel(b.dataset.panel)));
$("compileBtn").addEventListener("click", compileRun);
$("analyzeBtn").addEventListener("click", () => { analyzeCode(); showPanel("stats"); });
$("saveBtn").addEventListener("click", saveProgram);
$("refreshBtn").addEventListener("click", loadPrograms);
$("newBtn").addEventListener("click", () => {
  if (dirty && !confirm("Discard unsaved changes?")) return;
  setCode(starterCode, "untitled.c");
});

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const dark = document.body.classList.contains("dark");
  monaco.editor.setTheme(dark ? "vs-dark" : "vs");
});

$("uploadBtn").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    setCode(evt.target.result, file.name);
    setStatus("Uploaded " + file.name);
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("downloadBtn").addEventListener("click", () => {
  let filename = currentFilename || "program.c";
  if (!filename.toLowerCase().endsWith(".c")) filename += ".c";
  const blob = new Blob([currentCode()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus("Downloaded " + filename);
});

$("clearOutputBtn").addEventListener("click", () => {
  $("output").textContent = "";
  $("errors").textContent = "";
  $("runStatus").textContent = "Cleared";
});

window.addEventListener("beforeunload", e => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
