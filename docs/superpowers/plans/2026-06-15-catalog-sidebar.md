# Catalog Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch and render a complete chapter catalog in a fixed left panel, while moving previous/next controls to a fixed right panel.

**Architecture:** Extend `src/chapter-nav.js` with catalog parsing, async catalog loading, stale request protection, and separate render functions for the left catalog panel and right chapter controls. Keep the browser plugin dependency-free; Node is only used for local tests and syntax checks.

**Tech Stack:** Chrome/Edge Manifest V3 content scripts, plain browser JavaScript, CSS, Node `node:test` for local verification.

---

## File Structure

- Modify `src/chapter-nav.js`: add catalog parsing, catalog fetch lifecycle, and split renderers.
- Modify `tests/chapter-nav.test.js`: add parser, async sync, and split-layout tests.
- Modify `src/content.css`: style `.brp-catalog-panel` on the left and `.brp-chapter-nav` on the right.
- Modify `README.md`: document complete catalog fetching behavior and fallback limits.

## Tasks

- [ ] Add failing parser tests for chapter extraction, deduplication, and navigation exclusion.
- [ ] Implement `parseCatalogChapters(html, baseUrl)` and export it for tests.
- [ ] Add failing render tests for a left catalog panel and right previous/next-only panel.
- [ ] Split rendering into `renderChapterNav()` for previous/next and `renderCatalogPanel()` for catalog states.
- [ ] Add failing async tests for successful catalog fetch, failed catalog fetch, and disabled cleanup.
- [ ] Implement `syncChapterNav(doc, enabled, options)` as an async-aware browser lifecycle helper with stale request protection.
- [ ] Update CSS for left catalog and right previous/next panels.
- [ ] Update README.
- [ ] Run full verification:

```bash
node --test tests/chapter-nav.test.js
node --check src/chapter-nav.js
node --check src/content.js
node --check popup/popup.js
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```
