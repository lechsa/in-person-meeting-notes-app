import { useState, useEffect, useCallback } from 'react';
import type { Meeting } from '../types';
import { getAllMeetings, getMeetingById } from '../services/meetings';

/**
 * Hook for fetching and managing the meetings list.
 * Supports pull-to-refresh and manual refetch.
 */
export function useMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    try {
      setError(null);
      const data = await getAllMeetings();
      setMeetings(data);
    } catch (err: any) {
      console.error('Failed to fetch meetings:', err);
      setError(err.message ?? 'Failed to load meetings');
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await fetchMeetings();
      setIsLoading(false);
    })();
  }, [fetchMeetings]);

  // Pull-to-refresh handler
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchMeetings();
    setIsRefreshing(false);
  }, [fetchMeetings]);

  return {
    meetings,
    isLoading,
    isRefreshing,
    error,
    refresh,
    refetch: fetchMeetings,
  };
}

/**
 * Hook for fetching a single meeting by ID.
 */
export function useMeeting(id: string) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeeting = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const data = await getMeetingById(id);
      setMeeting(data);
    } catch (err: any) {
      console.error('Failed to fetch meeting:', err);
      setError(err.message ?? 'Failed to load meeting');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMeeting();
  }, [fetchMeeting]);

  return {
    meeting,
    isLoading,
    error,
    refetch: fetchMeeting,
  };
}
