import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const buildId = new Date().toISOString();
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;
const ONE_MONTH_IN_SECONDS = 30 * 24 * 60 * 60;

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      VitePWA({
        includeAssets: ["favicon.ico", "robots.txt", "placeholder.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"],
        injectRegister: "script",
        registerType: "prompt",
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          navigateFallback: "index.html",
          navigateFallbackAllowlist: [/^(?!\/__).*/],
          runtimeCaching: [
            // Navigation requests are handled by Workbox's built-in
            // NavigationRoute via `navigateFallback: "index.html"`. The
            // precached index.html is always served instantly (works fully
            // offline). New deploys are picked up from the App Update page,
            // where the user can manually check and apply a waiting worker.
            {
              urlPattern: ({ sameOrigin, request }) =>
                sameOrigin &&
                ["style", "script", "worker", "font"].includes(
                  request.destination,
                ),
              handler: "CacheFirst",
              options: {
                cacheName: "app-shell",
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: ONE_WEEK_IN_SECONDS,
                },
              },
            },
            {
              urlPattern: ({ sameOrigin, request }) =>
                sameOrigin && request.destination === "image",
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "app-images",
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: ONE_MONTH_IN_SECONDS,
                },
              },
            },
          ],
        },
        manifest: {
          name: "Expense Tracker",
          short_name: "Expenses",
          description: "Shared expense tracker for books and groups",
          theme_color: "#0f766e",
          background_color: "#ffffff",
          display: "standalone",
          orientation: "portrait-primary",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
