import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const buildId = new Date().toISOString();
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;
const ONE_MONTH_IN_SECONDS = 30 * 24 * 60 * 60;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseOrigin = env.VITE_SUPABASE_URL
    ? new URL(env.VITE_SUPABASE_URL).origin
    : null;
  const supabaseApiPattern = supabaseOrigin
    ? new RegExp(
        `^${escapeRegex(supabaseOrigin)}/(rest|auth|storage|functions|realtime)/`,
      )
    : undefined;

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
        registerType: "autoUpdate",
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          navigateFallback: "index.html",
          navigateFallbackAllowlist: [/^(?!\/__).*/],
          runtimeCaching: [
            // Navigation requests are handled by Workbox's built-in
            // NavigationRoute via `navigateFallback: "index.html"`. The
            // precached index.html is always served instantly (works fully
            // offline). New deploys are picked up via autoUpdate +
            // skipWaiting + the in-app update prompt.
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
            ...(supabaseApiPattern
              ? [
                  {
                    urlPattern: supabaseApiPattern,
                    handler: "NetworkFirst" as const,
                    method: "GET" as const,
                    options: {
                      cacheName: "api-cache",
                      networkTimeoutSeconds: 3,
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                      expiration: {
                        maxEntries: 64,
                        maxAgeSeconds: ONE_WEEK_IN_SECONDS,
                      },
                    },
                  },
                ]
              : []),
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
