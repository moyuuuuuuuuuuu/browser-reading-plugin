# Chapter Navigation Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed chapter navigation panel that appears only when reading enhancement is enabled and links to the detected previous chapter, table of contents, and next chapter targets.

**Architecture:** Move chapter navigation detection and rendering into `src/chapter-nav.js` as a small browser content-script helper. Load it before `src/content.js`, expose a `window.BRPChapterNav` API, and let `applySettings()` render or remove the panel based on the enabled setting. The extension remains a plain Manifest V3 browser plugin with no Node runtime, no package file, and no build step; Node is used only as a local development test runner and syntax checker.

**Tech Stack:** Chrome/Edge Manifest V3 content scripts, plain browser JavaScript, CSS. Local verification may use Node's built-in `node:test` without adding any shipped dependency.

---

## File Structure

- Create `src/chapter-nav.js`: owns link scoring, target detection, panel rendering, and panel removal. Exposes `window.BRPChapterNav` for the browser plugin and a guarded CommonJS export only so local tests can import the same helper code.
- Modify `src/content.js`: calls `BRPChapterNav.render()` when reading mode is enabled and `BRPChapterNav.remove()` when disabled.
- Modify `src/content.css`: styles the fixed panel and excludes it from cleanup hiding.
- Modify `manifest.json`: loads `src/chapter-nav.js` before `src/content.js`.
- Create `tests/chapter-nav.test.js`: covers detection, disabled buttons, and lifecycle removal.

### Task 1: Detection API

**Files:**
- Create: `src/chapter-nav.js`
- Create: `tests/chapter-nav.test.js`

- [ ] **Step 1: Write the failing detection tests**

Create `tests/chapter-nav.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");

const { detectChapterTargets } = require("../src/chapter-nav.js");

function linkFixture({
  text = "",
  href = "https://example.test/",
  rel = "",
  id = "",
  className = "",
  title = "",
  ariaLabel = "",
  visible = true,
  top = 0
}) {
  return {
    textContent: text,
    href,
    rel,
    id,
    className,
    title,
    getAttribute(name) {
      if (name === "aria-label") {
        return ariaLabel;
      }
      if (name === "href") {
        return href;
      }
      return "";
    },
    offsetParent: visible ? {} : null,
    getBoundingClientRect() {
      return { top, width: visible ? 80 : 0, height: visible ? 24 : 0 };
    }
  };
}

test("detects previous, contents, and next links from Chinese labels", () => {
  const targets = detectChapterTargets([
    linkFixture({ text: "上一章", href: "https://example.test/1.html" }),
    linkFixture({ text: "目录", href: "https://example.test/index.html" }),
    linkFixture({ text: "下一章", href: "https://example.test/3.html" })
  ]);

  assert.equal(targets.previous.href, "https://example.test/1.html");
  assert.equal(targets.contents.href, "https://example.test/index.html");
  assert.equal(targets.next.href, "https://example.test/3.html");
});

test("prefers direct link text over weaker attribute matches", () => {
  const targets = detectChapterTargets([
    linkFixture({
      text: "广告",
      href: "https://example.test/ad.html",
      className: "next"
    }),
    linkFixture({
      text: "下一章",
      href: "https://example.test/chapter-2.html"
    })
  ]);

  assert.equal(targets.next.href, "https://example.test/chapter-2.html");
});

test("ignores hidden links", () => {
  const targets = detectChapterTargets([
    linkFixture({ text: "下一章", href: "https://example.test/hidden.html", visible: false })
  ]);

  assert.equal(targets.next, null);
});
```

- [ ] **Step 2: Run detection tests to verify they fail**

Run:

```bash
node --test tests/chapter-nav.test.js
```

Expected: FAIL because `../src/chapter-nav.js` does not exist or does not export `detectChapterTargets`.

- [ ] **Step 3: Implement minimal detection helpers**

Create `src/chapter-nav.js`:

