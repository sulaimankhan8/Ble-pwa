import { pushEvent, popAllEvents, peekEvents } from '../utils/storage';
import { EVENTS_ENDPOINT, EVENTS_BATCH } from '../api';

export async function uploadEvent(event) {
  try {
    const res = await fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    console.log("[UploadEvent] Sent event:", event);
    if (res.ok) return true;
  } catch (e) {
    console.error("[UploadEvent] Error:", e);
  }

  // if failed, store locally
  console.warn("[UploadEvent] Upload failed, storing event locally");
  await pushEvent(event);
  return false;
}

export async function uploadBatchIfAny() {
  const events = await peekEvents();
  console.log("[UploadBatch] Checking queued events:", events.length);

  if (!events.length) return;

  try {
    console.log("[UploadBatch] Attempting to upload:", events);
    const res = await fetch(EVENTS_BATCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events)
    });
    if (res.ok) {
      await popAllEvents();
      console.log("[UploadBatch] Success! Cleared local queue");
      return true;
    } else {
      console.warn("[UploadBatch] Server responded with status:", res.status);
    }
  } catch (e) {
    console.error("[UploadBatch] Error:", e);
  }

  return false;
}

