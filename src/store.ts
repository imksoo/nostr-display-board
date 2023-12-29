import { ref } from "vue";
import * as Nostr from "nostr-tools";

type UserEvents = {
  events: Array<Nostr.Event>;
  latestCreatedAt: number;
}

export const eventsReceived = ref(new Map<string, Nostr.Event>());
export const userAndEvents = ref(new Map<string, UserEvents>());

export const addUserEvent = (event: Nostr.Event) => {
  const pubkey = event.pubkey;
  const userEvents = userAndEvents.value.get(pubkey);
  if (userEvents) {
    if (userEvents.events.find((e) => e.id === event.id)) {
      return;
    }
    userEvents.events.push(event);
    userEvents.events.sort((a, b) => a.created_at - b.created_at);
    if (userEvents.latestCreatedAt < event.created_at) {
      userEvents.latestCreatedAt = event.created_at;
    }
  } else {
    userAndEvents.value.set(pubkey, {
      events: [event],
      latestCreatedAt: event.created_at
    });
  }
}

export const getSortedUserEvents = () => {
  const sortedEvents = Array.from(userAndEvents.value)
    .sort((a, b) => b[1].latestCreatedAt - a[1].latestCreatedAt);

  return sortedEvents;
}