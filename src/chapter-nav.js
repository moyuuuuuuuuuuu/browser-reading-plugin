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

  const CHAPTER_ACTIONS = Object.freeze(ACTIONS.filter((action) => action.key !== "contents"));
  const EXCLUDED_CATALOG_TEXT = /^(首页|主页|目录|返回目录|章节目录|上一章|下一章|上章|下章|登录|注册|搜索|书架|返回|prev|previous|next|index|contents?|catalog)$/i;
  const CHAPTER_TEXT_PATTERN = /(^第\s*[0-9零一二三四五六七八九十百千万两]+\s*[章节回卷集部篇])|(\bchapter\s*\d+\b)|(^\d+[\s.、_-]*\S+)/i;
  const CHAPTER_HREF_PATTERN = /(chapter|read|\/\d+\.html?$|[_-]\d+\.html?$)/i;
  const CATALOG_NEXT_PAGE_PATTERN = /^(下一页|下页|后页|后一页|next\s*page|more|>|›|»|>>)$/i;
  const CATALOG_PAGE_NUMBER_PATTERN = /^(第\s*)?\d+\s*页?$/;
  const CATALOG_PAGE_HREF_PATTERN = /(partlist|catalog|chapterlist|list|index)/i;
  const MAX_CATALOG_PAGES = 8;
  const catalogCache = new Map();
  let syncVersion = 0;

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

  function resolveUrl(href, baseUrl) {
    try {
      return new URL(href, baseUrl).href;
    } catch (_error) {
      return "";
    }
  }

  function getAnchorMatchesFromHtml(html) {
    const matches = [];
    const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match = anchorPattern.exec(String(html || ""));

    while (match) {
      const attributes = match[1] || "";
      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
      const rawText = match[2] || "";
      const text = normalizeText(rawText.replace(/<[^>]*>/g, " "));

      if (hrefMatch) {
        matches.push({
          href: hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || "",
          text,
          attributes
        });
      }

      match = anchorPattern.exec(String(html || ""));
    }

    return matches;
  }

  function getAnchorMatches(html) {
    if (typeof DOMParser !== "function") {
      return getAnchorMatchesFromHtml(html);
    }

    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    return Array.from(parsed.querySelectorAll("a[href]")).map((anchor) => ({
      href: anchor.getAttribute("href") || "",
      text: normalizeText(anchor.textContent),
      attributes: normalizeText([
        anchor.getAttribute("rel"),
        anchor.getAttribute("id"),
        anchor.getAttribute("class"),
        anchor.getAttribute("title"),
        anchor.getAttribute("aria-label")
      ].filter(Boolean).join(" "))
    }));
  }

  function getOptionMatchesFromHtml(html) {
    const matches = [];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let match = optionPattern.exec(String(html || ""));

    while (match) {
      const attributes = match[1] || "";
      const valueMatch = /\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
      const text = normalizeText((match[2] || "").replace(/<[^>]*>/g, " "));

      if (valueMatch) {
        matches.push({
          href: valueMatch[1] || valueMatch[2] || valueMatch[3] || "",
          text,
          attributes
        });
      }

      match = optionPattern.exec(String(html || ""));
    }

    return matches;
  }

  function getOptionMatches(html) {
    if (typeof DOMParser !== "function") {
      return getOptionMatchesFromHtml(html);
    }

    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    return Array.from(parsed.querySelectorAll("option[value]")).map((option) => ({
      href: option.getAttribute("value") || "",
      text: normalizeText(option.textContent),
      attributes: normalizeText(option.outerHTML)
    }));
  }

  function isLikelyChapter(anchor, absoluteHref) {
    if (!anchor.text || EXCLUDED_CATALOG_TEXT.test(anchor.text) || CATALOG_NEXT_PAGE_PATTERN.test(anchor.text)) {
      return false;
    }

    if (CATALOG_PAGE_NUMBER_PATTERN.test(anchor.text) && CATALOG_PAGE_HREF_PATTERN.test(absoluteHref)) {
      return false;
    }

    return CHAPTER_TEXT_PATTERN.test(anchor.text) || CHAPTER_HREF_PATTERN.test(absoluteHref);
  }

  function parseCatalogChapters(html, baseUrl) {
    const seen = new Set();
    const chapters = [];

    getAnchorMatches(html).forEach((anchor) => {
      const href = resolveUrl(anchor.href, baseUrl);

      if (!href || seen.has(href) || !isLikelyChapter(anchor, href)) {
        return;
      }

      seen.add(href);
      chapters.push({
        title: anchor.text,
        href
      });
    });

    return chapters;
  }

  function isSameOriginUrl(leftHref, rightHref) {
    try {
      return new URL(leftHref).origin === new URL(rightHref).origin;
    } catch (_error) {
      return false;
    }
  }

  function parseCatalogNextPage(html, baseUrl, seenPages) {
    return parseCatalogPageLinks(html, baseUrl, seenPages)[0] || null;
  }

  function isCatalogPageLink(anchor, href, baseUrl) {
    const text = normalizeText(anchor.text);
    const attributes = normalizeText(anchor.attributes);

    if (!href || !isSameOriginUrl(href, baseUrl) || /^(上一章|下一章|上章|下章)$/i.test(text)) {
      return false;
    }

    if (CATALOG_NEXT_PAGE_PATTERN.test(text) || /\bnext\b/i.test(attributes)) {
      return true;
    }

    if (CATALOG_PAGE_NUMBER_PATTERN.test(text) && CATALOG_PAGE_HREF_PATTERN.test(href)) {
      return true;
    }

    return /第\s*\d+\s*页/.test(text) && CATALOG_PAGE_HREF_PATTERN.test(href);
  }

  function parseCatalogPageLinks(html, baseUrl, seenPages) {
    const seen = new Set();
    const links = [];

    getAnchorMatches(html).concat(getOptionMatches(html)).forEach((anchor) => {
      const href = resolveUrl(anchor.href, baseUrl);

      if (!isCatalogPageLink(anchor, href, baseUrl) || (seenPages && seenPages.has(href)) || seen.has(href)) {
        return;
      }

      seen.add(href);
      links.push(href);
    });

    return links;
  }

  async function loadCatalogChapters(startHref, fetchCatalog, maxPages) {
    const pagesSeen = new Set();
    const chaptersSeen = new Set();
    const chapters = [];
    const queue = [startHref];

    while (queue.length > 0 && pagesSeen.size < maxPages) {
      const nextHref = queue.shift();

      if (!nextHref || pagesSeen.has(nextHref)) {
        continue;
      }

      pagesSeen.add(nextHref);

      const html = await fetchCatalog(nextHref);
      parseCatalogChapters(html, nextHref).forEach((chapter) => {
        if (chaptersSeen.has(chapter.href)) {
          return;
        }

        chaptersSeen.add(chapter.href);
        chapters.push(chapter);
      });

      parseCatalogPageLinks(html, nextHref, pagesSeen).forEach((href) => {
        if (!pagesSeen.has(href) && !queue.includes(href) && queue.length + pagesSeen.size < maxPages) {
          queue.push(href);
        }
      });
    }

    return chapters;
  }

  function removeElement(doc, selector) {
    const existing = doc && doc.querySelector ? doc.querySelector(selector) : null;
    if (existing && existing.remove) {
      existing.remove();
    }
  }

  function removeChapterNav(doc) {
    removeElement(doc, ".brp-chapter-nav");
    removeElement(doc, ".brp-catalog-panel");
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

    removeElement(doc, ".brp-chapter-nav");

    const nav = doc.createElement("nav");
    nav.className = "brp-chapter-nav";
    nav.setAttribute("aria-label", "章节导航");

    CHAPTER_ACTIONS.forEach((action) => {
      nav.appendChild(createNavItem(doc, action, targets && targets[action.key]));
    });

    doc.body.appendChild(nav);
    return nav;
  }

  function createTextBlock(doc, className, text) {
    const element = doc.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  }

  function renderCatalogPanel(doc, state) {
    if (!doc || !doc.body) {
      return null;
    }

    removeElement(doc, ".brp-catalog-panel");

    const panel = doc.createElement("aside");
    const chapters = state && Array.isArray(state.chapters) ? state.chapters : [];
    const catalogHref = state && state.catalogHref;
    const status = state && state.status;
    panel.className = "brp-catalog-panel";
    panel.setAttribute("aria-label", "章节目录");

    const title = doc.createElement("div");
    title.className = "brp-catalog-panel__title";
    title.textContent = status === "ready" ? `目录 · ${chapters.length}章` : "目录";
    panel.appendChild(title);

    if (status === "ready" && chapters.length > 0) {
      const list = doc.createElement("div");
      list.className = "brp-catalog-panel__list";
      chapters.forEach((chapter) => {
        const item = doc.createElement("a");
        item.className = "brp-catalog-panel__item";
        item.href = chapter.href;
        item.textContent = chapter.title;
        list.appendChild(item);
      });
      panel.appendChild(list);
    } else {
      const message = status === "loading" ? "目录加载中..." : status === "error" ? "目录加载失败" : "未识别到章节";
      panel.appendChild(createTextBlock(doc, "brp-catalog-panel__message", message));

      if (catalogHref) {
        const fallback = doc.createElement("a");
        fallback.className = "brp-catalog-panel__fallback";
        fallback.href = catalogHref;
        fallback.textContent = "打开目录";
        panel.appendChild(fallback);
      }
    }

    doc.body.appendChild(panel);
    return panel;
  }

  async function defaultFetchCatalog(href) {
    const response = await fetch(href, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Catalog request failed: ${response.status}`);
    }
    return response.text();
  }

  async function syncChapterNav(doc, enabled, options) {
    const version = ++syncVersion;

    if (!enabled) {
      removeChapterNav(doc);
      return null;
    }

    const links = doc && doc.querySelectorAll ? doc.querySelectorAll("a[href]") : [];
    const targets = detectChapterTargets(links);
    renderChapterNav(doc, targets);

    if (!targets.contents || !targets.contents.href) {
      renderCatalogPanel(doc, { status: "empty", catalogHref: null, chapters: [] });
      return null;
    }

    renderCatalogPanel(doc, { status: "loading", catalogHref: targets.contents.href, chapters: [] });

    try {
      const fetchCatalog = options && options.fetchCatalog ? options.fetchCatalog : defaultFetchCatalog;
      const maxPages = options && options.maxCatalogPages ? options.maxCatalogPages : MAX_CATALOG_PAGES;
      const shouldUseCache = !(options && options.fetchCatalog);
      let chapters = shouldUseCache ? catalogCache.get(targets.contents.href) : null;

      if (!chapters) {
        chapters = await loadCatalogChapters(targets.contents.href, fetchCatalog, maxPages);
        if (shouldUseCache) {
          catalogCache.set(targets.contents.href, chapters);
        }
      }

      if (version !== syncVersion) {
        return null;
      }

      renderCatalogPanel(doc, {
        status: chapters.length > 0 ? "ready" : "empty",
        catalogHref: targets.contents.href,
        chapters
      });
    } catch (_error) {
      if (version !== syncVersion) {
        return null;
      }

      renderCatalogPanel(doc, { status: "error", catalogHref: targets.contents.href, chapters: [] });
    }

    return null;
  }

  return {
    ACTIONS,
    detectChapterTargets,
    parseCatalogChapters,
    parseCatalogPageLinks,
    parseCatalogNextPage,
    renderCatalogPanel,
    renderChapterNav,
    removeChapterNav,
    syncChapterNav
  };
});
