# UI Design

Shared UI decisions. Keep exact styles and behavior in code; document only non-obvious constraints in [component docs](README.md).

## Control Structure

Use Button for feature actions and anchors for navigation. ESLint restricts native `<button>` to UI primitives so ordinary actions inherit shared feedback; explain exceptions beside a local suppression. Clickable containers are not covered by this guard.

Keep [Button](../web/src/components/ui/button.tsx), [MenuItem](../web/src/components/ui/menu-item.tsx), and [Badge](../web/src/components/ui/badge.tsx) independent: their shapes and feedback differ, so a shared styled base would need overrides. Their `asChild` option styles a child anchor without wrapping it in another element. MenuItem provides row styling, not menu keyboard navigation or focus management.

Feature components own behavior, content, state, and layout. Extract them to consolidate repeated content or behavior, not merely to name a color.

## Interaction Appearance

Primitives own shared appearances as complete variants. Keep one-off palettes at the consumer and check their resting, hover, pressed, and focus states.

Share styles only when controls should change together; clickability alone is not a shared appearance. Compact chips can use stronger selection fills than full-width menu rows, which would otherwise dominate a dropdown.

Keep selection distinguishable from momentary pressing. Passive labels should not show interaction feedback.

State controls keep their option labels and show whether they are active, as filter chips do. Action controls describe the next action; align the icon with that label (crossed-out eye to hide, open eye to show).

Button uses short color transitions for hover and selection; pressed colors share that timing. Keep transition properties explicit so feedback changes do not remove needed motion.

Cards use selection or expanded content to show results; whole-card pressed fills or dimming compete with that result. Keep keyboard actions accessible and isolate nested actions from clickable parents.

Use Button's `text-action` for text controls that need a visible action cue before hover, such as inline term selectors and Show all actions. Keep low-emphasis disclosure headings and icon utilities neutral; preserve warning/destructive colors.
