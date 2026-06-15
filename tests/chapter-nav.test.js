const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectChapterTargets,
  parseCatalogChapters,
  parseCatalogPageLinks,
  parseCatalogNextPage,
  renderCatalogPanel,
  renderChapterNav,
  removeChapterNav,
  syncChapterNav
} = require("../src/chapter-nav.js");

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
      if (selector === ".brp-chapter-nav") {
        return body.appended.find((element) => element.className === "brp-chapter-nav") || null;
      }

      if (selector === ".brp-catalog-panel") {
        return body.appended.find((element) => element.className === "brp-catalog-panel") || null;
      }

      return null;
    },
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        textContent: "",
        href: "",
        title: "",
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

test("parses and deduplicates chapter links from catalog html", () => {
  const chapters = parseCatalogChapters(`
    <nav><a href="/">首页</a><a href="/login">登录</a></nav>
    <main>
      <a href="chapter-1.html">第1章 初见</a>
      <a href="chapter-2.html">第2章 风起</a>
      <a href="chapter-1.html">第1章 初见</a>
      <a href="next.html">下一章</a>
      <a href="catalog.html">目录</a>
    </main>
  `, "https://example.test/book/catalog.html");

  assert.deepEqual(chapters, [
    { title: "第1章 初见", href: "https://example.test/book/chapter-1.html" },
    { title: "第2章 风起", href: "https://example.test/book/chapter-2.html" }
  ]);
});

test("detects catalog pagination next page without treating next chapter as pagination", () => {
  const nextPage = parseCatalogNextPage(`
    <a href="chapter-2.html">下一章</a>
    <a href="catalog-2.html">下一页</a>
  `, "https://example.test/book/catalog-1.html");

  assert.equal(nextPage, "https://example.test/book/catalog-2.html");
});

test("detects numbered partlist catalog pagination links", () => {
  const pageLinks = parseCatalogPageLinks(`
    <a href="/partlist/10490/29393323.html">1</a>
    <a href="/partlist/10490/29393324.html">2</a>
    <a href="/partlist/10490/29393325.html">第3页</a>
    <a href="/book/10490/2.html">第2章 风起</a>
  `, "https://m.qbxs8.net/partlist/10490/29393323.html", new Set([
    "https://m.qbxs8.net/partlist/10490/29393323.html"
  ]));

  assert.deepEqual(pageLinks, [
    "https://m.qbxs8.net/partlist/10490/29393324.html",
    "https://m.qbxs8.net/partlist/10490/29393325.html"
  ]);
});

test("detects catalog pagination from select options", () => {
  const pageLinks = parseCatalogPageLinks(`
    <select>
      <option value="/partlist/10490/29393323.html">第1页</option>
      <option value="/partlist/10490/29393324.html">第2页</option>
    </select>
  `, "https://m.qbxs8.net/partlist/10490/29393323.html", new Set([
    "https://m.qbxs8.net/partlist/10490/29393323.html"
  ]));

  assert.deepEqual(pageLinks, [
    "https://m.qbxs8.net/partlist/10490/29393324.html"
  ]);
});

test("renders previous and next controls only", () => {
  const doc = createDocumentFixture();

  renderChapterNav(doc, {
    previous: { href: "https://example.test/1.html" },
    contents: { href: "https://example.test/index.html" },
    next: { href: "https://example.test/3.html" }
  });

  const nav = doc.querySelector(".brp-chapter-nav");
  assert.ok(nav);
  assert.equal(nav.children.length, 2);
  assert.equal(nav.children[0].href, "https://example.test/1.html");
  assert.equal(nav.children[1].href, "https://example.test/3.html");
});

