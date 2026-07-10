// ESLint flat config — Expo's standard setup (eslint-config-expo bundles the
// React/React Native/react-hooks rules this stack needs). Run: npm run lint
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/*', '.expo/*', 'dist/*'],
  },
  {
    rules: {
      // Same call review-ui's config makes, for the same documented reason:
      // these two rules assume a React Compiler codebase. MarkupScreen's
      // PanResponder-in-a-ref and the screens' load-AsyncStorage-into-state-
      // on-mount effects are the standard React Native idioms — the ref reads
      // and effect setState are the point, not accidents. Revisit if this app
      // ever adopts the compiler.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
