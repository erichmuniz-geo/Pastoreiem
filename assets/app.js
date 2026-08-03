const state = {
  book: null,
  refs: null,
  citedRefs: null,
  letters: null,
  view: "home",
  section: null,
  font: parseInt(localStorage.getItem("fontSize") || "17"),
  letterLimit: 80,
  letterQuery: "",
  year: "",
  query: "",
  citedType: "",
  citedChapter: "",
};
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  (s ?? "")
    .toString()
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
const norm = (s) =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const words = (q) => norm(q).trim().split(/\s+/).filter(Boolean);
function matches(text, q) {
  const n = norm(text),
    groups = norm(q)
      .trim()
      .split(/\s+(?:or|ou)\s+/)
      .filter(Boolean);
  return (
    groups.length > 0 &&
    groups.some((group) => words(group).every((word) => n.includes(word)))
  );
}
function snippet(text, q, len = 280) {
  text = (text || "").replace(/\s+/g, " ").trim();
  const n = norm(text),
    ws = words(q.replace(/\s+(?:OR|OU)\s+/gi, " "));
  let pos = ws.length ? n.indexOf(ws[0]) : -1;
  pos = Math.max(0, pos < 0 ? 0 : pos - 90);
  return text.slice(pos, pos + len) + (text.length > pos + len ? "..." : "");
}
function shortChapter(title) {
  return title.replace(/^(Capítulo \d+|Apêndice [A-C])\s*[—-]\s*/, "$1");
}
function load() {
  const d = window.APP_DATA;
  if (!d) {
    document.body.innerHTML =
      '<p style="padding:2rem">Não foi possível carregar os dados do aplicativo.</p>';
    return;
  }
  state.book = d.book;
  state.refs = d.refs;
  state.citedRefs = d.cited_refs || [];
  state.letters = d.letters;
  document.documentElement.style.setProperty("--fs", state.font + "px");
  renderAll();
  route();
}
function renderAll() {
  const occurrenceCount = state.citedRefs.reduce(
    (sum, item) => sum + item.occurrences.length,
    0,
  );
  $("#stats").innerHTML = [
    ["21", "seções do livro"],
    [state.citedRefs.length, `${occurrenceCount} citações localizadas`],
    [state.refs.length, "notas do caderno"],
    [state.letters.length, "cartas e documentos"],
  ]
    .map(
      (x) => `<div class="dashcard"><b>${x[0]}</b><small>${x[1]}</small></div>`,
    )
    .join("");
  const idx = state.book
    .filter((s) => s.id !== "indice")
    .map(
      (s, i) =>
        `<a class="indexitem" href="#book/${s.id}"><span class="num">${i ? i : "I"}</span><span>${esc(s.title)}</span></a>`,
    )
    .join("");
  $("#homeIndex").innerHTML = idx;
  $("#drawerIndex").innerHTML = state.book
    .map((s) => `<a href="#book/${s.id}">${esc(s.title)}</a>`)
    .join("");
  renderCitedFilters();
  renderCited();
  renderRefs();
  renderYears();
  renderLetters();
}
function setView(view) {
  state.view = view;
  $$(".section-view").forEach((x) => x.classList.remove("active"));
  const element = $(`#${view}View`);
  if (element) element.classList.add("active");
  $$(".tab[data-view]").forEach((x) =>
    x.classList.toggle("active", x.dataset.view === view),
  );
  $("#hero").classList.toggle("hidden", view !== "home");
  window.scrollTo({ top: 0 });
}
function route() {
  const hash = location.hash.slice(1);
  if (hash.startsWith("book/")) {
    setView("book");
    renderSection(hash.split("/")[1]);
  } else if (["cited", "refs", "letters", "home", "book"].includes(hash)) {
    setView(hash || "home");
    if (hash === "book") renderSection(state.section || "introducao");
  } else if (hash === "search") {
    setView("search");
  } else setView("home");
  closeDrawer();
}
function refClass(category) {
  return norm(category).startsWith("etim") ? "etimologias" : "livros";
}
function linkHTML(link) {
  const ext = link.kind === "jw" ? ' target="_blank" rel="noopener"' : "";
  return `<a href="${esc(link.href)}"${ext}>${esc(link.label)}</a>`;
}
function refHTML(reference) {
  return `<div class="refcard ${refClass(reference.category)}" id="${reference.id}"><div class="ref-category">${esc(reference.category)}</div><h4>${esc(reference.title)}</h4>${reference.location ? `<div class="loc">${esc(reference.location)}</div>` : ""}<p>${esc(reference.description)}</p><div class="links">${reference.links.map(linkHTML).join("")}</div></div>`;
}
function paraNums(reference) {
  const source = reference.location || "",
    matchesFound = [
      ...source.matchAll(
        /par(?:s|ágrafo|ágrafos)?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi,
      ),
    ],
    numbers = [];
  for (const match of matchesFound) {
    const start = +match[1],
      end = +(match[2] || match[1]);
    for (let value = start; value <= Math.min(end, start + 30); value++)
      numbers.push(value);
  }
  return [...new Set(numbers)];
}
function injectStudyRefs(pageHtml, references) {
  if (!references.length) return pageHtml;
  let html = pageHtml;
  const used = new Set();
  for (const reference of references) {
    for (const number of paraNums(reference)) {
      const expression = new RegExp(
        `(<p[^>]*>\\s*<strong>${number}\\.<\\/strong>[\\s\\S]*?<\\/p>)`,
        "i",
      );
      if (expression.test(html)) {
        html = html.replace(
          expression,
          `$1<div class="inline-xref"><div class="xref-heading">Caderno de estudo relacionado ao parágrafo ${number}</div>${refHTML(reference)}</div>`,
        );
        used.add(reference.id);
        break;
      }
    }
  }
  const rest = references.filter((reference) => !used.has(reference.id));
  if (rest.length)
    html += `<section class="page-xrefs"><h4>Caderno de estudo relacionado a esta página</h4>${rest.map(refHTML).join("")}</section>`;
  return html;
}
function occurrenceLabel(occurrence) {
  return `${shortChapter(occurrence.chapter)} · p. ${occurrence.page}${occurrence.paragraph ? ` · par. ${occurrence.paragraph}` : ""}`;
}
function bookLink(occurrence, label = occurrenceLabel(occurrence)) {
  return `<a class="go-book small" href="#book/${occurrence.section_id}" onclick="setTimeout(()=>document.getElementById('page-${occurrence.page}')?.scrollIntoView({behavior:'smooth'}),250)">${esc(label)}</a>`;
}
function citedInlineHTML(reference, occurrence) {
  const listLink = `<a class="go-book small" href="#cited" onclick="setTimeout(()=>document.getElementById('${reference.id}')?.scrollIntoView({behavior:'smooth'}),250)">Ver na lista completa</a>`;
  return `<article class="cited-inline"><div class="cited-heading"><span class="pill cited-type">${esc(reference.type)}</span><b>${esc(reference.citation)}</b></div><p>${esc(reference.description)}</p><div class="links">${reference.links.map(linkHTML).join("")}${listLink}</div></article>`;
}
function pageCitations(page) {
  const items = [];
  state.citedRefs.forEach((reference) =>
    reference.occurrences
      .filter((occurrence) => occurrence.page === page)
      .forEach((occurrence) => items.push({ reference, occurrence })),
  );
  return items;
}
function injectCitedRefs(pageHtml, items) {
  if (!items.length) return pageHtml;
  let html = pageHtml;
  const used = new Set();
  const groups = new Map();
  items.forEach((item) => {
    const key = item.occurrence.paragraph || 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  for (const [paragraph, group] of groups) {
    if (!paragraph) continue;
    const expression = new RegExp(
      `(<p[^>]*>\\s*<strong>${paragraph}\\.<\\/strong>[\\s\\S]*?<\\/p>)`,
      "i",
    );
    if (expression.test(html)) {
      html = html.replace(
        expression,
        `$1<section class="inline-cited"><div class="xref-heading">Referências citadas no parágrafo ${paragraph}</div>${group.map((item) => citedInlineHTML(item.reference, item.occurrence)).join("")}</section>`,
      );
      group.forEach((item) =>
        used.add(
          item.reference.id +
            "-" +
            item.occurrence.page +
            "-" +
            item.occurrence.paragraph,
        ),
      );
    }
  }
  const rest = items.filter(
    (item) =>
      !used.has(
        item.reference.id +
          "-" +
          item.occurrence.page +
          "-" +
          item.occurrence.paragraph,
      ),
  );
  if (rest.length)
    html += `<section class="page-cited"><h4>Referências citadas nesta página</h4>${rest.map((item) => citedInlineHTML(item.reference, item.occurrence)).join("")}</section>`;
  return html;
}
function renderSection(id) {
  state.section = id;
  const section = state.book.find((x) => x.id === id) || state.book[0];
  localStorage.setItem("lastSection", section.id);
  const pageHtml = section.pages
    .map((page) => {
      const study = state.refs.filter((reference) =>
        reference.anchor_pages.includes(page.page),
      );
      let html = injectStudyRefs(page.html, study);
      html = injectCitedRefs(html, pageCitations(page.page));
      return `<article class="pagecard" id="page-${page.page}"><span class="pagebadge">p. ${page.page}</span><div class="pagebody">${html}</div></article>`;
    })
    .join("");
  const related = section.related_letters
    .map((id) => state.letters.find((letter) => letter.id === id))
    .filter(Boolean)
    .slice(0, 15);
  $("#reader").innerHTML =
    `<div class="reader-head"><div><h2>${esc(section.title)}</h2><p>Páginas ${section.start}-${section.end} · referências exibidas no ponto correspondente</p></div><div class="reader-tools"><a class="pdfbtn" href="documentos/Pastoreiem_o_Rebanho_de_Deus_2025.pdf#page=${section.start}">Abrir PDF</a></div></div>${pageHtml}${related.length ? `<section class="letters-related"><h3>Cartas relacionadas ao capítulo</h3><p><small>Associação temática baseada no conteúdo das cartas. A orientação atual do livro-base continua sendo a referência principal.</small></p><div class="letter-list">${related.map(letterRow).join("")}</div><button class="xref-toggle" onclick="openLettersFor('${section.id}')">Pesquisar todas as cartas deste tema</button></section>` : ""}`;
  setTimeout(() => window.scrollTo({ top: 0 }), 10);
}
function renderCitedFilters() {
  const types = [...new Set(state.citedRefs.map((item) => item.type))].sort();
  $("#citedTypeFilter").innerHTML =
    '<option value="">Todos os tipos</option>' +
    types.map((type) => `<option>${esc(type)}</option>`).join("");
  const sections = state.book.filter(
    (section) =>
      section.id !== "indice" &&
      state.citedRefs.some((item) =>
        item.occurrences.some(
          (occurrence) => occurrence.section_id === section.id,
        ),
      ),
  );
  $("#citedChapterFilter").innerHTML =
    '<option value="">Todos os capítulos</option>' +
    sections
      .map(
        (section) =>
          `<option value="${section.id}">${esc(section.title)}</option>`,
      )
      .join("");
}
function filteredCited() {
  return state.citedRefs.filter(
    (item) =>
      (!state.citedType || item.type === state.citedType) &&
      (!state.citedChapter ||
        item.occurrences.some(
          (occurrence) => occurrence.section_id === state.citedChapter,
        )),
  );
}
function citedCard(item) {
  const occurrences = state.citedChapter
    ? item.occurrences.filter(
        (occurrence) => occurrence.section_id === state.citedChapter,
      )
    : item.occurrences;
  return `<article class="cited-card" id="${item.id}"><div class="cited-card-head"><span class="pill cited-type">${esc(item.type)}</span><span class="occurrence-count">${occurrences.length} local${occurrences.length === 1 ? "" : "izações"}</span></div><h3>${esc(item.citation)}</h3><p>${esc(item.description)}</p><div class="links cited-links">${item.links.map(linkHTML).join("")}</div><div class="occurrence-list">${occurrences.map((occurrence) => bookLink(occurrence)).join("")}</div></article>`;
}
function renderCited() {
  const list = filteredCited();
  $("#citedSummary").textContent = `${list.length} referência(s) exibida(s).`;
  $("#citedGrid").innerHTML =
    list.map(citedCard).join("") ||
    '<div class="empty">Nenhuma referência encontrada com estes filtros.</div>';
}
function renderRefs(list = state.refs) {
  $("#refsGrid").innerHTML =
    list
      .map(
        (reference) =>
          `<article class="ref-full" id="full-${reference.id}"><span class="pill">${esc(reference.chapter)} · p. ${reference.source_page}</span><div class="ref-category">${esc(reference.category)}</div><h3>${esc(reference.title)}</h3>${reference.location ? `<b>${esc(reference.location)}</b>` : ""}<p>${esc(reference.description)}</p><div class="links">${reference.links.map(linkHTML).join("")}</div><a class="go-book" href="#book/${chapterId(reference.chapter)}" onclick="setTimeout(()=>document.getElementById('page-${reference.anchor_pages[0]}')?.scrollIntoView({behavior:'smooth'}),250)">Ver no ponto do livro</a></article>`,
      )
      .join("") || '<div class="empty">Nenhuma referência encontrada.</div>';
}
function chapterId(chapter) {
  const value = norm(chapter),
    section = state.book.find(
      (item) =>
        norm(item.title).includes(
          value.replace(/^capitulo \d+\s*[—-]?\s*/, ""),
        ) || norm(item.title).startsWith(value),
    );
  return section ? section.id : "introducao";
}
function letterRow(letter) {
  return `<button class="letter-row" onclick="openLetter('${letter.id}')"><b>${esc(letter.subject)}</b><small>${esc(letter.date)} · ${esc(letter.code)} · p. ${letter.start_page}</small></button>`;
}
function renderYears() {
  const years = [
    ...new Set(
      state.letters
        .map((letter) => (letter.date.match(/(\d{4})/) || [])[1])
        .filter(Boolean),
    ),
  ].sort();
  $("#yearFilter").innerHTML =
    '<option value="">Todos os anos</option>' +
    years.map((year) => `<option>${year}</option>`).join("");
}
function filteredLetters() {
  return state.letters.filter(
    (letter) =>
      (!state.year || letter.date.includes(state.year)) &&
      (!state.letterQuery ||
        matches(
          letter.subject +
            " " +
            letter.date +
            " " +
            letter.code +
            " " +
            letter.text,
          state.letterQuery,
        )),
  );
}
function renderLetters() {
  const all = filteredLetters(),
    list = all.slice(0, state.letterLimit);
  $("#lettersGrid").innerHTML =
    list
      .map(
        (letter) =>
          `<article class="letter-card" onclick="openLetter('${letter.id}')"><small>${esc(letter.date)} · ${esc(letter.code)} · páginas ${letter.start_page}-${letter.end_page}</small><h3>${esc(letter.subject)}</h3><p>${esc(snippet(letter.text, state.letterQuery || letter.subject, 240))}</p></article>`,
      )
      .join("") || '<div class="empty">Nenhuma carta encontrada.</div>';
  $("#lettersMore").innerHTML =
    all.length > list.length
      ? `<button class="tab" onclick="state.letterLimit+=80;renderLetters()">Mostrar mais (${all.length - list.length})</button>`
      : `${all.length} item(ns)`;
}
window.openLetter = (id) => {
  const letter = state.letters.find((item) => item.id === id);
  if (!letter) return;
  $("#modalTitle").textContent = letter.subject;
  $("#modalMeta").textContent =
    `${letter.date} · ${letter.code} · páginas ${letter.start_page}-${letter.end_page}`;
  $("#modalBody").innerHTML =
    `<div class="modal-actions"><a href="documentos/Pastoreio_Caderno_e_Cartas.pdf#page=${letter.start_page}">Abrir página no PDF unificado</a></div><div class="letter-text">${esc(letter.text).replace(/\n/g, "<br>")}</div>`;
  $("#letterModal").classList.add("open");
};
window.openLettersFor = (id) => {
  const section = state.book.find((item) => item.id === id);
  state.letterQuery = (section.letter_query || section.title).replace(
    /\s+OR\s+/g,
    " OU ",
  );
  $("#search").value = state.letterQuery;
  $("#searchScope").value = "letters";
  state.letterLimit = 80;
  renderLetters();
  location.hash = "letters";
};
function globalSearch(q, scope) {
  state.query = q.trim();
  if (!state.query) {
    location.hash = "home";
    return;
  }
  const results = [];
  if (scope === "all" || scope === "book")
    state.book.forEach((section) =>
      section.pages.forEach((page) => {
        if (matches(page.text, state.query))
          results.push({
            type: "Livro",
            title: section.title,
            meta: `p. ${page.page}`,
            text: snippet(page.text, state.query),
            href: `#book/${section.id}`,
            page: page.page,
          });
      }),
    );
  if (scope === "all" || scope === "cited")
    state.citedRefs.forEach((item) => {
      const occurrenceText = item.occurrences
        .map((occurrence) => occurrence.chapter + " " + occurrence.context)
        .join(" ");
      if (
        matches(
          item.citation +
            " " +
            item.type +
            " " +
            item.description +
            " " +
            occurrenceText,
          state.query,
        )
      )
        results.push({
          type: "Referência citada",
          title: item.citation,
          meta: `${item.type} · ${item.occurrences.length} localização(ões)`,
          text: snippet(item.description + " " + occurrenceText, state.query),
          cited: item,
        });
    });
  if (scope === "all" || scope === "refs")
    state.refs.forEach((reference) => {
      if (
        matches(
          reference.chapter +
            " " +
            reference.title +
            " " +
            reference.location +
            " " +
            reference.description,
          state.query,
        )
      )
        results.push({
          type: "Caderno",
          title: reference.title,
          meta: `${reference.chapter} · ${reference.location || ""}`,
          text: snippet(reference.description, state.query),
          href: `#book/${chapterId(reference.chapter)}`,
          page: reference.anchor_pages[0],
          links: reference.links,
        });
    });
  if (scope === "all" || scope === "letters")
    state.letters.forEach((letter) => {
      if (
        matches(
          letter.subject +
            " " +
            letter.date +
            " " +
            letter.code +
            " " +
            letter.text,
          state.query,
        )
      )
        results.push({
          type: "Carta",
          title: letter.subject,
          meta: `${letter.date} · ${letter.code}`,
          text: snippet(letter.text, state.query),
          letter: letter.id,
        });
    });
  $("#searchSummary").textContent =
    `${results.length} resultado(s) para “${state.query}” em ${scope === "all" ? "todo o material" : scope}.`;
  $("#searchResults").innerHTML =
    results
      .slice(0, 300)
      .map(
        (result) =>
          `<article class="search-hit"><span class="pill">${result.type}</span><h3>${esc(result.title)}</h3><small>${esc(result.meta)}</small><p>${esc(result.text)}</p><div class="links">${
            result.letter
              ? `<button onclick="openLetter('${result.letter}')">Abrir carta</button>`
              : result.cited
                ? `<a href="#cited" onclick="setTimeout(()=>document.getElementById('${result.cited.id}')?.scrollIntoView({behavior:'smooth'}),250)">Abrir referência</a>${result.cited.occurrences
                    .slice(0, 3)
                    .map((occurrence) => bookLink(occurrence))
                    .join("")}`
                : `<a href="${result.href}" ${result.page ? `onclick="setTimeout(()=>document.getElementById('page-${result.page}')?.scrollIntoView({behavior:'smooth'}),250)"` : ""}>Abrir resultado</a>`
          }${result.links ? result.links.map(linkHTML).join("") : ""}</div></article>`,
      )
      .join("") ||
    '<div class="empty">Nenhum resultado. Tente menos palavras ou outra grafia.</div>';
  location.hash = "search";
  setView("search");
}
let timer;
$("#search").addEventListener("input", (event) => {
  clearTimeout(timer);
  timer = setTimeout(
    () => globalSearch(event.target.value, $("#searchScope").value),
    180,
  );
});
$("#search").addEventListener("search", (event) =>
  globalSearch(event.target.value, $("#searchScope").value),
);
$("#searchScope").addEventListener("change", (event) =>
  globalSearch($("#search").value, event.target.value),
);
$("#citedTypeFilter").addEventListener("change", (event) => {
  state.citedType = event.target.value;
  renderCited();
});
$("#citedChapterFilter").addEventListener("change", (event) => {
  state.citedChapter = event.target.value;
  renderCited();
});
$("#clearCitedFilters").onclick = () => {
  state.citedType = "";
  state.citedChapter = "";
  $("#citedTypeFilter").value = "";
  $("#citedChapterFilter").value = "";
  renderCited();
};
$("#yearFilter").addEventListener("change", (event) => {
  state.year = event.target.value;
  state.letterLimit = 80;
  renderLetters();
});
$("#clearLetterFilter").onclick = () => {
  state.year = "";
  state.letterQuery = "";
  $("#yearFilter").value = "";
  $("#search").value = "";
  renderLetters();
};
$$(".tab[data-view]").forEach(
  (button) => (button.onclick = () => (location.hash = button.dataset.view)),
);
window.addEventListener("hashchange", route);
$("#menuBtn").onclick = () => {
  $("#drawer").classList.add("open");
  $("#backdrop").classList.add("open");
};
window.closeDrawer = () => {
  $("#drawer").classList.remove("open");
  $("#backdrop").classList.remove("open");
};
$("#closeDrawer").onclick = closeDrawer;
$("#backdrop").onclick = closeDrawer;
$("#closeModal").onclick = () => $("#letterModal").classList.remove("open");
$("#letterModal").addEventListener("click", (event) => {
  if (event.target.id === "letterModal")
    event.currentTarget.classList.remove("open");
});
$("#fontBtn").onclick = () => {
  state.font = state.font >= 21 ? 15 : state.font + 2;
  localStorage.setItem("fontSize", state.font);
  document.documentElement.style.setProperty("--fs", state.font + "px");
};
if (location.protocol.startsWith("http") && "serviceWorker" in navigator)
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
load();
