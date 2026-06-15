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

// 将 Chrome 回调里的 lastError 转成普通 Error，便于 Promise 链处理。
function chromeLastError() {
  return chrome.runtime.lastError ? new Error(chrome.runtime.lastError.message) : null;
}

// 获取当前窗口中正在操作的标签页。
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

// 向指定标签页的内容脚本发送消息。
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

// 在页面中补注入内容脚本，用于处理扩展刚安装或页面未加载脚本的情况。
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

// 在页面中补注入阅读样式表。
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

// 从本地扩展存储读取指定配置。
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

// 从标签页 URL 中提取 hostname，URL 非法时返回空字符串。
function hostnameFromTab(tab) {
  try {
    return new URL(tab.url).hostname;
  } catch (_error) {
    return "";
  }
}

// 为当前标签页所在站点生成独立的设置存储 key。
function storageKeyForTab(tab) {
  return `${STORAGE_PREFIX}${hostnameFromTab(tab) || "local"}`;
}

// 更新弹窗底部状态文案，并按需显示错误样式。
function setStatus(message, isError = false) {
  statusLabel.textContent = message;
  statusLabel.classList.toggle("status--error", isError);
}

// 将滑块数值格式化成用户可读的单位文本。
function formatValue(name, value) {
  if (name === "fontSize" || name === "contentWidth" || name === "pagePadding") {
    return `${value}px`;
  }

  if (name === "paragraphSpacing") {
    return `${Number(value).toFixed(1)}em`;
  }

  return Number(value).toFixed(2);
}

// 合并默认设置，保证弹窗渲染时字段完整。
function normalizeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

// 根据 currentSettings 刷新弹窗控件状态和值标签。
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

// 从弹窗控件读取当前用户输入的设置。
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

// 确保当前页面已经有内容脚本可响应；无响应时尝试补注入。
async function ensureContentScript(tab) {
  try {
    return await sendMessage(tab.id, { type: "BRP_GET_SETTINGS" });
  } catch (_error) {
    await insertCss(tab.id);
    await executeScript(tab.id);
    return sendMessage(tab.id, { type: "BRP_GET_SETTINGS" });
  }
}

// 将弹窗设置推送到当前页面，并用页面返回的规范化设置刷新 UI。
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

// 对频繁输入做短延迟合并，避免滑块拖动时过度发送消息。
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

// 绑定所有控件事件和重置按钮事件。
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

// 初始化弹窗：绑定事件、连接当前页、读取并渲染设置。
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
