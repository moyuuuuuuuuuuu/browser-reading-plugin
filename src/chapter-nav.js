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
  const EXCLUDED_CATALOG_TEXT = /^(首页|主页|目录|返回目录|章节目录|上一章|下一章|上章|下章|登录|注册|搜索|书架|返回|点击阅读|开始阅读|继续阅读|阅读全文|阅读|prev|previous|next|index|contents?|catalog)$/i;
  const CHAPTER_TEXT_PATTERN = /(^第\s*[0-9零一二三四五六七八九十百千万两]+\s*[章节回卷集部篇])|(\bchapter\s*\d+\b)|(^\d+[\s.、_-]*\S+)/i;
  const CHAPTER_HREF_PATTERN = /(chapter|read|\/\d+\.html?$|[_-]\d+\.html?$)/i;
  const CATALOG_NEXT_PAGE_PATTERN = /^(下一页|下页|后页|后一页|next\s*page|more|>|›|»|>>)$/i;
  const CATALOG_PAGE_NUMBER_PATTERN = /^(第\s*)?\d+\s*页?$/;
  const CATALOG_PAGE_HREF_PATTERN = /(partlist|catalog|chapterlist|list|index)/i;
  const FULL_CATALOG_TEXT_PATTERN = /(全部章节|所有章节|完整目录|全部目录|完整章节|全部章节目录|查看全部|查看完整|更多章节|章节全集)/;
  const FULL_CATALOG_CONTROL_TEXT_PATTERN = /^(点击查看|查看|进入|更多|展开|打开|列表|目录|章节目录)$/;
  const GENERIC_TITLE_PATTERN = /^(章节目录|目录|正文|阅读|最新章节|全部章节|完整目录)$/;
  const CATALOG_CACHE_PREFIX = "brp:catalog:v1:";
  const CATALOG_CACHE_VERSION = 1;
  const PANEL_POSITION_PREFIX = "brp:panel-position:v1:";
  const PANEL_POSITION_VERSION = 1;
  const MAX_CATALOG_PAGES = 200;
  const catalogCache = new Map();
  let syncVersion = 0;

  // 统一清理文本空白，便于后续用关键词和正则匹配链接语义。
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  // 从页面标题或站点标题中提取小说名，去掉章节号、目录页和站点后缀。
  function normalizeBookName(value) {
    const text = normalizeText(value)
      .replace(/第\s*[0-9零一二三四五六七八九十百千万两]+\s*[章节回卷集部篇][^_\-|｜—–,，:：]*/g, " ")
      .replace(/(最新章节|章节目录|全部章节|完整目录|全文阅读|无弹窗|免费阅读|手机版|小说网|阅读)/g, " ");
    const parts = text
      .split(/[_\-|｜—–,，:：]+/)
      .map((part) => normalizeText(part))
      .filter(Boolean)
      .filter((part) => !GENERIC_TITLE_PATTERN.test(part));

    return parts[0] || normalizeText(text);
  }

  // 根据当前文档提取小说名，缓存 key 会同时使用它和目录 URL。
  function detectBookName(doc) {
    const candidates = [];

    if (doc && doc.title) {
      candidates.push(doc.title);
    }

    if (doc && doc.querySelector) {
      [
        "meta[property='og:novel:book_name']",
        "meta[property='og:title']",
        "meta[name='book_name']",
        "h1",
        ".bookname",
        ".book-name",
        ".novel-title",
        ".title"
      ].forEach((selector) => {
        const element = doc.querySelector(selector);
        const value = element && (element.getAttribute && element.getAttribute("content") || element.textContent);
        if (value) {
          candidates.push(value);
        }
      });
    }

    for (const candidate of candidates) {
      const bookName = normalizeBookName(candidate);
      if (bookName) {
        return bookName;
      }
    }

    return "";
  }

  // 生成目录缓存 key：小说名用于隔离不同作品，目录 URL 用于隔离不同站点/目录。
  function getCatalogCacheKey(catalogHref, bookName) {
    return `${CATALOG_CACHE_PREFIX}${bookName || "未知小说"}::${catalogHref}`;
  }

  // 读取当前页面域名，用于隔离不同站点的浮动面板停放位置。
  function getDocumentHostname(doc) {
    if (doc && doc.location && doc.location.hostname) {
      return doc.location.hostname;
    }

    if (typeof location !== "undefined" && location.hostname) {
      return location.hostname;
    }

    return "global";
  }

  // 生成浮动面板位置缓存 key，按站点和面板类型分别保存。
  function getPanelPositionKey(doc, panelKey) {
    return `${PANEL_POSITION_PREFIX}${getDocumentHostname(doc)}:${panelKey}`;
  }

  // 汇总一个链接的可见文本和属性信号，用于判断它是上一章、目录还是下一章。
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

  // 判断链接是否可见，避免把隐藏模板、脚本占位链接误识别为导航。
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

  // 按目标动作给链接打分；可见文字权重大于 class、id、href 等弱信号。
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

  // 把命中的 DOM 链接转换成候选导航对象，并保留分数用于排序。
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

  // 从当前页面的所有链接中识别上一章、目录、下一章三个目标。
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

  // 将相对地址解析为绝对地址；解析失败时返回空字符串供上层跳过。
  function resolveUrl(href, baseUrl) {
    try {
      return new URL(href, baseUrl).href;
    } catch (_error) {
      return "";
    }
  }

  // 获取当前文档 URL；测试环境没有 location 时使用稳定的兜底地址。
  function getDocumentHref(doc) {
    if (doc && doc.location && doc.location.href) {
      return doc.location.href;
    }

    if (typeof location !== "undefined" && location.href) {
      return location.href;
    }

    return "https://example.test/";
  }

  // 去掉 HTML 标签并压缩空白，给正则兜底解析提供可读上下文。
  function normalizeHtmlText(value) {
    return normalizeText(String(value || "").replace(/<[^>]*>/g, " "));
  }

  // 在没有 DOMParser 的测试环境中，用轻量解析提取 HTML 里的 a[href]。
  function getAnchorMatchesFromHtml(html) {
    const matches = [];
    const source = String(html || "");
    const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match = anchorPattern.exec(source);

    while (match) {
      const attributes = match[1] || "";
      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
      const rawText = match[2] || "";
      const text = normalizeHtmlText(rawText);

      if (hrefMatch) {
        const contextStart = Math.max(0, match.index - 240);
        const contextEnd = Math.min(source.length, anchorPattern.lastIndex + 240);
        matches.push({
          href: hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || "",
          text,
          attributes,
          context: normalizeHtmlText(source.slice(contextStart, contextEnd))
        });
      }

      match = anchorPattern.exec(source);
    }

    return matches;
  }

  // 提取目录 HTML 中的链接；浏览器优先使用 DOMParser，Node 测试走正则兜底。
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
      ].filter(Boolean).join(" ")),
      context: normalizeText((anchor.closest("section, article, main, nav, div, ul, ol, table, tbody, tr") || anchor.parentElement || anchor).textContent)
    }));
  }

  // 在没有 DOMParser 的测试环境中，提取下拉分页 option[value]。
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

  // 提取目录页里的下拉分页选项，兼容移动站常见的分页选择器。
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

  // 判断一个链接是否像章节链接，并排除目录、翻页、登录等非章节入口。
  function isLikelyChapter(anchor, absoluteHref) {
    if (!anchor.text || EXCLUDED_CATALOG_TEXT.test(anchor.text) || CATALOG_NEXT_PAGE_PATTERN.test(anchor.text)) {
      return false;
    }

    if (CATALOG_PAGE_NUMBER_PATTERN.test(anchor.text) && CATALOG_PAGE_HREF_PATTERN.test(absoluteHref)) {
      return false;
    }

    return CHAPTER_TEXT_PATTERN.test(anchor.text) || CHAPTER_HREF_PATTERN.test(absoluteHref);
  }

  // 从目录页 HTML 中解析章节列表，按绝对地址去重并保持原顺序。
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

  // 把当前页面上的真实链接 DOM 转成和目录 HTML 解析结果一致的数据结构。
  function linkToAnchorMatch(link) {
    return {
      href: link && (link.href || (link.getAttribute && link.getAttribute("href"))) || "",
      text: normalizeText(link && link.textContent),
      attributes: normalizeText([
        link && link.rel,
        link && link.id,
        link && link.className,
        link && link.title,
        link && link.getAttribute && link.getAttribute("aria-label")
      ].filter(Boolean).join(" "))
    };
  }

  // 从当前章节页已有链接中提取章节列表，作为目录页抓取失败时的兜底。
  function parseCatalogChaptersFromLinks(links, baseUrl) {
    const seen = new Set();
    const chapters = [];

    Array.from(links || []).forEach((link) => {
      if (!isVisibleLink(link)) {
        return;
      }

      const anchor = linkToAnchorMatch(link);
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

  // 判断两个 URL 是否同源，避免目录分页跟到外站或广告链接。
  function isSameOriginUrl(leftHref, rightHref) {
    try {
      return new URL(leftHref).origin === new URL(rightHref).origin;
    } catch (_error) {
      return false;
    }
  }

  // 获取下一个目录分页地址；保留这个方法给测试和简单分页场景使用。
  function parseCatalogNextPage(html, baseUrl, seenPages) {
    return parseCatalogPageLinks(html, baseUrl, seenPages)[0] || null;
  }

  // 在“最新章节”目录页中寻找真正的完整目录入口。
  function parseFullCatalogHref(html, baseUrl, seenPages) {
    const anchors = getAnchorMatches(html);
    const candidates = [];

    for (const anchor of anchors) {
      const href = resolveUrl(anchor.href, baseUrl);

      if (!href || (seenPages && seenPages.has(href)) || !isSameOriginUrl(href, baseUrl)) {
        continue;
      }

      const text = normalizeText(anchor.text);
      const attributes = normalizeText(anchor.attributes);
      const context = normalizeText(anchor.context);
      const directSignal = `${text} ${attributes}`.trim();
      const contextSignal = `${directSignal} ${context}`.trim();
      const hasDirectFullText = FULL_CATALOG_TEXT_PATTERN.test(directSignal);
      const hasContextFullText = FULL_CATALOG_TEXT_PATTERN.test(contextSignal);
      const isGenericControl = FULL_CATALOG_CONTROL_TEXT_PATTERN.test(text);

      if (hasDirectFullText) {
        return href;
      }

      if (hasContextFullText && (isGenericControl || !isLikelyChapter(anchor, href))) {
        candidates.push(href);
      }
    }

    if (candidates.length > 0) {
      return candidates[0];
    }

    return null;
  }

  // 判断链接或 option 是否是目录分页入口，而不是章节或普通导航。
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

  // 提取目录页中的所有分页入口，支持“下一页”、数字页码和下拉分页。
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

  // 按队列抓取多页目录，最多 maxPages 页，并对章节链接做全局去重。
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
      const fullCatalogHref = parseFullCatalogHref(html, nextHref, pagesSeen);

      if (fullCatalogHref) {
        queue.unshift(fullCatalogHref);
        continue;
      }

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

  // 删除扩展自己创建的单个面板节点。
  function removeElement(doc, selector) {
    const existing = doc && doc.querySelector ? doc.querySelector(selector) : null;
    if (existing && existing.remove) {
      existing.remove();
    }
  }

  // 同时移除右侧翻章面板和左侧目录面板。
  function removeChapterNav(doc) {
    removeElement(doc, ".brp-chapter-nav");
    removeElement(doc, ".brp-catalog-panel");
  }

  // 创建一个翻章按钮；没有目标链接时渲染为禁用状态。
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

  // 判断保存的位置是否可用，避免损坏数据让面板飞出屏幕。
  function normalizePanelPosition(entry) {
    if (!entry || entry.version !== PANEL_POSITION_VERSION || !Number.isFinite(entry.left) || !Number.isFinite(entry.top)) {
      return null;
    }

    return {
      left: entry.left,
      top: entry.top
    };
  }

  // 获取视口大小；测试环境没有 window 时使用稳定兜底值。
  function getViewportSize(doc) {
    const view = doc && doc.defaultView || (typeof window !== "undefined" ? window : null);
    return {
      width: view && Number.isFinite(view.innerWidth) ? view.innerWidth : 1024,
      height: view && Number.isFinite(view.innerHeight) ? view.innerHeight : 768
    };
  }

  // 把面板坐标限制在视口内，至少保留 8px 边距。
  function clampPanelPosition(doc, panel, position) {
    const viewport = getViewportSize(doc);
    const rect = panel && panel.getBoundingClientRect ? panel.getBoundingClientRect() : { width: 120, height: 80 };
    const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 120;
    const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 80;
    const maxLeft = Math.max(8, viewport.width - width - 8);
    const maxTop = Math.max(8, viewport.height - height - 8);

    return {
      left: Math.min(maxLeft, Math.max(8, Math.round(position.left))),
      top: Math.min(maxTop, Math.max(8, Math.round(position.top)))
    };
  }

  // 应用停放位置，清掉默认的左右停靠和垂直居中 transform。
  function applyPanelPosition(panel, position) {
    if (!panel || !panel.style || !position) {
      return;
    }

    if (panel.style.setProperty) {
      panel.style.setProperty("left", `${position.left}px`, "important");
      panel.style.setProperty("top", `${position.top}px`, "important");
      panel.style.setProperty("right", "auto", "important");
      panel.style.setProperty("bottom", "auto", "important");
      panel.style.setProperty("transform", "none", "important");
      return;
    }

    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
  }

  // 从 chrome.storage.local 读取面板停放位置。
  async function readPanelPosition(positionKey) {
    const storage = getStorageLocal();
    if (!storage || !storage.get) {
      return null;
    }

    return new Promise((resolve) => {
      storage.get(positionKey, (result) => {
        resolve(normalizePanelPosition(result && result[positionKey]));
      });
    });
  }

  // 保存面板停放位置。
  async function writePanelPosition(positionKey, position) {
    const storage = getStorageLocal();
    if (!storage || !storage.set || !position) {
      return;
    }

    await new Promise((resolve) => {
      storage.set({
        [positionKey]: {
          version: PANEL_POSITION_VERSION,
          left: position.left,
          top: position.top
        }
      }, resolve);
    });
  }

  // 让浮动面板可以通过指定手柄拖动，并在松手后持久保存位置。
  function enablePanelDrag(doc, panel, panelKey, handle) {
    if (!doc || !panel || !handle || !handle.addEventListener) {
      return;
    }

    const positionKey = getPanelPositionKey(doc, panelKey);
    handle.setAttribute("title", "拖动调整位置");
    handle.setAttribute("aria-label", "拖动调整位置");

    readPanelPosition(positionKey).then((position) => {
      if (position) {
        applyPanelPosition(panel, clampPanelPosition(doc, panel, position));
      }
    });

    handle.addEventListener("pointerdown", (event) => {
      if (event && Number.isFinite(event.button) && event.button !== 0) {
        return;
      }

      if (event && event.preventDefault) {
        event.preventDefault();
      }

      const rect = panel.getBoundingClientRect ? panel.getBoundingClientRect() : { left: 0, top: 0 };
      const startLeft = Number.isFinite(rect.left) ? rect.left : 0;
      const startTop = Number.isFinite(rect.top) ? rect.top : 0;
      const startX = event && Number.isFinite(event.clientX) ? event.clientX : startLeft;
      const startY = event && Number.isFinite(event.clientY) ? event.clientY : startTop;
      let currentPosition = clampPanelPosition(doc, panel, { left: startLeft, top: startTop });

      const onMove = (moveEvent) => {
        if (moveEvent && moveEvent.preventDefault) {
          moveEvent.preventDefault();
        }

        const clientX = moveEvent && Number.isFinite(moveEvent.clientX) ? moveEvent.clientX : startX;
        const clientY = moveEvent && Number.isFinite(moveEvent.clientY) ? moveEvent.clientY : startY;
        currentPosition = clampPanelPosition(doc, panel, {
          left: startLeft + clientX - startX,
          top: startTop + clientY - startY
        });
        applyPanelPosition(panel, currentPosition);
      };

      const onUp = () => {
        if (doc.removeEventListener) {
          doc.removeEventListener("pointermove", onMove);
          doc.removeEventListener("pointerup", onUp);
        }

        writePanelPosition(positionKey, currentPosition).catch((_error) => {});
      };

      if (doc.addEventListener) {
        doc.addEventListener("pointermove", onMove);
        doc.addEventListener("pointerup", onUp);
      }
    });
  }

  // 渲染右侧上一章/下一章面板，不包含目录按钮。
  function renderChapterNav(doc, targets) {
    if (!doc || !doc.body) {
      return null;
    }

    removeElement(doc, ".brp-chapter-nav");

    const nav = doc.createElement("nav");
    nav.className = "brp-chapter-nav";
    nav.setAttribute("aria-label", "章节导航");

    const dragHandle = doc.createElement("div");
    dragHandle.className = "brp-chapter-nav__drag";
    dragHandle.textContent = "拖动";
    nav.appendChild(dragHandle);

    CHAPTER_ACTIONS.forEach((action) => {
      nav.appendChild(createNavItem(doc, action, targets && targets[action.key]));
    });

    doc.body.appendChild(nav);
    enablePanelDrag(doc, nav, "chapter-nav", dragHandle);
    return nav;
  }

  // 创建目录面板中的普通提示文本块。
  function createTextBlock(doc, className, text) {
    const element = doc.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  }

  // 渲染左侧目录面板，支持加载、失败、空状态和章节列表状态。
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

    if (catalogHref) {
      const refresh = doc.createElement("button");
      refresh.className = "brp-catalog-panel__refresh";
      refresh.textContent = "重新获取";
      refresh.setAttribute("type", "button");

      if (state && typeof state.onRefresh === "function" && refresh.addEventListener) {
        refresh.addEventListener("click", state.onRefresh);
      }

      panel.appendChild(refresh);
    }

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
    enablePanelDrag(doc, panel, "catalog", title);
    return panel;
  }

  // 使用当前浏览器上下文请求目录页，携带站点 cookie 以兼容登录态页面。
  async function defaultFetchCatalog(href) {
    const response = await fetch(href, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Catalog request failed: ${response.status}`);
    }
    return response.text();
  }

  // 获取扩展本地存储对象；测试环境或普通网页环境不可用时返回空。
  function getStorageLocal() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      return null;
    }

    return chrome.storage.local;
  }

  // 判断缓存条目结构是否可用，避免旧版本或异常数据污染目录。
  function normalizeCatalogCacheEntry(entry) {
    if (!entry || entry.version !== CATALOG_CACHE_VERSION || !Array.isArray(entry.chapters)) {
      return null;
    }

    return entry.chapters
      .filter((chapter) => chapter && chapter.title && chapter.href)
      .map((chapter) => ({
        title: normalizeText(chapter.title),
        href: String(chapter.href)
      }));
  }

  // 从内存缓存或 chrome.storage.local 读取目录缓存。
  async function readCatalogCache(cacheKey) {
    const memoryEntry = catalogCache.get(cacheKey);
    const memoryChapters = normalizeCatalogCacheEntry(memoryEntry);
    if (memoryChapters) {
      return memoryChapters;
    }

    const storage = getStorageLocal();
    if (!storage || !storage.get) {
      return null;
    }

    return new Promise((resolve) => {
      storage.get(cacheKey, (result) => {
        const entry = result && result[cacheKey];
        const chapters = normalizeCatalogCacheEntry(entry);

        if (chapters) {
          catalogCache.set(cacheKey, entry);
        }

        resolve(chapters);
      });
    });
  }

  // 写入目录缓存；页面内 Map 提升当前页性能，storage 让新章节页复用同一份目录。
  async function writeCatalogCache(cacheKey, bookName, chapters) {
    const entry = {
      version: CATALOG_CACHE_VERSION,
      bookName,
      chapters
    };
    const storage = getStorageLocal();
    catalogCache.set(cacheKey, entry);

    if (!storage || !storage.set) {
      return;
    }

    await new Promise((resolve) => {
      storage.set({ [cacheKey]: entry }, resolve);
    });
  }

  // 清除目录缓存，供“重新获取”按钮和强制刷新使用。
  async function deleteCatalogCache(cacheKey) {
    const storage = getStorageLocal();
    catalogCache.delete(cacheKey);

    if (!storage || !storage.remove) {
      return;
    }

    await new Promise((resolve) => {
      storage.remove(cacheKey, resolve);
    });
  }

  // 根据阅读增强开关同步左右面板，并处理目录抓取、缓存、兜底和过期请求。
  async function syncChapterNav(doc, enabled, options) {
    const version = ++syncVersion;

    if (!enabled) {
      removeChapterNav(doc);
      return null;
    }

    const links = doc && doc.querySelectorAll ? doc.querySelectorAll("a[href]") : [];
    const targets = detectChapterTargets(links);
    const pageHref = getDocumentHref(doc);
    const pageChapters = parseCatalogChaptersFromLinks(links, pageHref);
    const forceRefresh = Boolean(options && options.forceRefresh);
    const bookName = detectBookName(doc);
    const cacheKey = targets.contents && targets.contents.href ? getCatalogCacheKey(targets.contents.href, bookName) : "";
    renderChapterNav(doc, targets);

    const refreshCatalog = () => {
      if (cacheKey) {
        deleteCatalogCache(cacheKey).catch((_error) => {});
      }

      syncChapterNav(doc, true, { forceRefresh: true }).catch((_error) => {});
    };

    if (!targets.contents || !targets.contents.href) {
      renderCatalogPanel(doc, {
        status: pageChapters.length > 0 ? "ready" : "empty",
        catalogHref: null,
        chapters: pageChapters
      });
      return null;
    }

    renderCatalogPanel(doc, {
      status: pageChapters.length > 0 ? "ready" : "loading",
      catalogHref: targets.contents.href,
      chapters: pageChapters,
      onRefresh: refreshCatalog
    });

    try {
      const fetchCatalog = options && options.fetchCatalog ? options.fetchCatalog : defaultFetchCatalog;
      const maxPages = options && options.maxCatalogPages ? options.maxCatalogPages : MAX_CATALOG_PAGES;
      const shouldUseCache = !(options && options.fetchCatalog) && !forceRefresh;
      let chapters = shouldUseCache ? await readCatalogCache(cacheKey) : null;

      if (forceRefresh) {
        await deleteCatalogCache(cacheKey);
      }

      if (!chapters) {
        chapters = await loadCatalogChapters(targets.contents.href, fetchCatalog, maxPages);
        if (!(options && options.fetchCatalog)) {
          await writeCatalogCache(cacheKey, bookName, chapters);
        }
      }

      if (version !== syncVersion) {
        return null;
      }

      renderCatalogPanel(doc, {
        status: chapters.length > 0 ? "ready" : "empty",
        catalogHref: targets.contents.href,
        chapters: chapters.length > 0 ? chapters : pageChapters,
        onRefresh: refreshCatalog
      });
    } catch (_error) {
      if (version !== syncVersion) {
        return null;
      }

      renderCatalogPanel(doc, {
        status: pageChapters.length > 0 ? "ready" : "error",
        catalogHref: targets.contents.href,
        chapters: pageChapters,
        onRefresh: refreshCatalog
      });
    }

    return null;
  }

  return {
    ACTIONS,
    detectChapterTargets,
    parseCatalogChapters,
    parseCatalogChaptersFromLinks,
    parseFullCatalogHref,
    parseCatalogPageLinks,
    parseCatalogNextPage,
    renderCatalogPanel,
    renderChapterNav,
    removeChapterNav,
    syncChapterNav
  };
});
