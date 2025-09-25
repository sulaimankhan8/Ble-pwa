import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
     tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "BLE Relay PWA",
        short_name: "BLE-Relay",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2a5298",
        icons: [
          { src: "/icons/icon-192.png", sizes: "128x128", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
        ],
        screenshots: [
          {
            src: "/screenshots/screen1.png",
            sizes: "1918x865",
            type: "image/png",
            label: "Main screen",
           
      form_factor: "wide"
          },
           {
            src: "/screenshots/screen1.png",
            sizes: "1918x865",
            type: "image/png",
          }
        ]
      }
    })
  ]
})

