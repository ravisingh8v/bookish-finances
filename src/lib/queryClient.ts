import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
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
