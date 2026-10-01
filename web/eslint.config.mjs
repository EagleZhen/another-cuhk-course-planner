import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.type="JSXIdentifier"][name.name="button"]',
          message:
            'Use Button for feature actions so interaction feedback stays shared. Justify any native-button exception with a local ESLint suppression.',
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