```javascript
(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.BRPChapterNav = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : null, function () {
  const ACTIONS = Object.freeze([
    {
      key: "previous",
      label: "上一章",
      textPatterns: [/上一章/, /上章/, /上一节/, /\bprev(?:ious)?\b/i],
      attrPatterns: [/\bprev(?:ious)?\b/i]
    },
    {
      key: "contents",
      label: "目录",
      textPatterns: [/目录/, /返回目录/, /章节目录/, /书页/, /\bindex\b/i, /\bcontents?\b/i, /\bcatalog\b/i],
      attrPatterns: [/\bindex\b/i, /\bcontents?\b/i, /\bcatalog\b/i]
    },
    {
      key: "next",
      label: "下一章",
      textPatterns: [/下一章/, /下章/, /下一节/, /\bnext\b/i],
      attrPatterns: [/\bnext\b/i]
    }
  ]);

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getLinkSignal(link) {
    const text = normalizeText(link.textContent);
    const ariaLabel = normalizeText(link.getAttribute && link.getAttribute("aria-label"));
    const title = normalizeText(link.title);
    const rel = normalizeText(link.rel);
    const id = normalizeText(link.id);
    const className = normalizeText(link.className);
    const href = normalizeText(link.getAttribute && link.getAttribute("href"));

    return {
      text: `${text} ${ariaLabel} ${title}`.trim(),
      attributes: `${rel} ${id} ${className} ${href}`.trim()
    };
  }

  function isVisibleLink(link) {
    if (!link || !link.href) {
      return false;
    }

    const rect = link.getBoundingClientRect ? link.getBoundingClientRect() : null;
    if (rect && rect.width <= 0 && rect.height <= 0) {
      return false;
    }

    return link.offsetParent !== null || !rect || rect.width > 0 || rect.height > 0;
  }

  function scoreLinkForAction(link, action) {
    const signal = getLinkSignal(link);
    let score = 0;

    if (action.textPatterns.some((pattern) => pattern.test(signal.text))) {
      score += 100;
    }

    if (action.attrPatterns.some((pattern) => pattern.test(signal.attributes))) {
      score += 25;
    }

    return score;
  }

  function linkCandidate(link, action) {
    const score = scoreLinkForAction(link, action);

    if (score <= 0) {
      return null;
    }

    const rect = link.getBoundingClientRect ? link.getBoundingClientRect() : { top: 0 };
    return {
      href: link.href,
      text: normalizeText(link.textContent) || action.label,
      score,
      top: Number.isFinite(rect.top) ? rect.top : 0
    };
  }

  function detectChapterTargets(links) {
    const visibleLinks = Array.from(links || []).filter(isVisibleLink);

    return ACTIONS.reduce((targets, action) => {
      const best = visibleLinks
        .map((link) => linkCandidate(link, action))
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || Math.abs(left.top) - Math.abs(right.top))[0] || null;

      targets[action.key] = best;
      return targets;
    }, {});
  }

  return {
    ACTIONS,
    detectChapterTargets
  };
});
```

- [ ] **Step 4: Run detection tests to verify they pass**

Run:

```bash
node --test tests/chapter-nav.test.js
```

Expected: PASS for the three detection tests.

- [ ] **Step 5: Commit detection API**

```bash
git add src/chapter-nav.js tests/chapter-nav.test.js
git commit -m "Add chapter link detection"
```

### Task 2: Render and Remove API

**Files:**
- Modify: `src/chapter-nav.js`
- Modify: `tests/chapter-nav.test.js`

- [ ] **Step 1: Write failing render lifecycle tests**

Append to `tests/chapter-nav.test.js`:

```javascript
const { renderChapterNav, removeChapterNav } = require("../src/chapter-nav.js");

function createDocumentFixture() {
  const elements = [];
  const body = {
    appended: [],
    appendChild(element) {
      this.appended.push(element);
      elements.push(element);
      element.parentNode = this;
      return element;
    },
    removeChild(element) {
      this.appended = this.appended.filter((item) => item !== element);
      element.parentNode = null;
      return element;
    }
  };

  return {
    body,
    created: elements,
    querySelector(selector) {
      if (selector !== ".brp-chapter-nav") {
        return null;
      }

      return body.appended.find((element) => element.className === "brp-chapter-nav") || null;
    },
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        textContent: "",
        href: "",
        role: "",
        attributes: {},
        children: [],
        parentNode: null,
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          return child;
        },
        remove() {
          if (this.parentNode && this.parentNode.removeChild) {
            this.parentNode.removeChild(this);
          }
        }
      };
    }
  };
}

test("renders all three nav items and disables missing targets", () => {
  const doc = createDocumentFixture();

  renderChapterNav(doc, {
    previous: { href: "https://example.test/1.html" },
    contents: null,
    next: { href: "https://example.test/3.html" }
  });

  const nav = doc.querySelector(".brp-chapter-nav");
  assert.ok(nav);
  assert.equal(nav.children.length, 3);
  assert.equal(nav.children[0].href, "https://example.test/1.html");
  assert.equal(nav.children[1].attributes["aria-disabled"], "true");
  assert.equal(nav.children[2].href, "https://example.test/3.html");
});

test("removeChapterNav removes the existing panel", () => {
  const doc = createDocumentFixture();

  renderChapterNav(doc, { previous: null, contents: null, next: null });
  assert.ok(doc.querySelector(".brp-chapter-nav"));

  removeChapterNav(doc);
  assert.equal(doc.querySelector(".brp-chapter-nav"), null);
});
```

- [ ] **Step 2: Run render tests to verify they fail**

Run:

```bash
node --test tests/chapter-nav.test.js
```

