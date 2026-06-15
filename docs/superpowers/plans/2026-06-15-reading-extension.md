# Browser Reading Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a directly loadable Chrome/Edge extension that improves online novel reading pages with coordinated typography, theme, layout, and light distraction cleanup controls.

**Architecture:** The extension uses Manifest V3 with a popup UI and a content script. The popup edits per-host settings stored in `chrome.storage.local`, and the content script applies CSS variables plus a root enhancement class to the current page.

**Tech Stack:** Browser extension Manifest V3, plain HTML, CSS, and JavaScript; no build step or external dependencies.

---

## File Structure

- Create `manifest.json`: extension metadata, permissions, popup, and content script wiring.
- Create `src/content.css`: page-level reading style rules driven by CSS variables.
- Create `src/content.js`: settings defaults, storage, message handling, and style application.
- Create `popup/popup.html`: compact settings panel markup.
- Create `popup/popup.css`: popup visual styling and responsive control layout.
- Create `popup/popup.js`: active-tab lookup, settings form binding, presets, and messaging.
- Create `README.md`: unpacked installation and usage guide.

### Task 1: Extension Shell

**Files:**
- Create: `manifest.json`
- Create: `README.md`

- [ ] **Step 1: Add Manifest V3 metadata**

Create a manifest that grants `storage`, `activeTab`, and `scripting`, registers `popup/popup.html`, and injects `src/content.js` plus `src/content.css` on all HTTP(S) pages.

- [ ] **Step 2: Add user documentation**

Document Chrome/Edge unpacked extension loading, popup controls, and site-specific settings behavior.

### Task 2: Page Style Engine

**Files:**
- Create: `src/content.css`
- Create: `src/content.js`

- [ ] **Step 1: Define readable page styles**

Add CSS rules under a root class such as `.brp-reading-enabled` for background, text color, typography, width, padding, paragraph spacing, image handling, and distraction reduction.

- [ ] **Step 2: Implement content script settings**

Add defaults, per-host storage keys, `chrome.runtime.onMessage` handling, `chrome.storage.local` persistence, and CSS variable application.

### Task 3: Popup Controls

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`

- [ ] **Step 1: Build settings UI**

Add controls for enable/disable, theme, font, font size, line height, paragraph spacing, content width, side padding, and distraction cleanup.

- [ ] **Step 2: Bind UI to active tab**

Load current host settings, update content script on every change, save settings, and provide a reset-to-default button.

### Task 4: Verification

**Files:**
- Verify: `manifest.json`
- Verify: `src/content.js`
- Verify: `popup/popup.js`

- [ ] **Step 1: Validate JSON and JavaScript syntax**

Run PowerShell and Node-based syntax checks where available.

- [ ] **Step 2: Review extension references**

Confirm all files referenced by `manifest.json` exist and that README usage steps match the actual files.
