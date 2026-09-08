import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
export default defineConfig(({isSsrBuild}) => ({
  plugins:[sites()],
  build:isSsrBuild ? {outDir:'dist/server',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'index.js'}}} : {outDir:'dist/client',emptyOutDir:true},
  ssr:{noExternal:true},
  server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:8787'}}
}));
