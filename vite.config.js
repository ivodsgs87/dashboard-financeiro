import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Os ícones, o manifest e o sw.js estão em src/public (e não na pasta public da raiz)
  publicDir: 'src/public',
})
