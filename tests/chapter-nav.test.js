const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectChapterTargets,
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
