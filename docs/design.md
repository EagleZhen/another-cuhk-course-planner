# UI Design

Shared UI decisions. Keep exact styles and behavior in code; document only non-obvious constraints in [component docs](README.md).

## Control Structure

Use Button for feature actions and anchors for navigation. ESLint restricts native `<button>` to UI primitives so ordinary actions inherit shared feedback; explain exceptions beside a local suppression. Clickable containers are not covered by this guard.

Keep [Button](../web/src/components/ui/button.tsx), [MenuItem](../web/src/components/ui/menu-item.tsx), and [Badge](../web/src/components/ui/badge.tsx) independent: their shapes and feedback differ, so a shared styled base would need overrides. MenuItem provides row styling, not menu keyboard navigation or focus management.

Feature components own behavior, content, state, and layout. Extract them to consolidate repeated content or behavior, not merely to name a color.

## Interaction Appearance

Primitives own shared appearances. A one-off contextual palette may stay at its consumer, but must define resting, hover, pressed, and relevant dark-mode colors together.

Keep Button appearances in complete variants rather than combining style props that override one another or allow unsupported combinations.

Share styles only when controls should change together. Compact chips can use stronger selection fills than full-width menu rows, which would otherwise dominate a dropdown.

Keep selection distinguishable from momentary pressing. Passive labels should not show interaction feedback.

Card colors and pressed brightness change immediately so feedback cannot linger into a new selection. Animate only shadow or scale, rather than using `transition-all` on interactive cards.

The [shared card feedback rule](../web/src/app/globals.css) owns press detection; consumers own colors, activation, and keyboard access. Independent nested actions must be buttons, links, or marked card regions for exclusion to work. This only isolates visual feedback; nested actions must also stop click propagation when the parent is clickable.

Use Button's `text-action` for text controls that need a visible action cue before hover, such as inline term selectors and Show all actions. Keep low-emphasis disclosure headings and icon utilities neutral; preserve warning/destructive colors.
