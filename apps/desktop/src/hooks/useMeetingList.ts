import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Meeting } from "@/lib/calendar/types";

export interface AttendeeFormValue {
  email: string;
  displayName?: string;
}

export interface MeetingFormValues {
  title: string;
  description: string;
  location: string;
  startTime: string; // ISO
  endTime: string; // ISO
  caseId: number | null;
  attendees: AttendeeFormValue[];
}

/// Shared list/mutation state for any Meeting view -- the range-based grid
/// (CalendarView, `list_meetings_for_range`) and the case-scoped panel
/// (CaseMeetingsPanel, PR-5, `list_meetings_for_case`) both instantiate this
/// with a different `fetchMeetings`/`dependencyKey`, mirroring useTaskList's
/// shape. `fetchMeetings` is read through a ref so it doesn't need
/// referential stability across renders.
export function useMeetingList(fetchMeetings: () => Promise<Meeting[]>, dependencyKey: string | number) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | "new" | null>(null);
  const fetchRef = useRef(fetchMeetings);
  fetchRef.current = fetchMeetings;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRef.current();
      setMeetings(result);
    } catch (err) {
      console.error(err);
      setError("Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencyKey]);

  const createMeeting = useCallback(
    async (values: MeetingFormValues) => {
      await invoke("create_meeting", {
        title: values.title,
        description: values.description || null,
        location: values.location || null,
        startTime: values.startTime,
        endTime: values.endTime,
        caseId: values.caseId,
        attendees: values.attendees,
      });
      await reload();
    },
    [reload]
  );

  const updateMeeting = useCallback(
    async (id: number, values: MeetingFormValues) => {
      await invoke("update_meeting", {
        id,
        title: values.title,
        description: values.description || null,
        location: values.location || null,
        startTime: values.startTime,
        endTime: values.endTime,
        caseId: values.caseId,
        attendees: values.attendees,
      });
      await reload();
    },
    [reload]
  );

  const removeMeeting = useCallback(
    async (id: number) => {
      await invoke("delete_meeting", { id });
      await reload();
    },
    [reload]
  );

  const startCreate = useCallback(() => setEditingMeeting("new"), []);
  const startEdit = useCallback((meeting: Meeting) => setEditingMeeting(meeting), []);
  const closeForm = useCallback(() => setEditingMeeting(null), []);

  return {
    meetings,
    loading,
    error,
    editingMeeting,
    reload,
    createMeeting,
    updateMeeting,
    removeMeeting,
    startCreate,
    startEdit,
    closeForm,
  };
}
