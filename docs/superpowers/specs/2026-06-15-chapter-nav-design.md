# Chapter Navigation Sidebar Design

## Goal

Add an automatic chapter navigation panel for online novel pages. When reading enhancement is enabled, the extension should detect the original page's previous chapter, table of contents, and next chapter links, then show its own fixed navigation panel to the left of the reading content and vertically centered in the viewport.

## Scope

- Show the navigation panel only while reading enhancement is enabled for the current site.
- Detect links from the existing page DOM without moving or rewriting the original navigation DOM.
- Render three stable actions: previous chapter, table of contents, and next chapter.
- Keep all three positions visible. If a link cannot be detected, render that action as disabled.
- Remove the panel when reading enhancement is disabled.
- Keep the feature dependency-free and compatible with the existing plain Manifest V3 content script.

## Non-Goals

- Do not extract or rebuild the chapter body.
- Do not maintain per-site selector rules in this first version.
- Do not move original site DOM nodes into the extension panel.
- Do not add popup controls for this feature yet.

## Detection Strategy

The content script scans visible page links and scores each link against common Chinese and English chapter-navigation labels and attributes.

Primary text signals:

- Previous chapter: `上一章`, `上章`, `上一节`, `prev`, `previous`
- Table of contents: `目录`, `返回目录`, `章节目录`, `书页`, `index`, `contents`, `catalog`
- Next chapter: `下一章`, `下章`, `下一节`, `next`

Secondary signals come from `rel`, `id`, `class`, `title`, `aria-label`, and URL text. Text matches are weighted higher than attribute matches so content links are preferred over generic layout links.

The detector returns at most one target per action. If several candidates match, it chooses the highest score, with links near the current reading content preferred when scores are tied.

## Layout

The content script creates a single extension-owned container:

```html
<nav class="brp-chapter-nav" aria-label="章节导航">
  <a class="brp-chapter-nav__item">上一章</a>
  <a class="brp-chapter-nav__item">目录</a>
  <a class="brp-chapter-nav__item">下一章</a>
</nav>
```

The panel is appended to `document.body`. CSS positions it with `position: fixed`, `top: 50%`, and `transform: translateY(-50%)`. Its horizontal position is calculated from the reading width variables so it sits to the left of the centered content. On narrow screens where the left side would collide with the viewport edge, it falls back to a compact left-edge position.

Each active item is a normal link using the detected `href` and opens in the current tab. Each missing item is rendered as an inert button-like element with `aria-disabled="true"` and disabled styling.

## Lifecycle

`applySettings()` owns the feature lifecycle:

- If `enabled` is false, remove any existing `brp-chapter-nav`.
- If `enabled` is true, detect links and render or refresh the panel.
- Re-run detection after settings load and after popup updates.

The initial implementation can do synchronous detection at settings application time. A later version may observe DOM mutations if a site renders navigation after `document_idle`.

## Styling

The panel uses the existing theme CSS variables for surface, text, muted text, link color, border, and font. Buttons are compact, vertically stacked, and readable without covering page content. Disabled items remain visible but muted.

The cleanup rules must not hide the extension panel. Selectors for floating panels and toolbars should exclude `.brp-chapter-nav`.

## Testing

Add focused tests for the detection and render behavior:

- Detect previous, contents, and next links from common Chinese labels.
- Prefer link text matches over weaker attribute matches.
- Render disabled items when a target is missing.
- Remove the navigation panel when reading enhancement is disabled.

Because the project has no test harness today, use a lightweight Node-based DOM test setup if available locally, or isolate pure detection helpers enough to test with simple fixture objects.
