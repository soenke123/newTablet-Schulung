# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This repo contains two things:

- **`wortwelten-v2/`** — the active project. A multi-file German-language educational web app that teaches school students how LLMs work, in three progressive phases, with a center "machine" card plus a fixed, color-coded explanation list on the right ("Panel"/"Leuchtende Kategorien"). This is what to work on unless told otherwise.
- **`Wortwelten.html`** — the original single-file prototype that `wortwelten-v2/` superseded. Kept on disk as a reference/fallback, not under active development. See "The old prototype" section below.

Both are pedagogical: a small, fully transparent, fully inspectable toy language model (no external ML libraries — everything hand-rolled in vanilla JS) that lets students pick which German texts "feed the AI" and then see exactly how answers are produced, as a contrast to a real LLM's opacity.

## wortwelten-v2/ (active project)

Multi-file vanilla HTML/CSS/JS app, no build step, no bundler, no npm, no ES modules — plain `<script>` tags in dependency order (see `index.html`). Opens directly via `file://` (double-click `wortwelten-v2/index.html`) or any static file server; nothing in the app requires a server.

### Running / developing

No build/install/lint/test tooling. Edit a file, reload the browser. To verify a change, actually drive the app in a browser (there is no other way to exercise most of this logic):
- Toggle texts in the "📚 Textwelten" drawer and confirm the active-text count updates and all three phases react.
- Phase 1 (`Frei schreiben`): start generation, check all three list items update live, check the generated words are tinted by source text, move the n-slider (1–6) and the Zufall/temperature slider.
- Phase 2 (`Frage & Antwort`): ask a question that matches content and one that doesn't (canned-response path), check all four list items, open the wide "Wortkarte" card at the bottom and let the layout animate, use "Dieselbe Frage neu beantworten".
- Phase 3 (`Echtes Netz`): start training from the center bar, **stop it again** (see the live-refresh rule below — this broke once), watch the loss sparkline fall, check all five list items (prediction output should visibly sharpen as training progresses), open the wide "Das Netz von innen" card and click neurons while training runs, change the text selection and confirm the "Jetzt neu trainieren" banner appears instead of an automatic (janky) rebuild.
- Collapse/expand individual explanation cards, use "nur dies" and "alle auf-/zuklappen", reload and confirm the open/closed state survives (localStorage `wortwelten-v2-panel-offen`).
- In the Textwelten drawer: open "lesen & bearbeiten" on a built-in text, edit it, save, confirm the phases rebuild and "Original wiederherstellen" brings the shipped text back.
- Check the browser console for errors; check dark mode (`prefers-color-scheme`), narrow/tablet widths, and `prefers-reduced-motion` since all are actively supported, not afterthoughts.

There is a reusable Playwright smoke script pattern that exercises all of the above against `file://` with `playwright-core` plus the already-installed `%LOCALAPPDATA%\ms-playwright` chromium — useful because nothing here is testable without driving the UI.

### The three pedagogical phases

The student's text selection (see `state.js`) is shared across all three phases — "one mixed corpus, three different ways to use it" is the core teaching device:

