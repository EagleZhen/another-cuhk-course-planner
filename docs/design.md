# UI Design

Shared UI boundaries and styling rules. Keep component-specific behavior in [component docs](README.md) and exact styles in code.

## Control Structure

Use native buttons for actions and anchors for navigation.

- [Button](../web/src/components/ui/button.tsx): button appearances and sizes.
- [MenuItem](../web/src/components/ui/menu-item.tsx): dropdown-row styling, including selection; not menu keyboard navigation or focus management.
- [Badge](../web/src/components/ui/badge.tsx): compact labels, with interaction feedback when rendered as links.

Keep these primitives independent: their shapes and interaction styles differ. Sharing a styled base would require overrides rather than remove duplication.

Feature components own behavior, content, state, and layout. Extract them to consolidate repeated content or behavior, not merely to name a color.

## Interaction Appearance

Each primitive owns its appearances' resting, hover, and pressed styles. Callers choose an appearance rather than override its interaction colors.

Button uses one `variant` for each complete appearance and a separate `size`. Keep palettes in complete variants rather than combining props that override one another or allow unsupported combinations.

Share styles only when controls should change together. Compact chips can use stronger selection fills than full-width menu rows, which would otherwise dominate a dropdown.

Keep selection distinguishable from momentary pressing. Passive labels should not show interaction feedback.
