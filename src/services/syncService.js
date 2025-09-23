import { pushEvent, popAllEvents, peekEvents } from '../utils/storage';
import { EVENTS_ENDPOINT, EVENTS_BATCH } from '../api';

export async function uploadEvent(event) {
  try {

    const res = await fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
     
    }); console.log( "uploadBatchIfAny");
    if (res.ok) return true;
  } catch (e) {}
  // if failed, store locally
  console.log('upload failed, storing event locally');
  
  await pushEvent(event);
  return false;
}

export async function uploadBatchIfAny() {
  const events = await peekEvents();
  console.log( "uploadBatchIfAny");
  
  log('Attempting batch upload of', events.length, 'events');
  if (!events.length) return;
  try {
    const res = await fetch(EVENTS_BATCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events)
    });
    if (res.ok) {
      // clear queue
      await popAllEvents();
      return true;

      console.log('Batch upload successful, cleared local queue');
    }
  } catch (e) {}
  return false;
}
