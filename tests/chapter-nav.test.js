const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectChapterTargets,
  parseCatalogChapters,
  parseCatalogChaptersFromLinks,
  parseCatalogPageLinks,
  parseFullCatalogHref,
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
  const listeners = {};
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
    location: {
      hostname: "example.test",
      href: "https://example.test/"
    },
    defaultView: {
      innerWidth: 1200,
      innerHeight: 900
    },
    addEventListener(name, handler) {
      listeners[name] = handler;
    },
    removeEventListener(name) {
      delete listeners[name];
    },
    dispatchEvent(event) {
      if (listeners[event.type]) {
        listeners[event.type](event);
      }
    },
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
      const element = {
        tagName: tagName.toUpperCase(),
        className: "",
        textContent: "",
        href: "",
        title: "",
        attributes: {},
        children: [],
        listeners: {},
        parentNode: null,
        style: {},
        ownerDocument: null,
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        getAttribute(name) {
          return this.attributes[name] || "";
        },
        addEventListener(name, handler) {
          this.listeners[name] = handler;
        },
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          return child;
        },
        click() {
          if (this.listeners.click) {
            this.listeners.click();
          }
        },
        dispatchEvent(event) {
          if (this.listeners[event.type]) {
            this.listeners[event.type](event);
          }
        },
        getBoundingClientRect() {
          return {
            left: Number.parseFloat(this.style.left) || 20,
            top: Number.parseFloat(this.style.top) || 30,
            width: Number.parseFloat(this.style.width) || 120,
            height: Number.parseFloat(this.style.height) || 80
          };
        },
        remove() {
          if (this.parentNode && this.parentNode.removeChild) {
            this.parentNode.removeChild(this);
          }
        }
      };
      element.ownerDocument = this;
      return element;
    }
  };
}

function createChromeStorageFixture(initialValues) {
  const values = { ...(initialValues || {}) };

  return {
    values,
    api: {
      runtime: {
        lastError: null
      },
      storage: {
        local: {
          get(key, callback) {
            callback({ [key]: values[key] });
          },
          set(nextValues, callback) {
            Object.assign(values, nextValues);
            callback();
          },
          remove(key, callback) {
            delete values[key];
            callback();
          }
        }
      }
    }
  };
}

