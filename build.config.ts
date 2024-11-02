import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  externals: ['vite', 'typescript'],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
    esbuild: {
      target: 'node18',
    },
  },
})