test("renders catalog panel with chapter count and links", () => {
  const doc = createDocumentFixture();

  renderCatalogPanel(doc, {
    status: "ready",
    catalogHref: "https://example.test/index.html",
    chapters: [
      { title: "第1章 初见", href: "https://example.test/1.html" },
      { title: "第2章 风起", href: "https://example.test/2.html" }
    ]
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.ok(panel);
  assert.equal(panel.children[0].textContent, "目录 · 2章");
  assert.equal(panel.children[1].children.length, 2);
  assert.equal(panel.children[1].children[0].href, "https://example.test/1.html");
});

test("removeChapterNav removes the existing panel", () => {
  const doc = createDocumentFixture();

  renderChapterNav(doc, { previous: null, contents: null, next: null });
  renderCatalogPanel(doc, { status: "empty", catalogHref: null, chapters: [] });
  assert.ok(doc.querySelector(".brp-chapter-nav"));
  assert.ok(doc.querySelector(".brp-catalog-panel"));

  removeChapterNav(doc);
  assert.equal(doc.querySelector(".brp-chapter-nav"), null);
  assert.equal(doc.querySelector(".brp-catalog-panel"), null);
});

test("syncChapterNav removes panels when reading enhancement is disabled", async () => {
  const doc = createDocumentFixture();

  renderChapterNav(doc, { previous: null, contents: null, next: null });
  renderCatalogPanel(doc, { status: "empty", catalogHref: null, chapters: [] });
  await syncChapterNav(doc, false);

  assert.equal(doc.querySelector(".brp-chapter-nav"), null);
  assert.equal(doc.querySelector(".brp-catalog-panel"), null);
});

test("syncChapterNav renders right controls and fetched catalog when enabled", async () => {
  const doc = createDocumentFixture();
  doc.querySelectorAll = (selector) => {
    assert.equal(selector, "a[href]");
    return [
      linkFixture({ text: "上一章", href: "https://example.test/1.html" }),
      linkFixture({ text: "目录", href: "https://example.test/index.html" }),
      linkFixture({ text: "下一章", href: "https://example.test/3.html" })
    ];
  };

  await syncChapterNav(doc, true, {
    fetchCatalog: async (href) => {
      assert.equal(href, "https://example.test/index.html");
      return `
        <a href="1.html">第1章 初见</a>
        <a href="2.html">第2章 风起</a>
      `;
    }
  });

  const nav = doc.querySelector(".brp-chapter-nav");
  const panel = doc.querySelector(".brp-catalog-panel");
  assert.ok(nav);
  assert.ok(panel);
  assert.equal(nav.children.length, 2);
  assert.equal(nav.children[0].href, "https://example.test/1.html");
  assert.equal(nav.children[1].href, "https://example.test/3.html");
  assert.equal(panel.children[0].textContent, "目录 · 2章");
});

test("syncChapterNav follows paginated catalog pages and deduplicates chapters", async () => {
  const doc = createDocumentFixture();
  const fetched = [];
  doc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: "https://example.test/book/catalog-1.html" })
  ];

  await syncChapterNav(doc, true, {
    fetchCatalog: async (href) => {
      fetched.push(href);

      if (href.endsWith("catalog-1.html")) {
        return `
          <a href="1.html">第1章 初见</a>
          <a href="2.html">第2章 风起</a>
          <a href="catalog-2.html">2</a>
        `;
      }

      return `
        <a href="2.html">第2章 风起</a>
        <a href="3.html">第3章 入城</a>
      `;
    }
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.deepEqual(fetched, [
    "https://example.test/book/catalog-1.html",
    "https://example.test/book/catalog-2.html"
  ]);
  assert.equal(panel.children[0].textContent, "目录 · 3章");
  assert.equal(panel.children[1].children[2].href, "https://example.test/book/3.html");
});

test("syncChapterNav renders catalog fallback when fetch fails", async () => {
  const doc = createDocumentFixture();
  doc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: "https://example.test/index.html" })
  ];

  await syncChapterNav(doc, true, {
    fetchCatalog: async () => {
      throw new Error("network blocked");
    }
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.ok(panel);
  assert.equal(panel.children[0].textContent, "目录");
  assert.equal(panel.children[1].textContent, "目录加载失败");
});

test("syncChapterNav ignores stale catalog responses after disabling", async () => {
  const doc = createDocumentFixture();
  let resolveCatalog;
  const pendingCatalog = new Promise((resolve) => {
    resolveCatalog = resolve;
  });

  doc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: "https://example.test/index.html" })
  ];

  const firstSync = syncChapterNav(doc, true, {
    fetchCatalog: async () => pendingCatalog
  });
  assert.ok(doc.querySelector(".brp-catalog-panel"));

  await syncChapterNav(doc, false);
  assert.equal(doc.querySelector(".brp-catalog-panel"), null);

  resolveCatalog('<a href="1.html">第1章 初见</a>');
  await firstSync;

  assert.equal(doc.querySelector(".brp-catalog-panel"), null);
});
