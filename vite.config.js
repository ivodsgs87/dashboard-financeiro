import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pede ao browser para começar a descarregar a app principal logo de início,
// ao mesmo tempo que o React e a Firebase (em vez de esperar por eles).
const preCarregarApp = () => ({
  name: 'pre-carregar-app',
  enforce: 'post',
  transformIndexHtml(html, ctx) {
    const app = ctx.bundle && Object.values(ctx.bundle).find(c => c.type === 'chunk' && c.name === 'OrcamentoApp');
    if (!app) return html;
    return [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: '/' + app.fileName }, injectTo: 'head' }];
  },
})

export default defineConfig({
  plugins: [react(), preCarregarApp()],
  // Os ícones, o manifest e o sw.js estão em src/public (e não na pasta public da raiz)
  publicDir: 'src/public',
  build: {
    rollupOptions: {
      output: {
        // O React e a Firebase ficam em ficheiros próprios. Como quase nunca mudam,
        // o browser guarda-os e não os volta a descarregar depois de cada atualização da app.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) return 'firebase';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
        },
      },
    },
  },
})