1. **Phase 1 — `phase1.js`, "Frei schreiben"**: pure count-based next-word generation, no question involved. `sources` = every selected text at equal weight. Teaches the base mechanism (n-gram lookup + sampling) with a configurable context length (n = 1–6, longer than the old prototype's fixed bigram/trigram) so students can see longer context produce more coherent — but still "dumb lookup" — text. Every generated word is tinted with its source text's color (`sourceColor(si)`, golden-angle hue) so the "patchwork" is visible in the text itself, not only in the Herkunft card.
2. **Phase 2 — `phase2.js`, "Frage & Antwort"**: the same generation engine, but a question first retrieves and weights the top-3 relevant texts (`retrieve.js`). Answer words are tinted `--src-a/b/c` by which of the three texts they came from, with a `.seam` marker where generation jumps mid-sentence (ported idea from the old prototype's layer 1). Deliberately compact/low-prose compared to the old prototype's five-layer accordion — one screen, chips instead of pages — plus the full-width Wortkarte card at the bottom.
3. **Phase 3 — `phase3.js`, "Echtes Netz"**: a *real* tiny neural language model (embedding → hidden → softmax, Bengio-2003-style, no attention — stated honestly in the UI), trained live in-browser via hand-rolled backprop (`phase3-net.js`), to contrast "weights, not stored text" with phases 1–2's explicit lookup. Training is time-sliced over `requestAnimationFrame` so the UI (and the live loss sparkline) stay responsive. The architecture (48 → 40 → vocab neurons, ~36 000 weights with the default corpus) is stated in the center card and drawn for real in the wide `netview.js` card.

   **Live-refresh rule (don't break the stop button again).** The training tick updates the display ~5×/s. It must **never** call `panelCtrl.refreshAll()` or `refresh(id)`: re-rendering a card replaces its buttons/sliders, and an element swapped out between `pointerdown` and `pointerup` never fires a `click` — which is exactly why training could be started but not stopped. Instead every Phase-3 card is `manual: true`, each `render()` registers an updater in `live[id]` that only refreshes *numbers and canvases* and leaves the controls in place, and `liveTick()` calls those for open cards only. The primary training toggle additionally lives in the center card, which is never rebuilt while training runs; `syncTrainUI()` only rewrites its `textContent`.

### The "Panel" UI — color-coded list, not a radial layout

The single, shared deconstruction pattern across all three phases: a center "machine" card (left/top, sticky on desktop) showing whatever the machine is currently doing (growing text / question+answer / context→prediction), plus a **fixed, always-visible, color-coded list of explanation cards on the right** (stacking below the center on narrow screens). Implemented once in `panel.js` (`Panel.mount(host, centerEl, items, opts)`) and reused identically by all three phases — see that file's header comment for the exact contract.

An earlier version used a radial/orbital layout (`orbit.js`, since deleted) where explanation cards floated in a circle and had to be clicked open one at a time. It was fully built and worked, but the user disliked the result once they saw it rendered, and separately called the whole UI's black/white monochrome look "gruselig" (creepy). Both complaints drove the current design — see the project's `wortwelten-radial-ui` memory for the full history. Don't reintroduce a radial/orbital layout without it being explicitly requested again.

**Color carries meaning, app-wide ("Leuchtende Kategorien").** Every explanation card belongs to one fixed role, and that role always has the same color everywhere it appears, across all three phases (`CAT` in `panel.js`, CSS vars `--cat-*` in `tokens.css`):
- `origin` (amber) — Herkunft / Quellen / Embedding — "where did this come from"
- `context` (teal) — Kontextfenster / Nachschlagen / Hidden-Schicht — "what is currently being looked at"
- `candidates` (coral) — Kandidaten / Wort für Wort / Ausgabe — "what could come next"
- `random` (violet) — Zufall / Training — "what controls the randomness/learning"
- `meaning` (blue) — Wortkarte / Bedeutung — "which words belong together" (added with the word map)
- `net` (neutral graphite) — Das Netz von innen — "how the machine itself is wired" (Phase 3 only, added with `netview.js`). Deliberately *not* a signal color: that card shows all layers at once, and inside it each layer keeps its own role color (origin/context/candidates), so a sixth loud hue would fight them.

A card's `cat` sets its left-border and heading color (`--cat-color`/`--cat-tint` custom properties set per-card in `panel.js`); `heat.js`'s `Heat.render(..., { accent })` uses the same color to gradient-fill probability bars instead of a flat neutral fill, so the probability visualization itself is color-coded by role too. Phase 2 additionally has a *second*, independent color layer — `--src-a/b/c` — for which *specific* ranked source text (A/B/C) a word came from; that's a finer-grained distinction than the four roles above, not a replacement for them.

**Cards are individually collapsible** (explicitly requested: "es muss alles einzeln betrachtbar sein"). Each card has a header button (`aria-expanded`), a per-card "nur dies" button that collapses every other card, and an "alle auf-/zuklappen" bar above the list; the open/closed state is persisted per phase in `localStorage` under `wortwelten-v2-panel-offen`. A **closed card is not rendered at all** and re-renders on expand — that is also the perf valve for Phase 3's training loop. Two item flags matter: `wide: true` moves a card into a full-width row *below* the two-column grid (the Wortkarte needs the width), and `manual: true` excludes it from `refreshAll()` so a per-word refresh doesn't rebuild an expensive canvas (the phase calls `refresh(id)` itself when it's actually needed). Each `render(container)` function is responsible for showing its own "nothing to explain yet" placeholder (e.g. "Stell zuerst eine Frage.") until there's real output.

**Explanation text always lives in a visible info box, never as loose gray small print** (`infobox.js`: `Info.box/note/key/steps/legend`, styled in `css/explain.css`). Each panel item may carry an `info: {title, text, icon}` which `panel.js` renders as the first box in the card body; inside a card the boxes inherit `--cat-color`/`--cat-tint`, so an explanation is always visibly tied to its role color.

**Every phase opens with a "Maschinen-Ablauf" flow diagram** (`flow.js`: `Flow.render(container, stages, {onPick, loop})`) in the center card: the numbered pipeline for that phase, each step colored with its category color and clickable to expand+scroll to the matching explanation card (`panelCtrl.reveal(id)`). This is the one picture that ties the center and the right-hand list together.

### Shared engine modules (used by 2+ phases)

- **`vocab.js`** — `tokenize()`, `STOP` list, `SUFFIXES`, `createLemmatizer()` (closure-based suffix-stripping lemmatizer, only strips an ending if the stem also occurs in the corpus), `isContentTok()`, `showWord()` (capitalized display form for word lists/chips — distinct from the flowing-text display, see `ngram.js`'s `pieces()`).
- **`ngram.js`** — the generation engine shared by Phase 1 and Phase 2: `buildSources()`, `createSession()`, `candidates()` (tries context length n → n-1 → … → 1 → sentence-start fallback, generalizing the old prototype's fixed trigram→bigram→start chain), `pickFrom()`, `commitWord()`, `step()`, and `pieces()` (flowing-text rendering using each chosen token's *original* casing, not the lowercased canonical form used for matching — this is what gets German noun capitalization right without needing the old prototype's separate uppercase-frequency tracking).
- **`cooccurrence.js`** — `buildModel()`: PPMI co-occurrence vectors + cosine similarity, used **only** by Phase 2 (retrieval, the "ähnliche Wörter" chips and the word map). Also provides `themeOf()` (which Wortwelten a word comes from, for the map's theme colors), `topContexts()` and `sharedContexts()` (the "warum ähnlich?" explanation).
- **`wordmap.js`** — `WordMap.create(M, {highlight})` → `{mount, destroy, select, redraw}`: the 2D word map, ported from the old prototype's layer 4 on explicit user request ("im Prototypen gab es auch eine Wortkarte, das war cool"). Own small t-SNE (`makeLayout`) over the `MAP_CAP` = 180 most frequent nouns, drawn on a canvas, plus the word detail card (neighbors, shared contexts, top contexts, example sentence). The layout is computed **lazily on first mount and animated** over `requestAnimationFrame` (the card ships collapsed), so opening a phase never blocks on it; `prefers-reduced-motion` runs it to completion in one go instead. Used only by Phase 2.
- **`netview.js`** — `NetView.create({getNet, getData, getForward, getProbs, getCtxIds, wordLabel})` → `{mount, update, destroy}`: the live, honest picture of the Phase-3 net on a canvas — `C·d` input dots, `H` hidden dots, the `SHOW` = 8 most probable output neurons plus a dashed "+ N weitere" marker, and **real edges**: every line is an actual `net.W1`/`net.W2` weight (warm `--src-a` = positive, cool `--src-b` = negative, opacity/width by magnitude, bucketed into 8 canvas paths so ~2 300 lines stay cheap). A neuron's fill is its current value, clicking one opens its real numbers (value, bias, strongest in/outgoing weights, and for hidden neurons which words it pushes up or down), and a chip row filters to the strongest 10 %/30 %/all edges. Below the canvas a `.net-facts` block answers "how many neurons/weights is this?" in German-formatted numbers. `update()` only redraws — it never rebuilds controls (see the live-refresh rule above). Used only by Phase 3.
- **`retrieve.js`** — `questionLemmas()`, `retrieve()`: question → known/unknown/similar lemmas → IDF-weighted document scoring with a similarity fallback (`SIM_MIN = 0.3`).
- **`heat.js`** — `Heat.render(container, candidates, opts)`: the one shared probability-display component for all three phases (count-based candidates in 1/2, softmax output in 3), so the same visual language reinforces "it's always a probability, just computed differently." `opts.accent` tints the bar gradient to the calling card's category color (see the Panel UI section above). See the file header for the candidate shape contract.
- **`state.js`** — `State`: tiny pub/sub + the corpus-selection store (`selectedIds`, debounced `scheduleRebuild()`). Phase 1/2 rebuild and reset immediately on `corpus-changed`; Phase 3 deliberately does **not** auto-rebuild (expensive retrain) — it just flips a banner (see `phase3Dirty` / each phase's own `corpus-changed` listener).
- **`corpus.js`** — `THEMES`/`TEXTS` (the ~48-text default corpus, same content as the old prototype) + own-text persistence (`localStorage`, key `wortwelten-v2-eigene-texte` — **different key** from the old prototype's, so the two don't collide if both are opened on the same machine). Built-in texts are **editable too**: `updateText()/resetText()` store an override per text id under `wortwelten-v2-text-bearbeitet` and leave the `TEXTS` array itself untouched, so "Original wiederherstellen" always works. `allTexts()` applies the overrides and flags them with `edited: true`.

### Key conventions

- All UI strings and in-app data (titles, comments) are German, matching the target audience — keep new user-facing text in German.
- `el(tag, cls, text)` and `$(id)` (defined in `app.js`) are the DOM-builder helpers used everywhere; there's no framework/virtual DOM — render functions call `container.replaceChildren()` and rebuild.
- Each phase module is a single `Phases.register(n, { mount(host) {...} })` call (see `app.js`'s `Phases` registry) containing all of that phase's closures; `render()` inside `mount()` is called once initially and again on reset/corpus-change, reusing the same function closures rather than re-registering.
- Colors are CSS custom properties in `tokens.css` — a warm cream/near-black base (not the old prototype's cool gray), the `--cat-*` category colors (see above), `--src-a/b/c` (specific source A/B/C, Phase 2 only), and `--t-*` (Textwelten theme colors, also used by the word map) — with a `prefers-color-scheme: dark` block and a `data-theme` override, all color layers re-tuned (not just inverted) for dark mode.
- `<script>` order in `index.html` matters (no modules): `app.js` (defines the `el()`/`$()` DOM helpers and the `Phases` registry) loads before `infobox.js`/`panel.js`/`flow.js`/`vocab.js`/`ngram.js`/`heat.js`; `wordmap.js` needs `cooccurrence.js` and `infobox.js` and loads before `phase2.js`; `netview.js` needs `infobox.js` and loads after `phase3-net.js` and before `phase3.js`; the phase files load before `main.js` (the one-line bootstrap).

## The old prototype (`Wortwelten.html`, reference only)

Single self-contained HTML file (no build step, no dependencies, no package.json) — the same pedagogical idea as `wortwelten-v2/`, but built as one combined "Röntgenblick" (X-ray) flow instead of three phases, and using a side-panel/accordion UI that `wortwelten-v2/` deliberately replaced. Kept for reference; don't extend it further — make changes in `wortwelten-v2/` instead.

### Running / developing

There is no build or install step. Just open `Wortwelten.html` directly in a browser (double-click, or `start Wortwelten.html` from PowerShell), or serve it with any static file server if `file://` restrictions become an issue (none currently used — no fetch, no modules). Edit the file and reload the browser to see changes; there is no hot-reload, bundler, linter, or test suite in this repo.

To verify a change actually works, open the file in a browser and exercise the chat: ask a question, click "Wie ist diese Antwort entstanden?", and step through all five X-ray layers (and the "Zusehen, wie die Karte entsteht" animation, and adding/removing an own text in layer 5), since most logic is only exercised through that interactive flow.

### Architecture

The script is organized top-to-bottom in distinct sections (search for the `/* ---- ... ---- */` comments):

1. **Data** — `THEMES` and `TEXTS`: the fixed corpus of ~48 short German texts, each tagged with a `theme` (`tiere`, `meer`, `weltall`, `computer`). User-added texts (theme `eigen`) are stored in `localStorage` under `wortwelten-eigene-texte` and merged in via `allTexts()`.

2. **Engine** (`buildModel`, `tokenize`, `lemma`, etc.) — the from-scratch NLP core, rebuilt from scratch on every corpus change via `rebuild()`:
   - `tokenize`: regex-based word/punctuation splitter.
   - A hand-rolled suffix-stripping lemmatizer (`SUFFIXES`, `lemma()`) that only strips an ending if the resulting stem also occurs in the corpus.
   - `STOP`: a hardcoded German stopword list.
   - Co-occurrence counting within a sliding window → PPMI-weighted, L2-normalized word vectors → cosine similarity matrix (`sim`). Only nouns (heuristically detected via mid-sentence capitalization, `isNoun`) become "map words" (`words`); all frequent content words become context dimensions (`ctxWords`).
   - `buildModel()` returns the `M` model object that nearly every render function downstream reads from.

3. **Map layout** (`makeLayout`, `mulberry32`) — a small from-scratch t-SNE implementation (Barnes-Hut-free, O(n²), fine at this corpus size) with a seeded PRNG, used to lay `words` out in 2D for the "Bedeutung" (meaning) layer's canvas map. `L.step()` is called incrementally so the layout can be animated.

4. **Retrieval** (`retrieve`, `questionLemmas`) — turns a user question into known/unknown lemmas, scores every document by IDF-weighted exact + similarity-based hits (`SIM_MIN = 0.3` threshold), and returns per-document token marks used for highlighting in layer 3.

5. **Generation** (`makeWriter`, `candidates`, `collect`, `commitWord`, `pickFrom`) — a bigram/trigram sampler: at each step it looks at the last 1–2 words, collects all next-word occurrences across the top-3 retrieved source texts (falling back from trigram → bigram → sentence-start if no match), weights candidates by source relevance and a temperature (`X.temp`, UI-exposed as "Zufall"/randomness), and samples. Already-used positions are down-weighted (not excluded) so sentences don't trivially repeat. Generation stops after 3 sentences or 70 steps.

6. **UI / state** — global mutable state objects `X` (X-ray view: current message, depth 1–5, current generation step, play/pause, temperature) and `S1` (meaning-map state: selected word, hover, color toggle, animation handle, view bounds) drive rendering. `msgs` holds the chat history (plain objects, not classes). There is no virtual DOM / framework: `el()` and `icon()` are tiny DOM-builder helpers, and each render function (`renderL1`...`renderL5`, `renderWordCard`, `drawMap`) does `replaceChildren()` + manual rebuild on every state change. `renderLayer(d)` dispatches to the right layer renderer; `refreshLayers()` re-renders every open layer after a state change (e.g. regenerating an answer).

7. **The five X-ray layers** (`LAYERS` array, `addLayer`/`goDeeper`/`renderRail`), opened progressively deeper via "Tiefer schauen":
   - L1 **Quellen** (sources) — which of the 3 retrieved texts each word of the answer came from, highlighting "seams" where generation jumped mid-sentence between sources.
   - L2 **Wort für Wort** (word by word) — step-through/play controls over the generation process, showing the candidate list, their probabilities, per-source color breakdown, and the exact origin snippet for the current step. Also hosts the temperature slider and "regenerate with this randomness" button.
   - L3 **Nachschlagen** (retrieval) — breaks the question into stopwords/known/unknown/similar lemmas, shows ranked documents with exact (yellow) vs. similar (pink) highlight marks.
   - L4 **Bedeutung** (meaning) — the interactive 2D word-vector canvas map (pan/zoom-free, click/search to select, nearest-neighbor lines, theme coloring), plus the word-detail card (`renderWordCard`) with neighbors, shared-context explanation, top contexts, and an example sentence.
   - L5 **Lerntexte** (training texts) — full corpus browser grouped by theme, the "add your own text" form (re-triggers `rebuild()` via `relearn()`), and deletion of user-added texts.

   Layer 4's headline question is dynamically rewritten (`layer4Question`) if the current answer actually used a similarity-based (not exact) retrieval hit, to ask about that specific pair of words.

### Key conventions (old prototype)

- All UI strings, variable names in data (`theme`, `title`, `body`), and code comments are German, matching the target audience of the educational tool. Keep new user-facing text and comments in German for consistency.
- Colors/theme are CSS custom properties on `:root`, with a `prefers-color-scheme: dark` block and a `data-theme` attribute override for explicit light/dark switching; `cssVar()` reads these at runtime for canvas drawing since canvas can't use CSS vars directly.
- Per-source colors (`--src-a/b/c`, accessed via `srcVar(i)`) are distinct from per-theme colors (`--t-tiere` etc., via `tVar(theme)`) — sources are "text A/B/C used in this answer" (at most 3, ranked), themes are the 4 fixed topics (+ "eigen" for user texts).
- Nothing is persisted except user-added texts (`own`, in `localStorage`). Chat history, X-ray state, and the map layout are all in-memory and reset on page reload.
- `rebuild()` must be called (it regenerates `M`, `wordTheme`, and `L`) any time the corpus (`own`) changes; `relearn()` wraps this for the layer-5 add/remove flows and also re-renders any currently-open layers that depend on the model.
