# Browser Reading Extension Design

## Goal

Build a lightweight Chrome/Edge Manifest V3 extension that improves poor online novel reading pages by applying a coordinated reading style to the current tab.

## Scope

- Toggle reading enhancement on or off for the current site.
- Adjust font family, font size, line height, paragraph spacing, content width, and page padding.
- Switch between coordinated background/text themes, including light, paper, eye-care, dark, black, and warm themes.
- Lightly reduce visual distractions such as common ads, floating panels, sidebars, and sticky overlays.
- Store settings per site so each novel site can keep its own preferred appearance.
- Avoid aggressive article extraction in the first version to prevent breaking chapter navigation or losing content on varied novel sites.

## Architecture

- `manifest.json`: extension metadata, permissions, popup registration, and content script registration.
- `src/content.js`: applies CSS variables and page cleanup classes to the active page, receives popup messages, and stores site settings.
- `src/content.css`: reading enhancement stylesheet driven by CSS variables.
- `popup/popup.html`, `popup/popup.css`, `popup/popup.js`: compact settings UI for toggles, theme, font, and numeric reading controls.
- `README.md`: installation and usage instructions for loading the unpacked extension.

## Behavior

The popup reads settings for the current hostname, lets the user edit them, then sends updates to the content script. The content script applies a root class and CSS variables to the document. When disabled, it removes the enhancement class while keeping saved settings.

## Verification

Manual verification should cover:

- Manifest is valid JSON.
- Popup files are referenced correctly.
- Content script can receive messages and apply settings.
- README explains how to load the unpacked extension in Chrome or Edge.
