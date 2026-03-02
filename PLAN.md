# Upwelling -> "Obsidian on the Web": Transformation Plan

## Executive Summary

**Goal**: Transform Upwelling — a collaborative text editor research prototype built on Automerge CRDTs + ProseMirror — into a web-native knowledge management tool with the core feel of Obsidian, but with **real-time collaboration as a built-in differentiator**.

**Total estimated effort**: ~52–70 developer-weeks (12–18 months for 1 developer, 6–9 months for 2)

**Unique advantage**: Obsidian has no real-time collaboration. By building on Upwelling's CRDT foundation, this product would be "Obsidian, but multiplayer" — a genuinely new category.

---

## What We Already Have (Reuse Inventory)

| Existing Feature | Status | Reuse Strategy |
|---|---|---|
| Automerge CRDT engine | Working | **Keep as-is** — core collaboration primitive |
| ProseMirror editor | Working | **Extend heavily** — add markdown, wiki-links, etc. |
| Real-time WebSocket sync | Working | **Keep and extend** — add per-note sync |
| Local-first (IndexedDB) | Working | **Keep and extend** — restructure for vault/notes |
| Draft/branch system | Working | **Repurpose** — drafts become note versions |
| Inline comments | Working | **Keep** — valuable for collaboration |
| Change tracking/attribution | Working | **Keep** — unique differentiator |
| Author identity + colors | Working | **Keep** — essential for collaboration |
| History/version viewing | Working | **Keep and improve** |
| Binary serialization (TAR) | Working | **Rework** — needs per-note granularity |
| React 17 UI | Working | **Rewrite UI** — keep React, rebuild layout |
| Express + WS server | Working | **Extend** — add vault structure, search index |

---

## Architecture Evolution

### Current Model → Target Model

```
CURRENT (Upwelling)              TARGET (Obsidian-on-Web)
═══════════════════              ═══════════════════════

Upwell (document)        →       Vault (workspace/collection)
  └─ Drafts[]            →         ├─ Folders[] (nested tree)
     └─ Draft            →         │  └─ Notes[]
        ├─ text          →         │     └─ Note
        ├─ marks         →         │        ├─ markdown content (Automerge text)
        ├─ blocks        →         │        ├─ frontmatter (Automerge map)
        ├─ comments      →         │        ├─ outgoing links[] (parsed from [[]])
        ├─ message       →         │        ├─ backlinks[] (computed index)
        ├─ contributors  →         │        ├─ tags[] (parsed from # and frontmatter)
        └─ shared        →         │        ├─ comments (kept for collab)
                                   │        ├─ version history (Automerge heads)
                                   │        └─ contributors[]
                                   ├─ Attachments/ (images, files)
                                   ├─ Templates/
                                   └─ Vault Metadata
                                      ├─ link graph (adjacency index)
                                      ├─ tag index
                                      ├─ search index
                                      └─ member permissions
```

### Key Data Model Decisions

1. **One Automerge document per Note** (not one per Vault). This enables per-note sync, per-note collaboration, and avoids a single massive CRDT document.

2. **Vault = a metadata Automerge doc** that stores the folder tree, note registry (id → path mapping), and shared indices (link graph, tags). This is similar to the current `UpwellMetadata` but expanded.

3. **Markdown as canonical format**: Notes are stored as markdown text inside Automerge. The ProseMirror schema renders markdown live. Export produces standard `.md` files. Import reads `.md` files (including Obsidian vaults).

4. **Links resolve by note ID internally, display by title**: Each note has a stable UUID. `[[Page Name]]` is resolved to a note ID when parsed, but displayed by title. Renames update the title, and all links still work because they reference the ID.

5. **Frontmatter stored as an Automerge map**: The YAML frontmatter block maps to a separate Automerge map field on the note doc, enabling structured queries and CRDT merging of property changes.

### ProseMirror Schema Evolution

The current schema supports: `doc`, `paragraph`, `heading(1-6)`, `text` + marks for `strong`, `em`, `comment`, `link`, `change`.

The target schema needs to add:

```
New Nodes:
  - bullet_list, ordered_list, list_item
  - blockquote
  - code_block (with language attribute)
  - horizontal_rule
  - image (src, alt, title)
  - task_list_item (checked attribute)
  - callout (type: note/warning/tip/etc., foldable)
  - embed (noteId — for transclusion)
  - table, table_row, table_cell, table_header

New Marks:
  - code (inline)
  - strikethrough
  - wikilink (noteId, display text)
  - hashtag (tag name)
  - highlight
  - math (inline LaTeX)
```

