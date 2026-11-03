import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Règles choisies pour attraper une régression, pas pour réécrire le style :
 * le formatage reste à Prettier.
 *
 * Les règles historiques bruyantes sont en `warn` : elles décrivent une dette
 * réelle (replis muets, affectations inutiles, hooks appelés après un retour
 * anticipé dans StartPage et NotesDrawer) mais les passer en erreur bloquerait
 * la CI sans qu'elles aient été traitées. Elles restent visibles à chaque run.
 * Les erreurs sont réservées à ce qui ne doit jamais atterrir sur `main` :
 * un `any` explicite, du code cassé, une dépendance oubliée.
 */
export const DEBT = 'warn'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'release/**',
      'build/**',
      'rust/**',
      '.audit-*/**',
      '.cloud-attachments/**',
      '.freebuff/**',
      'skills/**',
      'screenshots/**',
      '.bt-*.cjs',
      'site/trailer/take/**',
      'site/dist/**',
      'site/trailer/probe/**',
      'site/trailer/.record-data/**',
      'docs/captures/**',
      '**/*.png',
      '**/*.jpg'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}']
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      // Dette assumée : 167 replis muets à commenter un par un.
      'no-empty': [DEBT, { allowEmptyCatch: true }],
      'no-useless-assignment': DEBT,
      'no-useless-escape': DEBT,
      'no-control-regex': DEBT,
      'no-constant-binary-expression': DEBT,
      'preserve-caught-error': DEBT,
      '@typescript-eslint/no-unused-vars': [
        DEBT,
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // StartPage et NotesDrawer appellent des hooks après un retour anticipé :
      // à refactorer, mais le comportement actuel est celui livré.
      'react-hooks/rules-of-hooks': DEBT,
      'react-hooks/set-state-in-effect': DEBT,
      'react-hooks/refs': DEBT,
      'react-hooks/purity': DEBT,
      'react-hooks/immutability': DEBT
    }
  },
  {
    // Le userscript tourne dans une page avec les API Greasemonkey fournies
    // par Vela, le JS du site dans la page publique.
    files: ['userscripts/**/*.js', 'site/public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        GM_getValue: 'readonly',
        GM_setValue: 'readonly',
        GM_xmlhttpRequest: 'readonly',
        unsafeWindow: 'readonly',
        // Ponts fournis par le preload des pages, absents de l'objet window.
        velaComicVision: 'readonly',
        velaComicEdits: 'readonly',
        velaComicLoadEdits: 'readonly'
      }
    },
    rules: {
      'no-console': 'off',
      'no-empty': [DEBT, { allowEmptyCatch: true }],
      'no-unused-vars': DEBT
    }
  },
  {
    // Worker du site : runtime Cloudflare (fetch, URL, Response), ni Node ni DOM.
    files: ['site/worker.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        fetch: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        caches: 'readonly',
        crypto: 'readonly'
      }
    }
  },
  {
    // Scripts d'outillage : modules Node (`.mjs`) ou CommonJS (`.cjs`).
    files: ['**/*.cjs', 'scripts/**/*.js', 'scripts/**/*.mjs', 'site/tools/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      'no-console': 'off',
      'no-empty': [DEBT, { allowEmptyCatch: true }],
      'no-useless-assignment': DEBT,
      'no-unused-vars': DEBT
    }
  }
)
