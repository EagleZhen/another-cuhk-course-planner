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

Button uses short color transitions for hover and selection; pressed colors share that timing. Keep transition properties explicit so feedback changes do not remove needed motion.

Information-rich cards use selection or expanded content to show results, without an additional whole-card pressed fill or dimming. Preserve explicit keyboard actions; independent nested controls must stop click propagation when the parent is clickable.

Use Button's `text-action` for text controls that need a visible action cue before hover, such as inline term selectors and Show all actions. Keep low-emphasis disclosure headings and icon utilities neutral; preserve warning/destructive colors.
