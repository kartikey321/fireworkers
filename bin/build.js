import { exec } from 'child_process';
import { build } from 'esbuild';

const entryPoints = ['src/index.ts'];

// Build ESM version
build({
  entryPoints,
  logLevel: 'info',
  bundle: true,
  outbase: './src',
  outdir: './dist',
  format: 'esm',
  outExtension: { '.js': '.js' },
  platform: 'browser',
  target: 'es2020',
});

// Build CommonJS version
build({
  entryPoints,
  logLevel: 'info',
  bundle: true,
  outbase: './src',
  outdir: './dist',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  platform: 'node',
  target: 'node16',
});

// Generate TypeScript declarations
exec(`tsc --emitDeclarationOnly --declaration --project tsconfig.build.json`);