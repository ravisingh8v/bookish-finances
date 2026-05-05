import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline/mobile: Never expire from cache
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error?.name === "OfflineTimeoutError") return false;
        return failureCount < 3;
      },
    },
  },
});

export default queryClient;
