import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// A lowercase word other than a small word like "to" ("Add to Cart" passes).
const lowercaseWord = String.raw`/(^|[\s(])(?!(a|an|the|and|or|of|to|in|on|for|by|at|with|vs)\b)[a-z]{2,}/`
const labelElement = 'JSXElement[openingElement.name.name=/^(Button|Badge)$/]'
const titleCaseMessage = 'Use title case for button and badge labels (docs/design.md).'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'open',
          message:
            'Use anchors for navigation so native link actions remain available. Justify deliberate popups with a documented local ESLint suppression.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.type="JSXIdentifier"][name.name="button"]',
          message:
            'Use Button for feature actions so interaction feedback stays shared. Justify any native-button exception with a local ESLint suppression.',
        },
        {
          selector: `${labelElement} > JSXText[value=${lowercaseWord}]`,
          message: titleCaseMessage,
        },
        {
          selector: `${labelElement} > JSXExpressionContainer > ConditionalExpression > Literal[value=${lowercaseWord}]`,
          message: titleCaseMessage,
        },
      ],
    },
  },
  {
    rules: {
      // Existing client-side hydration, localStorage restore, and UI sync effects
      // intentionally update React state from effects. Revisit this rule when
      // those flows are refactored.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