**Library consideration**: Rather than building all ProseMirror nodes from scratch, consider using **prosemirror-markdown** (for markdown ↔ ProseMirror conversion) and **prosemirror-tables**. The existing Automerge ↔ ProseMirror bridge (`PositionMapper.ts`, `ProsemirrorTransactionToAutomerge.ts`, `AutomergeToProsemirrorTransaction.ts`) is complex and will need significant extension for every new node type.

**Alternative**: Evaluate switching to **TipTap** (built on ProseMirror) which provides many of these node types out-of-the-box with an extension system. This would be a significant refactor but could save weeks of work on list handling, tables, and other complex nodes. The Automerge bridge would still need to be adapted.

---

## Phase 1: Core Identity (Makes It "Obsidian-Like")

**Effort: ~14–18 developer-weeks**
**Goal**: Someone opens the app and immediately recognizes it as an Obsidian-style tool.

### 1.1 Data Model Restructure (~3–4 weeks)

This is the foundation everything else depends on.

| Task | Effort | Details |
|---|---|---|
| **Redesign `api/` for Vault/Note model** | 2 weeks | Replace `Upwell` with `Vault` class. Replace `Draft` with `Note` class. Each Note = 1 Automerge doc with: `content` (text), `frontmatter` (map), `title`, `path`, `createdAt`, `editedAt`, `contributors`. Vault metadata doc stores folder tree + note registry. |
| **Per-note sync protocol** | 1 week | Modify `RTC` layer to sync individual note docs (not entire vault). Open WebSocket channels per-note. Server routes: `/:vaultId/:noteId/connect/:peerId`. |
| **Migration from old format** | 0.5 weeks | Write converter: old Upwell → new Vault (each draft becomes a note). |
| **Update serialization** | 0.5 weeks | Replace TAR-based serialization with per-note storage. Vault exports as `.zip` of `.md` files. |

**Reuse**: `Draft.ts` mechanics (Automerge text, marks, blocks) carry over almost directly into `Note`. The `RTC` WebSocket sync protocol needs only routing changes.

**Hardest part**: Getting the Automerge ↔ ProseMirror bridge working with per-note documents after restructuring.

### 1.2 Markdown Editing (~3–4 weeks)

| Task | Effort | Details |
|---|---|---|
| **Extend ProseMirror schema** | 1.5 weeks | Add nodes: `bullet_list`, `ordered_list`, `list_item`, `task_list_item`, `blockquote`, `code_block`, `horizontal_rule`, `image`, `table` (via prosemirror-tables). Add marks: `code`, `strikethrough`, `highlight`. |
| **Markdown input rules** | 1 week | Extend `inputRules.ts`: `- ` → bullet list, `1. ` → ordered list, `> ` → blockquote, `` ``` `` → code block, `---` → horizontal rule, `- [ ]` → task item, `==text==` → highlight, `~~text~~` → strikethrough. The existing `#` → heading rule stays. |
| **Markdown paste handling** | 0.5 weeks | Parse pasted markdown text into ProseMirror nodes (use `prosemirror-markdown` parser). |
| **Markdown export** | 0.5 weeks | Serialize ProseMirror doc back to markdown string for `.md` export and source view. |
| **Update Automerge bridge** | 0.5 weeks | Extend `ProsemirrorTransactionToAutomerge.ts` and `AutomergeToProsemirrorTransaction.ts` for all new node types. This is fiddly — every new block type needs position mapping. |

**Reuse**: Existing ProseMirror setup, input rules infrastructure, Automerge bridge pattern.

**Hardest part**: Lists. Nested lists in ProseMirror are notoriously complex. Getting them to round-trip through Automerge (which stores flat text with block markers) is the single hardest task in this phase.

### 1.3 Wiki-Links (`[[links]]`) (~2–3 weeks)