Expected: FAIL because `renderChapterNav` and `removeChapterNav` are not exported.

- [ ] **Step 3: Implement render and remove helpers**

Replace the `return` block in `src/chapter-nav.js` with:

```javascript
  function removeChapterNav(doc) {
    const existing = doc && doc.querySelector ? doc.querySelector(".brp-chapter-nav") : null;
    if (existing && existing.remove) {
      existing.remove();
    }
  }

  function createNavItem(doc, action, target) {
    const element = doc.createElement(target ? "a" : "span");
    element.className = "brp-chapter-nav__item";
    element.textContent = action.label;

    if (target && target.href) {
      element.href = target.href;
      element.title = target.text || action.label;
    } else {
      element.setAttribute("aria-disabled", "true");
      element.className += " brp-chapter-nav__item--disabled";
    }

    return element;
  }

  function renderChapterNav(doc, targets) {
    if (!doc || !doc.body) {
      return null;
    }

    removeChapterNav(doc);

    const nav = doc.createElement("nav");
    nav.className = "brp-chapter-nav";
    nav.setAttribute("aria-label", "章节导航");

    ACTIONS.forEach((action) => {
      nav.appendChild(createNavItem(doc, action, targets && targets[action.key]));
    });

    doc.body.appendChild(nav);
    return nav;
  }

  return {
    ACTIONS,
    detectChapterTargets,
    renderChapterNav,
    removeChapterNav
  };
```

- [ ] **Step 4: Run render tests to verify they pass**

Run:

```bash
node --test tests/chapter-nav.test.js
```

Expected: PASS for all tests.

- [ ] **Step 5: Commit render API**

```bash
git add src/chapter-nav.js tests/chapter-nav.test.js
git commit -m "Render chapter navigation panel"
```

### Task 3: Content Script Integration

**Files:**
- Modify: `manifest.json`
- Modify: `src/content.js`
- Modify: `tests/chapter-nav.test.js`

- [ ] **Step 1: Write failing enabled lifecycle test**

Append to `tests/chapter-nav.test.js`:

```javascript
const { syncChapterNav } = require("../src/chapter-nav.js");

test("syncChapterNav removes the panel when reading enhancement is disabled", () => {
  const doc = createDocumentFixture();

  renderChapterNav(doc, { previous: null, contents: null, next: null });
  syncChapterNav(doc, false);

  assert.equal(doc.querySelector(".brp-chapter-nav"), null);
});

test("syncChapterNav renders detected targets when reading enhancement is enabled", () => {
  const doc = createDocumentFixture();
  doc.querySelectorAll = (selector) => {
    assert.equal(selector, "a[href]");
    return [
      linkFixture({ text: "上一章", href: "https://example.test/1.html" }),
      linkFixture({ text: "目录", href: "https://example.test/index.html" }),
      linkFixture({ text: "下一章", href: "https://example.test/3.html" })
    ];
  };

  syncChapterNav(doc, true);

  const nav = doc.querySelector(".brp-chapter-nav");
  assert.ok(nav);
  assert.equal(nav.children[0].href, "https://example.test/1.html");
  assert.equal(nav.children[1].href, "https://example.test/index.html");
  assert.equal(nav.children[2].href, "https://example.test/3.html");
});
```

- [ ] **Step 2: Run lifecycle tests to verify they fail**

Run:

```bash
node --test tests/chapter-nav.test.js
```

Expected: FAIL because `syncChapterNav` is not exported.

- [ ] **Step 3: Implement `syncChapterNav`**

In `src/chapter-nav.js`, add before the final `return` block:

```javascript
  function syncChapterNav(doc, enabled) {
    if (!enabled) {
      removeChapterNav(doc);
      return null;
    }

    const links = doc && doc.querySelectorAll ? doc.querySelectorAll("a[href]") : [];
    return renderChapterNav(doc, detectChapterTargets(links));
  }
```

Then include `syncChapterNav` in the exported object.

- [ ] **Step 4: Wire the content script and manifest**

In `manifest.json`, change the content script `js` list to:

```json
"js": [
  "src/chapter-nav.js",
  "src/content.js"
]
```

In `src/content.js`, add this at the end of `applySettings(settings)`, after `root.dataset.brpTheme = currentSettings.theme;`:

