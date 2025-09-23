import { set, get, del, keys } from 'idb-keyval';

const QUEUE_KEY = 'events_queue';

export async function pushEvent(evt) {
  const q = (await get(QUEUE_KEY)) || [];
  q.push(evt);
  await set(QUEUE_KEY, q);
}

export async function popAllEvents() {
  const q = (await get(QUEUE_KEY)) || [];
  await del(QUEUE_KEY);
  return q;
}

export async function peekEvents() {
  return (await get(QUEUE_KEY)) || [];
}