| Task | Effort | Details |
|---|---|---|
| **`wikilink` mark in ProseMirror** | 0.5 weeks | New mark type with attrs: `{ noteId, displayText }`. Renders as clickable link styled distinctly from URLs. Unresolved links (noteId = null) render dimmed. |
| **`[[` autocomplete popup** | 1 week | Input rule detects `[[` typed. Shows fuzzy-search dropdown of all note titles + aliases. Selecting inserts a `wikilink` mark. Use something like `prosemirror-autocomplete` or `tippy.js` for the popup. |
| **Link index in Vault metadata** | 0.5 weeks | On note save, parse all `wikilink` marks → update outgoing links in vault metadata. Compute backlinks as inverse index. Store in vault metadata Automerge doc. |
| **Click-to-navigate** | 0.25 weeks | Clicking a wiki-link navigates to that note (or creates it if unresolved). |
| **Link updating on rename** | 0.25 weeks | When a note is renamed, update display text in all linking notes (since links use stable IDs, only display text needs updating). |

**Reuse**: Nothing existing — this is entirely new.

**Hardest part**: The autocomplete popup UX. It needs to feel instant (<50ms) even with thousands of notes, which means maintaining an in-memory title index.

### 1.4 File Explorer Sidebar (~2 weeks)

| Task | Effort | Details |
|---|---|---|
| **Folder tree component** | 1 week | React tree view component showing vault folder structure. Collapsible folders, note icons, file counts. Sort by name or date. Use a library like `react-arborist` for the tree. |
| **CRUD operations** | 0.5 weeks | Create/rename/delete/move notes and folders. Right-click context menus. All operations update vault metadata Automerge doc (syncs to collaborators). |
| **Drag and drop** | 0.5 weeks | Drag notes/folders to reorganize. Update paths in vault metadata. |

**Reuse**: The current `Documents.tsx` list view is replaced entirely, but the `Documents.ts` storage orchestrator pattern is reusable.

### 1.5 Backlinks Panel (~1.5 weeks)

| Task | Effort | Details |
|---|---|---|
| **Backlinks sidebar panel** | 0.5 weeks | React component showing all notes that link to the current note. Each entry shows note title + context snippet (surrounding text). |
| **Unlinked mentions** | 0.5 weeks | Scan all notes for text matching the current note's title (that isn't already a wiki-link). Show in separate section with "Link" button to convert to wiki-link. |
| **Performance** | 0.5 weeks | Backlinks index must update incrementally on note edits. For vaults <5000 notes, a simple in-memory adjacency map suffices. |

**Reuse**: Nothing existing.

### 1.6 Quick Switcher (Cmd+O) (~1 week)

| Task | Effort | Details |
|---|---|---|
| **Modal dialog** | 0.5 weeks | Fuzzy search over note titles + aliases. Shows recent notes first. Keyboard navigable (arrow keys + enter). |
| **Fuzzy search engine** | 0.5 weeks | Use `fuse.js` or `fzf-for-js` for fuzzy matching. Index all note titles, aliases, and paths. |

**Reuse**: Nothing existing — new UI component.

### 1.7 App Shell / Layout Rebuild (~2 weeks)

| Task | Effort | Details |
|---|---|---|
| **Sidebar layout** | 1 week | Resizable left sidebar (file explorer, search, bookmarks) + resizable right sidebar (backlinks, outline, comments). Collapsible. Tab system for panel switching. Replace current `DraftView.tsx` layout entirely. |
| **Routing overhaul** | 0.5 weeks | Routes: `/vault/:vaultId/note/:noteId`, `/vault/:vaultId` (vault home). Replace `wouter` hash routing with proper paths. |
| **Keyboard shortcuts** | 0.5 weeks | Global shortcut system: Cmd+O (quick switcher), Cmd+P (command palette, Phase 3), Cmd+B (toggle left sidebar), Cmd+Shift+B (toggle right sidebar), Cmd+N (new note). |

**Reuse**: The current sidebar (drafts, history, contributors) is conceptually similar but needs full rebuild for the new layout.

---

## Phase 2: Knowledge Management (Makes It a Knowledge Tool)

**Effort: ~12–16 developer-weeks**
**Depends on**: Phase 1 (data model, wiki-links, file explorer)

### 2.1 Full-Text Search (~2–3 weeks)

| Task | Effort | Details |
|---|---|---|
| **Client-side search index** | 1 week | Use `MiniSearch` or `lunr.js` to build an in-memory full-text index of all notes. Update incrementally on edits. Supports phrase search, boolean operators. |
| **Search UI panel** | 0.5 weeks | Search input in left sidebar. Results with highlighted context snippets. Click to navigate. |
| **Search operators** | 0.5 weeks | `tag:`, `path:`, `title:` prefix filters. |
| **Server-side search (optional)** | 0.5–1 week | For large vaults (>5000 notes), offload search to server using SQLite FTS5 or Meilisearch. |

