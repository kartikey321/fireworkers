const nodePolyfillsPlugin = {
  name: 'node-polyfills',
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => {
      return { path: args.path.slice(5), external: true };
    });

    build.onResolve({ filter: /^(crypto|util|stream)$/ }, (args) => {
      return { path: `${args.path}-browserify`, external: true };
    });
  },
};

export default nodePolyfillsPlugin;