async function withGlobals(overrides, callback) {
  const previous = {};

  Object.keys(overrides).forEach((key) => {
    previous[key] = globalThis[key];
    globalThis[key] = overrides[key];
  });

  try {
    return await callback();
  } finally {
    Object.keys(overrides).forEach((key) => {
      if (previous[key] === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = previous[key];
      }
    });
  }
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

test("extracts current page chapter links as catalog fallback", () => {
  const chapters = parseCatalogChaptersFromLinks([
    linkFixture({ text: "返回目录", href: "https://m.qbxs8.net/partlist/10490/" }),
    linkFixture({ text: "上一章", href: "https://m.qbxs8.net/partlist/10490/29393325.html" }),
    linkFixture({ text: "点击阅读", href: "https://m.qbxs8.net/partlist/10490/29359284.html" }),
    linkFixture({ text: "第1207章 顾葬天的备用方案？", href: "https://m.qbxs8.net/partlist/10490/32447973.html" }),
    linkFixture({ text: "第1208章 绝路刚子", href: "https://m.qbxs8.net/partlist/10490/32448456.html" })
  ], "https://m.qbxs8.net/partlist/10490/29393323.html");

  assert.deepEqual(chapters, [
    { title: "第1207章 顾葬天的备用方案？", href: "https://m.qbxs8.net/partlist/10490/32447973.html" },
    { title: "第1208章 绝路刚子", href: "https://m.qbxs8.net/partlist/10490/32448456.html" }
  ]);
});

test("detects full catalog entry before parsing latest-chapter catalog page", () => {
  const href = parseFullCatalogHref(`
    <a href="/partlist/10490/new.html">最新章节</a>
    <a href="/partlist/10490/all.html">全部章节</a>
  `, "https://m.qbxs8.net/partlist/10490/");

  assert.equal(href, "https://m.qbxs8.net/partlist/10490/all.html");
});

test("detects full catalog entry from nearby heading text", () => {
  const href = parseFullCatalogHref(`
    <section class="latest">
      <h2>最新章节</h2>
      <a href="/partlist/10490/32448456.html">第1208章 绝路刚子</a>
    </section>
    <section class="all-chapters">
      <h2>全部章节目录</h2>
      <a href="/partlist/10490/all.html">点击查看</a>
    </section>
  `, "https://m.qbxs8.net/partlist/10490/");

  assert.equal(href, "https://m.qbxs8.net/partlist/10490/all.html");
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
  assert.equal(nav.children.length, 3);
  assert.equal(nav.children[0].className, "brp-chapter-nav__drag");
  assert.equal(nav.children[1].href, "https://example.test/1.html");
  assert.equal(nav.children[2].href, "https://example.test/3.html");
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
  assert.equal(panel.children[1].textContent, "重新获取");
  assert.equal(panel.children[2].children.length, 2);
  assert.equal(panel.children[2].children[0].href, "https://example.test/1.html");
});

test("catalog refresh button calls its handler", () => {
  const doc = createDocumentFixture();
  let clicked = false;

  renderCatalogPanel(doc, {
    status: "ready",
    catalogHref: "https://example.test/index.html",
    chapters: [{ title: "第1章 初见", href: "https://example.test/1.html" }],
    onRefresh() {
      clicked = true;
    }
  });

  doc.querySelector(".brp-catalog-panel").children[1].click();
  assert.equal(clicked, true);
});

test("renderCatalogPanel applies persisted drag position", async () => {
  const doc = createDocumentFixture();
  const storage = createChromeStorageFixture({
    "brp:panel-position:v1:example.test:catalog": {
      version: 1,
      left: 160,
      top: 120
    }
  });

  await withGlobals({ chrome: storage.api }, async () => {
    renderCatalogPanel(doc, {
      status: "ready",
      catalogHref: "https://example.test/index.html",
      chapters: [{ title: "第1章 初见", href: "https://example.test/1.html" }]
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.equal(panel.style.left, "160px");
  assert.equal(panel.style.top, "120px");
  assert.equal(panel.style.right, "auto");
  assert.equal(panel.style.transform, "none");
});

test("renderCatalogPanel persists position after dragging title", async () => {
  const doc = createDocumentFixture();
  const storage = createChromeStorageFixture();

  await withGlobals({ chrome: storage.api }, async () => {
    renderCatalogPanel(doc, {
      status: "ready",
      catalogHref: "https://example.test/index.html",
      chapters: [{ title: "第1章 初见", href: "https://example.test/1.html" }]
    });

    const panel = doc.querySelector(".brp-catalog-panel");
    const title = panel.children[0];
    title.dispatchEvent({
      type: "pointerdown",
      clientX: 30,
      clientY: 40,
      preventDefault() {}
    });
    doc.dispatchEvent({ type: "pointermove", clientX: 130, clientY: 90, preventDefault() {} });
    doc.dispatchEvent({ type: "pointerup", preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(storage.values["brp:panel-position:v1:example.test:catalog"], {
    version: 1,
    left: 120,
    top: 80
  });
});

test("renderChapterNav persists position after dragging handle", async () => {
  const doc = createDocumentFixture();
  const storage = createChromeStorageFixture();

  await withGlobals({ chrome: storage.api }, async () => {
    renderChapterNav(doc, {
      previous: { href: "https://example.test/1.html" },
      next: { href: "https://example.test/3.html" }
    });

    const nav = doc.querySelector(".brp-chapter-nav");
    const handle = nav.children[0];
    handle.dispatchEvent({
      type: "pointerdown",
      clientX: 25,
      clientY: 35,
      preventDefault() {}
    });
    doc.dispatchEvent({ type: "pointermove", clientX: 55, clientY: 95, preventDefault() {} });
    doc.dispatchEvent({ type: "pointerup", preventDefault() {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(storage.values["brp:panel-position:v1:example.test:chapter-nav"], {
    version: 1,
    left: 50,
    top: 90
  });
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
  assert.equal(nav.children.length, 3);
  assert.equal(nav.children[0].className, "brp-chapter-nav__drag");
  assert.equal(nav.children[1].href, "https://example.test/1.html");
  assert.equal(nav.children[2].href, "https://example.test/3.html");
  assert.equal(panel.children[0].textContent, "目录 · 2章");
});

test("syncChapterNav uses persisted catalog cache before fetching", async () => {
  const doc = createDocumentFixture();
  const catalogHref = "https://example.test/book/index.html";
  doc.title = "测试小说 第3章";
  const cacheKey = `brp:catalog:v1:测试小说::${catalogHref}`;
  const storage = createChromeStorageFixture({
    [cacheKey]: {
      version: 1,
      bookName: "测试小说",
      chapters: [
        { title: "第1章 缓存", href: "https://example.test/book/1.html" }
      ]
    }
  });

  doc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: catalogHref })
  ];

  await withGlobals({
    chrome: storage.api,
    fetch: async () => {
      throw new Error("should not fetch when persisted cache exists");
    }
  }, async () => {
    await syncChapterNav(doc, true);
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.equal(panel.children[0].textContent, "目录 · 1章");
  assert.equal(panel.children[2].children[0].textContent, "第1章 缓存");
});

test("syncChapterNav clears persisted catalog cache on forced refresh", async () => {
  const doc = createDocumentFixture();
  const catalogHref = "https://example.test/book/refresh.html";
  doc.title = "刷新小说_第1章";
  const cacheKey = `brp:catalog:v1:刷新小说::${catalogHref}`;
  const storage = createChromeStorageFixture({
    [cacheKey]: {
      version: 1,
      bookName: "刷新小说",
      chapters: [
        { title: "第1章 旧缓存", href: "https://example.test/book/old.html" }
      ]
    }
  });
  let fetchCount = 0;

  doc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: catalogHref })
  ];

  await withGlobals({
    chrome: storage.api,
    fetch: async () => {
      fetchCount += 1;
      return {
        ok: true,
        text: async () => '<a href="new.html">第2章 新目录</a>'
      };
    }
  }, async () => {
    await syncChapterNav(doc, true, { forceRefresh: true });
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.equal(fetchCount, 1);
  assert.equal(panel.children[0].textContent, "目录 · 1章");
  assert.equal(panel.children[2].children[0].textContent, "第2章 新目录");
  assert.equal(storage.values[cacheKey].chapters[0].title, "第2章 新目录");
});

test("syncChapterNav separates persisted catalog cache by book name", async () => {
  const firstDoc = createDocumentFixture();
  const secondDoc = createDocumentFixture();
  const catalogHref = "https://example.test/shared/index.html";
  const firstKey = `brp:catalog:v1:第一本书::${catalogHref}`;
  const secondKey = `brp:catalog:v1:第二本书::${catalogHref}`;
  const storage = createChromeStorageFixture({
    [firstKey]: {
      version: 1,
      bookName: "第一本书",
      chapters: [
        { title: "第1章 第一本缓存", href: "https://example.test/first/1.html" }
      ]
    }
  });
  let fetchCount = 0;

  firstDoc.title = "第一本书 第9章";
  firstDoc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: catalogHref })
  ];
  secondDoc.title = "第二本书 第1章";
  secondDoc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: catalogHref })
  ];

  await withGlobals({
    chrome: storage.api,
    fetch: async () => {
      fetchCount += 1;
      return {
        ok: true,
        text: async () => '<a href="second-1.html">第1章 第二本目录</a>'
      };
    }
  }, async () => {
    await syncChapterNav(firstDoc, true);
    await syncChapterNav(secondDoc, true);
  });

  const firstPanel = firstDoc.querySelector(".brp-catalog-panel");
  const secondPanel = secondDoc.querySelector(".brp-catalog-panel");
  assert.equal(fetchCount, 1);
  assert.equal(firstPanel.children[2].children[0].textContent, "第1章 第一本缓存");
  assert.equal(secondPanel.children[2].children[0].textContent, "第1章 第二本目录");
  assert.equal(storage.values[secondKey].chapters[0].title, "第1章 第二本目录");
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
  assert.equal(panel.children[2].children[2].href, "https://example.test/book/3.html");
});

test("syncChapterNav follows more than eight catalog pages by default", async () => {
  const doc = createDocumentFixture();
  const fetched = [];
  doc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: "https://example.test/book/catalog-1.html" })
  ];

  await syncChapterNav(doc, true, {
    fetchCatalog: async (href) => {
      fetched.push(href);
      const page = Number(/catalog-(\d+)\.html/.exec(href)[1]);
      const next = page < 10 ? `<a href="catalog-${page + 1}.html">下一页</a>` : "";
      return `
        <a href="chapter-${page}.html">第${page}章 标题</a>
        ${next}
      `;
    }
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.equal(fetched.length, 10);
  assert.equal(panel.children[0].textContent, "目录 · 10章");
});

test("syncChapterNav follows full catalog entry before paginated catalog pages", async () => {
  const doc = createDocumentFixture();
  const fetched = [];
  doc.querySelectorAll = () => [
    linkFixture({ text: "目录", href: "https://m.qbxs8.net/partlist/10490/" })
  ];

  await syncChapterNav(doc, true, {
    fetchCatalog: async (href) => {
      fetched.push(href);

      if (href.endsWith("/10490/")) {
        return `
          <a href="/partlist/10490/32448456.html">第1208章 绝路刚子</a>
          <a href="/partlist/10490/all.html">全部章节</a>
        `;
      }

      if (href.endsWith("all.html")) {
        return `
          <a href="/partlist/10490/1.html">第1章 初见</a>
          <a href="/partlist/10490/2.html">第2章 风起</a>
          <a href="/partlist/10490/all-2.html">下一页</a>
        `;
      }

      return '<a href="/partlist/10490/3.html">第3章 入城</a>';
    }
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.deepEqual(fetched, [
    "https://m.qbxs8.net/partlist/10490/",
    "https://m.qbxs8.net/partlist/10490/all.html",
    "https://m.qbxs8.net/partlist/10490/all-2.html"
  ]);
  assert.equal(panel.children[0].textContent, "目录 · 3章");
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
  assert.equal(panel.children[1].textContent, "重新获取");
  assert.equal(panel.children[2].textContent, "目录加载失败");
});

test("syncChapterNav uses current page chapter links when catalog fetch fails", async () => {
  const doc = createDocumentFixture();
  doc.location = { href: "https://m.qbxs8.net/partlist/10490/29393323.html" };
  doc.querySelectorAll = () => [
    linkFixture({ text: "返回目录", href: "https://m.qbxs8.net/partlist/10490/" }),
    linkFixture({ text: "第1207章 顾葬天的备用方案？", href: "https://m.qbxs8.net/partlist/10490/32447973.html" }),
    linkFixture({ text: "第1208章 绝路刚子", href: "https://m.qbxs8.net/partlist/10490/32448456.html" })
  ];

  await syncChapterNav(doc, true, {
    fetchCatalog: async () => {
      throw new Error("challenge");
    }
  });

  const panel = doc.querySelector(".brp-catalog-panel");
  assert.ok(panel);
  assert.equal(panel.children[0].textContent, "目录 · 2章");
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
