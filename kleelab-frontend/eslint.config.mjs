import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated from openapi.json by `npm run types:api`.
    'src/types/api.gen.ts',
  ]),
]);

export default eslintConfig;