**Hardest part**: Keeping the search index in sync with CRDT changes from remote collaborators in real-time.

### 2.2 Tags (~1.5 weeks)

| Task | Effort | Details |
|---|---|---|
| **`hashtag` mark in ProseMirror** | 0.5 weeks | New mark type. Input rule: `#tagname` followed by space → creates hashtag mark. Renders as styled tag pill. |
| **Tag index** | 0.5 weeks | Parse tags from note content + frontmatter. Build tag → noteIds index in vault metadata. |
| **Tag browser panel** | 0.5 weeks | Right sidebar panel. Hierarchical tag list with counts. Click to filter/search. |

### 2.3 Frontmatter / Properties (~2 weeks)

| Task | Effort | Details |
|---|---|---|
| **YAML frontmatter parsing** | 0.5 weeks | Detect and parse `---` delimited YAML at top of note. Store as Automerge map (separate from text). |
| **Properties panel** | 1 week | Visual editor for frontmatter fields (key-value form). Type detection: text, number, date, checkbox, list, tags. |
| **Property types & validation** | 0.5 weeks | Define recognized properties: `tags`, `aliases`, `cssclass`, `date`, `publish`. Custom properties supported. |

**Hardest part**: Bidirectional sync between the YAML text representation in the editor and the structured Automerge map. Edits in either must reflect in the other.

### 2.4 Graph View (~3–4 weeks)

| Task | Effort | Details |
|---|---|---|
| **Force-directed graph rendering** | 1.5 weeks | Use **D3.js force simulation** or **Cytoscape.js**. Nodes = notes, edges = links. Node size by connection count. Zoom, pan, click-to-navigate. |
| **Graph filters** | 0.5 weeks | Filter by folder, tag, search query. Show/hide orphans. Depth slider. |
| **Color coding** | 0.5 weeks | Color nodes by folder, tag group, or collaborator. |
| **Local graph view** | 0.5 weeks | Show only 1–2 hop neighborhood of current note. Displayed in right sidebar or as popup. |
| **Performance optimization** | 0.5–1 week | For vaults >1000 notes, use WebGL rendering (e.g., `force-graph` library or `pixi.js` backend for D3). Lazy node rendering, viewport culling. |

**Hardest part**: Performance with large graphs. D3 force simulation gets slow >2000 nodes without WebGL.

