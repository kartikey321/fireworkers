import { access, readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

export async function resolve(specifier, context, defaultResolve) {
  const hasParent = Boolean(context.parentURL);

  if (specifier.endsWith('.js') && context.parentURL) {
    try {
      const candidate = new URL(
        specifier.replace(/\.js$/u, '.ts'),
        context.parentURL
      );
      await access(candidate);
      return { url: candidate.href, shortCircuit: true };
    } catch {
      // Fallback to default resolution when the TS file is not present.
    }
  }

  if (hasParent && /^\.{1,2}\//u.test(specifier) && !/\.[^/]+$/u.test(specifier)) {
    try {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      await access(candidate);
      return { url: candidate.href, shortCircuit: true };
    } catch {
      // Ignore missing files and defer to the next resolver.
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url));
    const result = await transform(source.toString(), {
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
      sourcemap: 'inline',
    });

    return {
      format: 'module',
      source: result.code,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