```javascript
    if (window.BRPChapterNav && typeof window.BRPChapterNav.syncChapterNav === "function") {
      window.BRPChapterNav.syncChapterNav(document, currentSettings.enabled);
    }
```

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
node --test tests/chapter-nav.test.js
node --check src/chapter-nav.js
node --check src/content.js
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```

Expected: tests PASS, JavaScript syntax checks produce no output, manifest check prints `manifest ok`.

- [ ] **Step 6: Commit integration**

```bash
git add manifest.json src/content.js src/chapter-nav.js tests/chapter-nav.test.js
git commit -m "Sync chapter navigation with reading mode"
```

### Task 4: Panel Styling and Cleanup Safety

**Files:**
- Modify: `src/content.css`

- [ ] **Step 1: Add panel styles**

Append to `src/content.css`:

```css
html.brp-reading-enabled body .brp-chapter-nav {
  position: fixed !important;
  top: 50% !important;
  left: max(12px, calc((100vw - var(--brp-content-width)) / 2 - 96px)) !important;
  z-index: 2147483646 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  width: 76px !important;
  transform: translateY(-50%) !important;
  pointer-events: auto !important;
}

html.brp-reading-enabled body .brp-chapter-nav__item {
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 38px !important;
  padding: 8px 10px !important;
  border: 1px solid var(--brp-border) !important;
  border-radius: 8px !important;
  background: color-mix(in srgb, var(--brp-surface) 92%, var(--brp-bg)) !important;
  color: var(--brp-link) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  font-size: 14px !important;
  line-height: 1.25 !important;
  text-align: center !important;
  text-decoration: none !important;
  white-space: normal !important;
}

html.brp-reading-enabled body .brp-chapter-nav__item:hover {
  background: var(--brp-surface) !important;
  text-decoration: none !important;
}

html.brp-reading-enabled body .brp-chapter-nav__item--disabled {
  color: var(--brp-muted) !important;
  cursor: not-allowed !important;
  opacity: 0.56 !important;
}

@media (max-width: 760px) {
  html.brp-reading-enabled body .brp-chapter-nav {
    left: 8px !important;
    width: 54px !important;
  }

  html.brp-reading-enabled body .brp-chapter-nav__item {
    min-height: 34px !important;
    padding: 6px !important;
    font-size: 12px !important;
  }
}
```

- [ ] **Step 2: Exclude the panel from cleanup hiding**

In `src/content.css`, update the cleanup selector block so the rule ends with `:not(.brp-chapter-nav):not(.brp-chapter-nav *)` before the declaration:

```css
html.brp-reading-cleanup body :where(
  .adsbygoogle,
  [class~="ad"],
  [class~="ads"],
  [id~="ad"],
  [id~="ads"],
  [class*="advert" i],
  [id*="advert" i],
  [class*="banner" i],
  [id*="banner" i],
  [class*="popup" i],
  [id*="popup" i],
  [class*="float" i],
  [id*="float" i],
  [class*="sidebar" i],
  [id*="sidebar" i],
  [class*="recommend" i],
  [id*="recommend" i],
  [class*="share" i],
  [id*="share" i],
  [class*="toolbar" i],
  [id*="toolbar" i]
):not(.brp-chapter-nav):not(.brp-chapter-nav *) {
  display: none !important;
}
```

- [ ] **Step 3: Run syntax and test verification**

Run:

```bash
node --test tests/chapter-nav.test.js
node --check src/chapter-nav.js
node --check src/content.js
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```

Expected: tests PASS, JavaScript syntax checks produce no output, manifest check prints `manifest ok`.

- [ ] **Step 4: Commit styling**

```bash
git add src/content.css
git commit -m "Style chapter navigation sidebar"
```

### Task 5: Documentation and Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new behavior**

In `README.md`, add a feature bullet:

```markdown
- 阅读增强开启时，自动识别上一章、目录、下一章链接，并在正文左侧显示垂直居中的固定导航；未识别到的按钮会置灰。
```

In the compatibility section, add:

```markdown
章节导航通过链接文字和常见属性自动识别，不会移动原网站 DOM。少数站点如果导航文字过于特殊，可能只显示置灰按钮。
```

- [ ] **Step 2: Run full lightweight verification**

Run:

```bash
node --test tests/chapter-nav.test.js
node --check src/chapter-nav.js
node --check src/content.js
node --check popup/popup.js
node -e "JSON.parse(require('node:fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"
```

Expected: all tests PASS, JavaScript syntax checks produce no output, manifest check prints `manifest ok`.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- manifest.json src/content.js src/content.css src/chapter-nav.js tests/chapter-nav.test.js README.md
```

Expected: diff includes only chapter navigation implementation, styling, tests, manifest loading, and README updates.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md
git commit -m "Document chapter navigation sidebar"
```

## Self-Review

- Spec coverage: The tasks cover enabled-only display, non-mutating DOM detection, three stable actions, disabled missing actions, removal on disable, CSS placement left of the content, cleanup safety, and documentation.
- Placeholder scan: No `TBD`, `TODO`, or incomplete implementation steps remain.
- Type consistency: The plan consistently uses `detectChapterTargets`, `renderChapterNav`, `removeChapterNav`, and `syncChapterNav` from `src/chapter-nav.js`.