**Library recommendation**: [`force-graph`](https://github.com/vasturiano/force-graph) — 2D/3D WebGL force-directed graph with excellent performance up to 10K nodes.

### 2.5 Templates (~1–1.5 weeks)

| Task | Effort | Details |
|---|---|---|
| **Templates folder convention** | 0.25 weeks | Designate a `Templates/` folder. Notes in it are template notes. |
| **Insert template command** | 0.5 weeks | Command palette action: "Insert template" → pick template → insert content at cursor (or replace note). |
| **Template variables** | 0.5 weeks | Replace `{{date}}`, `{{time}}`, `{{title}}` on insertion. |

### 2.6 Note Aliases (~0.5 weeks)

| Task | Effort | Details |
|---|---|---|
| **Aliases from frontmatter** | 0.25 weeks | Read `aliases: ["name1", "name2"]` from frontmatter. |
| **Index aliases** | 0.25 weeks | Include aliases in quick switcher search and wiki-link autocomplete. |

---

## Phase 3: Power User UX (Makes Power Users Productive)

**Effort: ~10–14 developer-weeks**
**Depends on**: Phase 1 (layout), Phase 2 (search, tags)

### 3.1 Command Palette (Cmd+P) (~2 weeks)

| Task | Effort | Details |
|---|---|---|
| **Command registry** | 0.5 weeks | Central registry of all commands with: id, label, shortcut, handler. Core commands registered at startup. |
| **Palette UI** | 0.5 weeks | Modal with fuzzy search over command labels. Recently used first. Shows keyboard shortcut. |
| **Register all commands** | 0.5 weeks | Wire up: formatting (bold, italic, headings), navigation (open note, go back), view (toggle sidebar, toggle graph), note ops (new, delete, rename, move), search, etc. |
| **Custom keybindings** | 0.5 weeks | Let users rebind shortcuts. Store in vault or user settings. |

### 3.2 Tabs (~2 weeks)

| Task | Effort | Details |
|---|---|---|
| **Tab bar component** | 1 week | Horizontal tab bar above editor. Open/close/reorder tabs. Pin tabs. Middle-click to close. Tab overflow menu. |
| **Tab state management** | 0.5 weeks | Track open tabs, active tab, scroll positions per tab. Persist across sessions. |
| **Tab context menu** | 0.5 weeks | Close, close others, close to the right, pin, split right/down. |

### 3.3 Split Panes (~2–3 weeks)

| Task | Effort | Details |
|---|---|---|
| **Pane splitting** | 1.5 weeks | Split editor area horizontally or vertically. Each pane has its own tab bar. Drag dividers to resize. Use a library like `react-mosaic` or `allotment`. |
| **Linked panes** | 0.5 weeks | Option to link a pane to show backlinks/outline of whatever is in the adjacent pane. |
| **Workspace persistence** | 0.5 weeks | Save/restore pane layouts. |

**Hardest part**: Getting multiple ProseMirror editor instances to coexist, each with their own Automerge doc and sync connection.

### 3.4 Outline / Table of Contents (~1 week)

| Task | Effort | Details |
|---|---|---|
| **Outline panel** | 0.5 weeks | Right sidebar panel. Auto-generated from headings in current note. Click to scroll to heading. |
| **Live updates** | 0.25 weeks | Update outline as user types/adds headings. |
| **Drag to reorder** | 0.25 weeks | Drag headings in outline to reorder sections in the note. |

### 3.5 Daily Notes (~1 week)

| Task | Effort | Details |
|---|---|---|
| **Daily note creation** | 0.5 weeks | Command/button: "Open today's daily note." Creates note in `Daily/` folder with date-formatted title. Applies daily note template if set. |
| **Calendar navigation** | 0.5 weeks | Small calendar widget in sidebar. Click a date to open/create that day's note. Dots on dates that have notes. |

### 3.6 Hover Preview (~1 week)

| Task | Effort | Details |
|---|---|---|
| **Link hover popup** | 0.5 weeks | Cmd/Ctrl + hover over `[[link]]` shows a floating preview of the linked note's content. |
| **Preview rendering** | 0.5 weeks | Render the first ~500 chars of the linked note as rich text in a popup card. |

### 3.7 Bookmarks (~0.5 weeks)

| Task | Effort | Details |
|---|---|---|
| **Bookmark system** | 0.5 weeks | Star/bookmark notes, headings, or search queries. Bookmarks panel in left sidebar for quick access. |

---

## Phase 4: Platform Features (Long-Term Moat)

**Effort: ~16–22 developer-weeks**
**Depends on**: Phases 1–3

### 4.1 Embeds / Transclusion (~2–3 weeks)

| Task | Effort | Details |
|---|---|---|
| **`embed` node in ProseMirror** | 1 week | `![[Note Name]]` → renders the linked note's content inline (read-only). `![[Note Name#Heading]]` embeds just a section. |
| **Live updating** | 0.5 weeks | Embedded content updates when source note changes. |
| **Image/media embeds** | 0.5 weeks | `![[image.png]]` renders the image inline. Drag-and-drop image upload. |
| **Recursive embed handling** | 0.5 weeks | Handle circular embeds gracefully (max depth, cycle detection). |

### 4.2 Callouts / Admonitions (~1 week)

| Task | Effort | Details |
|---|---|---|
| **Callout node** | 0.5 weeks | `> [!type] Title` syntax. Types: note, warning, tip, info, etc. Styled blocks with icons and colors. |
| **Foldable callouts** | 0.5 weeks | `> [!type]-` creates a collapsible callout. |

### 4.3 Plugin System (~6–8 weeks)

This is the highest-effort single feature and the most architecturally significant.

| Task | Effort | Details |
|---|---|---|
| **Plugin API design** | 1.5 weeks | Define the API surface: `app.vault` (read/write notes), `app.workspace` (open panes, register views), `app.commands` (register commands), `app.settings` (plugin settings). Modeled after Obsidian's plugin API. |
| **Plugin loading & sandboxing** | 2 weeks | Load plugin JS bundles. Run in sandboxed iframe or Web Worker for security. Message-passing bridge to host API. Plugin manifest format (`manifest.json`). |
| **Plugin settings UI** | 0.5 weeks | Each plugin can register settings. Auto-generated settings panel. |
| **Plugin marketplace** | 1–2 weeks | Server-side plugin registry. Browse, install, update plugins from within the app. Plugin review/approval workflow. |
| **Example plugins** | 1 week | Build 2–3 showcase plugins: Calendar view, Kanban board, Word count. |

**Hardest part**: Sandboxing. Plugins need enough access to be useful (read/write notes, extend the editor) while preventing security issues. Obsidian runs plugins unsandboxed (same-context JS), which is fast but risky for a web app.

**Recommendation**: Start with a curated "first-party plugin" system (no sandbox needed) before building a full marketplace.

### 4.4 Themes & CSS Customization (~2 weeks)

| Task | Effort | Details |
|---|---|---|
| **CSS custom properties system** | 0.5 weeks | Define all colors, fonts, spacing as CSS variables. Light/dark mode support. |
| **Theme loading** | 0.5 weeks | Themes are CSS files that override custom properties. Load from vault settings. |
| **Theme browser** | 0.5 weeks | Browse and install community themes. |
| **CSS snippets** | 0.5 weeks | User-defined CSS overrides for targeted tweaks. |

### 4.5 Canvas / Whiteboard (~5–6 weeks)

| Task | Effort | Details |
|---|---|---|
| **Infinite canvas engine** | 2 weeks | Use **tldraw**, **Excalidraw**, or build on HTML5 Canvas/SVG. Zoom, pan, viewport management. |
| **Card system** | 1.5 weeks | Place note cards (linked to vault notes), text cards, image cards on canvas. Resize, move, style. |
| **Connection arrows** | 0.5 weeks | Draw arrows between cards. Arrow styling. |
| **Collaborative canvas** | 1 week | CRDT sync for canvas state (card positions, arrows). Multiple users editing the same canvas. |

**Library recommendation**: **tldraw** is an excellent open-source canvas library with built-in collaboration support. Would significantly reduce effort.

### 4.6 Shared Vaults & Permissions (~3–4 weeks)

This leverages Upwelling's existing collaboration but adds team structure.

| Task | Effort | Details |
|---|---|---|
| **Vault membership** | 1 week | Invite users to vault. Member list with roles (owner, editor, viewer). |
| **Permission system** | 1 week | Per-folder or per-note permissions. Private notes within shared vaults. |
| **Presence indicators** | 0.5 weeks | Show who's online in the vault. Show who's currently editing which note. |
| **Collaborative graph** | 0.5 weeks | Shared graph view where collaborators can see each other's cursor/focus on the graph. |
| **Activity feed** | 0.5 weeks | Recent changes across the vault: who edited what, when. |

---

## Risk Assessment & Hard Problems

### Risk 1: Automerge ↔ ProseMirror Bridge Complexity (HIGH)

The existing bridge (`PositionMapper.ts`, `ProsemirrorTransactionToAutomerge.ts`, `AutomergeToProsemirrorTransaction.ts`) is already the most complex part of the codebase. Every new node type (lists, tables, code blocks) needs bridge support. Nested structures (lists within lists) are especially painful because Automerge stores flat text with block markers while ProseMirror has a hierarchical document tree.

**Mitigation**:
- Consider upgrading to Automerge's newer `prosemirror-automerge` binding (if available for your Automerge version) which handles the bridge automatically.
- Alternatively, consider `Yjs` + `y-prosemirror` which has a mature, well-tested ProseMirror bridge and is used by many production collaborative editors. This would mean replacing Automerge, which is a major decision.
- If staying with current Automerge, budget extra time for every new block type and write extensive tests for the bridge.

### Risk 2: Automerge Version & WASM (MEDIUM)

The project uses `automerge-wasm-pack v0.0.27`, which is a pre-release version. The Automerge ecosystem has since released stable versions (automerge 2.x) with better ProseMirror integration, richer text support, and smaller WASM bundles.

**Mitigation**:
- Upgrade to `@automerge/automerge` 2.x early in Phase 1. This is disruptive but unlocks better rich text support (Automerge 2.x has native `RichText` with marks support, reducing bridge complexity).
- The `@automerge/prosemirror` package provides an official ProseMirror integration that could replace much of the custom bridge code.

### Risk 3: Performance at Scale (MEDIUM)

A knowledge base can grow to thousands of notes. Several features need to scale:
- Search index: >5000 notes may exceed browser memory for full-text indexing
- Graph rendering: >2000 nodes needs WebGL
- Wiki-link autocomplete: must stay <50ms with thousands of note titles
- Vault metadata CRDT: a single Automerge doc tracking all notes could grow large

**Mitigation**:
- Lazy-load note content (only load full text for open notes; keep titles/metadata in memory)
- Use WebGL for graph (force-graph library)
- Server-side search for large vaults
- Shard vault metadata if needed (per-folder metadata docs)

### Risk 4: React 17 & CRA (LOW-MEDIUM)

React 17 + Create React App is legacy. CRA is deprecated. The webpack config is ejected and customized.

**Mitigation**:
- Upgrade to React 18 (mostly compatible)
- Migrate from CRA to Vite (faster builds, better DX, smaller bundles)
- Do this in Phase 1 as part of the app shell rebuild

---

## Technology Recommendations

| Need | Recommendation | Rationale |
|---|---|---|
| **CRDT engine** | Upgrade to `@automerge/automerge` 2.x | Better rich text, official ProseMirror binding |
| **Editor** | Keep ProseMirror, consider TipTap wrapper | TipTap provides extensions for lists, tables, etc. |
| **ProseMirror-CRDT bridge** | `@automerge/prosemirror` | Official binding, replaces custom bridge code |
| **Bundler** | Migrate to Vite | Fast, modern, replaces CRA+Webpack |
| **React** | Upgrade to React 18 | Concurrent features, better perf |
| **Routing** | `react-router` v6 or `@tanstack/router` | Replace wouter with full routing |
| **Tree view** | `react-arborist` | Best React tree component |
| **Graph** | `force-graph` (2D) | WebGL performance, simple API |
| **Search** | `MiniSearch` (client), Meilisearch (server) | Fast, lightweight full-text search |
| **Fuzzy search** | `fuse.js` | For quick switcher and command palette |
| **Markdown parsing** | `prosemirror-markdown` + `markdown-it` | Standard markdown ↔ ProseMirror |
| **Canvas** | `tldraw` | Open-source, collaborative-ready |
| **CSS-in-JS** | Keep `@emotion` or migrate to CSS modules | Existing codebase uses Emotion |
| **Split panes** | `allotment` | Lightweight, VSCode-style resizable panes |
| **State management** | `zustand` or `jotai` | Lightweight, replaces ad-hoc state |

---

## Phase Summary & Timeline

| Phase | Scope | Effort | Cumulative |
|---|---|---|---|
| **Phase 1** | Core Identity (data model, markdown, wiki-links, file explorer, backlinks, quick switcher, app shell) | 14–18 weeks | 14–18 weeks |
| **Phase 2** | Knowledge Management (search, tags, frontmatter, graph view, templates, aliases) | 12–16 weeks | 26–34 weeks |
| **Phase 3** | Power User UX (command palette, tabs, split panes, outline, daily notes, hover preview, bookmarks) | 10–14 weeks | 36–48 weeks |
| **Phase 4** | Platform (embeds, callouts, plugins, themes, canvas, shared vaults) | 16–22 weeks | 52–70 weeks |

### With 1 developer: ~12–18 months total
### With 2 developers: ~6–9 months total

### Recommended first milestone (demo-able MVP): Phase 1 + search + graph view = ~18–24 weeks for 1 dev

---

## What Would Make This Special

The result wouldn't just be "Obsidian in the browser." It would be something genuinely new:

1. **Multiplayer knowledge bases**: Real-time collaborative wiki-linking. See your teammate add a connection in the graph live.
2. **Branch-and-merge for knowledge**: Upwelling's draft/merge system could become "knowledge branches" — explore a reorganization of your vault on a branch, then merge it back.
3. **Web-native sharing**: Share a note or vault via URL. No app install required.
4. **Collaborative graph**: Multiple people exploring and building the knowledge graph together.
5. **Attribution built in**: See who wrote what, when, across the entire vault. Knowledge provenance.

The CRDT foundation makes all of this possible in ways that Obsidian — built as a single-user desktop app — fundamentally cannot replicate.
