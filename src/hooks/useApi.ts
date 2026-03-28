import { useEffect, useState } from "react";

interface UseApiOptions {
  immediate?: boolean;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  dependencies: unknown[] = [],
  options: UseApiOptions = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(options.immediate !== false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      setData(result);
      return result;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Request failed.";
      setError(message);
      throw loadError;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (options.immediate === false) {
      return;
    }

    void load();
  }, dependencies);

  return {
    data,
    isLoading,
    error,
    refetch: load,
    setData,
  };
}

