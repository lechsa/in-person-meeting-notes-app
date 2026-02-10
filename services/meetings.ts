import { supabase } from '../lib/supabase';
import type { Meeting, MeetingStatus } from '../types';

/**
 * Create a new meeting record (status: 'recording').
 */
export async function createMeeting(duration?: number): Promise<Meeting> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('meetings')
    .insert({
      user_id: user.id,
      status: 'recording' as MeetingStatus,
      duration: duration ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Meeting;
}

/**
 * Fetch all meetings for the current user, sorted by created_at desc.
 */
export async function getAllMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Meeting[];
}

/**
 * Fetch a single meeting by ID.
 */
export async function getMeetingById(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }
  return data as Meeting;
}

/**
 * Update meeting status and optionally set audio_url / duration.
 */
export async function updateMeetingStatus(
  id: string,
  status: MeetingStatus,
  extra?: { audio_url?: string; duration?: number }
): Promise<void> {
  const { error } = await supabase
    .from('meetings')
    .update({
      status,
      ...extra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}
