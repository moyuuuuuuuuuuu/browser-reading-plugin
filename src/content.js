(function () {
  if (window.__BRP_CONTENT_LOADED__) {
    return;
  }

  window.__BRP_CONTENT_LOADED__ = true;

  const STORAGE_PREFIX = "brp:settings:";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: false,
    cleanup: true,
    theme: "paper",
    fontFamily: "serif",
    fontSize: 20,
    lineHeight: 1.85,
    paragraphSpacing: 0.8,
    contentWidth: 820,
    pagePadding: 32
  });

  const THEMES = Object.freeze({
    light: {
      bg: "#f7f7f2",
      surface: "#ffffff",
      text: "#242424",
      muted: "#6b6b61",
      link: "#245b8f",
      border: "rgba(36, 36, 36, 0.16)"
    },
    paper: {
      bg: "#f4ecd8",
      surface: "#fbf5e7",
      text: "#2f2a22",
      muted: "#766b5a",
      link: "#6b4f1d",
      border: "rgba(69, 56, 38, 0.18)"
    },
    eye: {
      bg: "#e9f1df",
      surface: "#f5faef",
      text: "#263527",
      muted: "#63705d",
      link: "#356b45",
      border: "rgba(38, 53, 39, 0.16)"
    },
    warm: {
      bg: "#efe3d2",
      surface: "#f8efe2",
      text: "#342820",
      muted: "#7a6757",
      link: "#8a4f2a",
      border: "rgba(52, 40, 32, 0.16)"
    },
    dark: {
      bg: "#181a1d",
      surface: "#20242a",
      text: "#d9d5ca",
      muted: "#9d968a",
      link: "#9db7d7",
      border: "rgba(217, 213, 202, 0.16)"
    },
    black: {
      bg: "#050505",
      surface: "#111111",
      text: "#cfc9bd",
      muted: "#8b857b",
      link: "#9bbad8",
      border: "rgba(207, 201, 189, 0.16)"
    }
  });

  const FONTS = Object.freeze({
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
    serif: 'Georgia, "Times New Roman", "Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif',
    sans: '"Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    kai: '"Kaiti SC", KaiTi, STKaiti, "Noto Serif CJK SC", serif',
    mono: '"Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace'
  });

  let currentSettings = { ...DEFAULT_SETTINGS };
  let readyPromise = Promise.resolve(currentSettings);
  let chapterNavRetryTimers = [];

  // 按当前域名生成设置存储 key，让不同小说站保持独立配置。
  function storageKey() {
    return `${STORAGE_PREFIX}${location.hostname || "local"}`;
  }

  // 将用户输入限制在允许范围内，非法值回退到默认值。
  function clampNumber(value, min, max, fallback) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, numberValue));
  }

  // 合并并校验设置对象，确保内容脚本只使用安全、完整的配置。
  function normalizeSettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };

    return {
      enabled: Boolean(merged.enabled),
      cleanup: Boolean(merged.cleanup),
      theme: THEMES[merged.theme] ? merged.theme : DEFAULT_SETTINGS.theme,
      fontFamily: FONTS[merged.fontFamily] ? merged.fontFamily : DEFAULT_SETTINGS.fontFamily,
      fontSize: clampNumber(merged.fontSize, 14, 32, DEFAULT_SETTINGS.fontSize),
      lineHeight: clampNumber(merged.lineHeight, 1.35, 2.4, DEFAULT_SETTINGS.lineHeight),
      paragraphSpacing: clampNumber(merged.paragraphSpacing, 0, 1.8, DEFAULT_SETTINGS.paragraphSpacing),
      contentWidth: clampNumber(merged.contentWidth, 560, 1200, DEFAULT_SETTINGS.contentWidth),
      pagePadding: clampNumber(merged.pagePadding, 8, 96, DEFAULT_SETTINGS.pagePadding)
    };
  }

  // 写入 CSS 变量，驱动页面阅读样式。
  function setCssVariable(name, value) {
    document.documentElement.style.setProperty(name, value);
  }

  // 清理已安排的章节导航重试，避免关闭阅读模式后继续渲染。
  function clearChapterNavRetries() {
    chapterNavRetryTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    chapterNavRetryTimers = [];
  }

  // 调用章节导航模块同步左右侧面板，并捕获异步错误。
  function syncChapterNav() {
    if (!window.BRPChapterNav || typeof window.BRPChapterNav.syncChapterNav !== "function") {
      return;
    }

    window.BRPChapterNav.syncChapterNav(document, currentSettings.enabled).catch((error) => {
      console.warn("[Browser Reading Plugin] Failed to sync chapter navigation:", error);
    });
  }

  // 立即同步一次，并在短时间内重试，兼容延迟渲染导航 DOM 的站点。
  function scheduleChapterNavSync() {
    clearChapterNavRetries();
    syncChapterNav();

    if (!currentSettings.enabled) {
      return;
    }

    [500, 1500, 3000].forEach((delay) => {
      const timer = setTimeout(syncChapterNav, delay);
      chapterNavRetryTimers.push(timer);
    });
  }

  // 应用当前站点设置，更新 CSS 变量、根 class 和章节导航面板。
  function applySettings(settings) {
    currentSettings = normalizeSettings(settings);

    const theme = THEMES[currentSettings.theme] || THEMES[DEFAULT_SETTINGS.theme];
    const font = FONTS[currentSettings.fontFamily] || FONTS[DEFAULT_SETTINGS.fontFamily];
    const root = document.documentElement;

    setCssVariable("--brp-bg", theme.bg);
    setCssVariable("--brp-surface", theme.surface);
    setCssVariable("--brp-text", theme.text);
    setCssVariable("--brp-muted", theme.muted);
    setCssVariable("--brp-link", theme.link);
    setCssVariable("--brp-border", theme.border);
    setCssVariable("--brp-font-family", font);
    setCssVariable("--brp-font-size", `${currentSettings.fontSize}px`);
    setCssVariable("--brp-line-height", String(currentSettings.lineHeight));
    setCssVariable("--brp-paragraph-spacing", `${currentSettings.paragraphSpacing}em`);
    setCssVariable("--brp-content-width", `${currentSettings.contentWidth}px`);
    setCssVariable("--brp-page-padding", `${currentSettings.pagePadding}px`);

    root.classList.toggle("brp-reading-enabled", currentSettings.enabled);
    root.classList.toggle("brp-reading-cleanup", currentSettings.enabled && currentSettings.cleanup);
    root.dataset.brpTheme = currentSettings.theme;

    scheduleChapterNavSync();
  }

  // 从 chrome.storage.local 读取指定 key。
  function getFromStorage(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(result[key]);
      });
    });
  }

  // 将指定 key 写入 chrome.storage.local。
  function setInStorage(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  // 加载当前站点设置并规范化。
  async function loadSettings() {
    const saved = await getFromStorage(storageKey());
    return normalizeSettings(saved);
  }

  // 保存设置后立即应用到当前页面。
  async function saveAndApply(settings) {
    const normalized = normalizeSettings(settings);
    applySettings(normalized);
    await setInStorage(storageKey(), normalized);
    return normalized;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    const respond = async () => {
      await readyPromise;

      if (message.type === "BRP_GET_SETTINGS") {
        return {
          ok: true,
          hostname: location.hostname,
          settings: currentSettings,
          defaults: DEFAULT_SETTINGS
        };
      }

      if (message.type === "BRP_UPDATE_SETTINGS") {
        const settings = await saveAndApply(message.settings);
        return { ok: true, hostname: location.hostname, settings };
      }

      if (message.type === "BRP_RESET_SETTINGS") {
        const settings = await saveAndApply({ ...DEFAULT_SETTINGS, enabled: true });
        return { ok: true, hostname: location.hostname, settings };
      }

      return { ok: false, error: `Unknown message type: ${message.type}` };
    };

    respond()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  });

  readyPromise = loadSettings()
    .then((settings) => {
      applySettings(settings);
      return currentSettings;
    })
    .catch((error) => {
      console.warn("[Browser Reading Plugin] Failed to load settings:", error);
      applySettings(DEFAULT_SETTINGS);
      return currentSettings;
    });
})();
