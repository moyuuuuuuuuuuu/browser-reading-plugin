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

const STORAGE_PREFIX = "brp:settings:";

const controls = {
  enabled: document.querySelector("#enabled"),
  cleanup: document.querySelector("#cleanup"),
  theme: document.querySelector("#theme"),
  fontFamily: document.querySelector("#fontFamily"),
  fontSize: document.querySelector("#fontSize"),
  lineHeight: document.querySelector("#lineHeight"),
  paragraphSpacing: document.querySelector("#paragraphSpacing"),
  contentWidth: document.querySelector("#contentWidth"),
  pagePadding: document.querySelector("#pagePadding")
};

const valueLabels = {
  fontSize: document.querySelector("#fontSizeValue"),
  lineHeight: document.querySelector("#lineHeightValue"),
  paragraphSpacing: document.querySelector("#paragraphSpacingValue"),
  contentWidth: document.querySelector("#contentWidthValue"),
  pagePadding: document.querySelector("#pagePaddingValue")
};

const siteLabel = document.querySelector("#siteLabel");
const statusLabel = document.querySelector("#status");
const resetButton = document.querySelector("#reset");

let activeTab = null;
let currentSettings = { ...DEFAULT_SETTINGS };
let updateTimer = 0;

function chromeLastError() {
  return chrome.runtime.lastError ? new Error(chrome.runtime.lastError.message) : null;
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chromeLastError();
      if (error) {
        reject(error);
        return;
      }

      resolve(tabs[0]);
    });
  });
}

function sendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chromeLastError();
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

function executeScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["src/content.js"]
      },
      () => {
        const error = chromeLastError();
        if (error) {
          reject(error);
          return;
        }

        resolve();
      }
    );
  });
}

function insertCss(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.insertCSS(
      {
        target: { tabId },
        files: ["src/content.css"]
      },
      () => {
        const error = chromeLastError();
        if (error) {
          reject(error);
          return;
        }

        resolve();
      }
    );
  });
}

function getFromStorage(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const error = chromeLastError();
      if (error) {
        reject(error);
        return;
      }

      resolve(result[key]);
    });
  });
}

function hostnameFromTab(tab) {
  try {
    return new URL(tab.url).hostname;
  } catch (_error) {
    return "";
  }
}

function storageKeyForTab(tab) {
  return `${STORAGE_PREFIX}${hostnameFromTab(tab) || "local"}`;
}

function setStatus(message, isError = false) {
  statusLabel.textContent = message;
  statusLabel.classList.toggle("status--error", isError);
}

function formatValue(name, value) {
  if (name === "fontSize" || name === "contentWidth" || name === "pagePadding") {
    return `${value}px`;
  }

  if (name === "paragraphSpacing") {
    return `${Number(value).toFixed(1)}em`;
  }

  return Number(value).toFixed(2);
}

function normalizeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function render() {
  controls.enabled.checked = Boolean(currentSettings.enabled);
  controls.cleanup.checked = Boolean(currentSettings.cleanup);
  controls.theme.value = currentSettings.theme;
  controls.fontFamily.value = currentSettings.fontFamily;
  controls.fontSize.value = currentSettings.fontSize;
  controls.lineHeight.value = currentSettings.lineHeight;
  controls.paragraphSpacing.value = currentSettings.paragraphSpacing;
  controls.contentWidth.value = currentSettings.contentWidth;
  controls.pagePadding.value = currentSettings.pagePadding;

  Object.entries(valueLabels).forEach(([name, label]) => {
    label.textContent = formatValue(name, controls[name].value);
  });
}

function readSettingsFromControls() {
  return {
    enabled: controls.enabled.checked,
    cleanup: controls.cleanup.checked,
    theme: controls.theme.value,
    fontFamily: controls.fontFamily.value,
    fontSize: Number(controls.fontSize.value),
    lineHeight: Number(controls.lineHeight.value),
    paragraphSpacing: Number(controls.paragraphSpacing.value),
    contentWidth: Number(controls.contentWidth.value),
    pagePadding: Number(controls.pagePadding.value)
  };
}

async function ensureContentScript(tab) {
  try {
    return await sendMessage(tab.id, { type: "BRP_GET_SETTINGS" });
  } catch (_error) {
    await insertCss(tab.id);
    await executeScript(tab.id);
    return sendMessage(tab.id, { type: "BRP_GET_SETTINGS" });
  }
}

async function pushSettings(settings) {
  if (!activeTab || typeof activeTab.id !== "number") {
    return;
  }

  const response = await sendMessage(activeTab.id, {
    type: "BRP_UPDATE_SETTINGS",
    settings
  });

  if (!response || !response.ok) {
    throw new Error(response && response.error ? response.error : "页面未响应");
  }

  currentSettings = normalizeSettings(response.settings);
  render();
}

function scheduleUpdate() {
  currentSettings = readSettingsFromControls();
  render();
  window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(() => {
    pushSettings(currentSettings)
      .then(() => setStatus("已应用到当前站点"))
      .catch((error) => setStatus(error.message, true));
  }, 80);
}

function bindControls() {
  Object.values(controls).forEach((control) => {
    control.addEventListener("input", scheduleUpdate);
    control.addEventListener("change", scheduleUpdate);
  });

  resetButton.addEventListener("click", () => {
    currentSettings = { ...DEFAULT_SETTINGS, enabled: true };
    render();
    pushSettings(currentSettings)
      .then(() => setStatus("已恢复默认阅读样式"))
      .catch((error) => setStatus(error.message, true));
  });
}

async function init() {
  bindControls();

  activeTab = await queryActiveTab();

  if (!activeTab || typeof activeTab.id !== "number" || !/^https?:\/\//.test(activeTab.url || "")) {
    setStatus("当前页面不支持阅读增强", true);
    siteLabel.textContent = "仅支持 http/https 页面";
    render();
    return;
  }

  const hostname = hostnameFromTab(activeTab);
  siteLabel.textContent = hostname || "当前站点";

  try {
    const response = await ensureContentScript(activeTab);
    if (response && response.ok) {
      currentSettings = normalizeSettings(response.settings);
      render();
      setStatus(currentSettings.enabled ? "已启用" : "未启用");
      return;
    }
  } catch (_error) {
    const saved = await getFromStorage(storageKeyForTab(activeTab));
    currentSettings = normalizeSettings(saved);
    render();
    setStatus("请刷新页面后再启用", true);
    return;
  }

  setStatus("页面未响应，请刷新后重试", true);
}

init().catch((error) => {
  setStatus(error.message, true);
  render();
});
