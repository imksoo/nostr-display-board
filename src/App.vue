<script setup lang="ts">
import { ref } from "vue";
import * as Nostr from "nostr-tools";

import { feedRelays, profileRelays, pool, normalizeUrls } from "./relays";
import { addUserEvent, getSortedUserEvents } from "./store";

pool.subscribe(
  [{
    kinds: [1],
    limit: 5000,
  }],
  [...new Set(normalizeUrls([...feedRelays]))],
  async (ev, _isAfterEose, _relayURL) => {
    addUserEvent(ev);
  },
  undefined,
  undefined,
);

// ローカルストレージからプロフィール情報を読み出しておく
const profiles = ref(
  new Map<string, any>(JSON.parse(localStorage.getItem("profiles") ?? "[]"))
);
let cacheMissHitPubkeys = new Set<string>()

type Profile = {
  pubkey: string,
  picture: string,
  display_name: string,
  name: string,
  created_at: number,
};

function getProfile(pubkey: string): Profile {
  let prof;
  if (!profiles.value.has(pubkey)) {
    cacheMissHitPubkeys.add(pubkey);
    prof = {
      pubkey: pubkey,
      picture: "https://placehold.jp/60x60.png",
      display_name: "",
      name: "",
      created_at: 0,
    };
  } else {
    prof = profiles.value.get(pubkey);
  }

  return prof;
}

async function collectProfiles() {
  if (cacheMissHitPubkeys.size === 0) {
    return;
  }

  const pubkeys = [...new Set<string>([...cacheMissHitPubkeys])];
  const unsub = pool.subscribe(
    [{
      kinds: [0],
      authors: pubkeys,
    }],
    [...new Set(normalizeUrls([...feedRelays, ...profileRelays]))],
    async (ev, _isAfterEose, _relayURL) => {
      if (!Nostr.verifySignature(ev)) {
        console.log('Invalid nostr event, signature invalid', ev);
        return;
      }

      if (ev.kind === 0) {
        const content = JSON.parse(ev.content);

        if (
          !profiles.value.has(ev.pubkey) ||
          profiles.value.get(ev.pubkey)?.created_at < ev.created_at
        ) {
          const press = {
            pubkey: ev.pubkey,
            picture: content.picture,
            display_name: content.display_name,
            name: content.name,
            created_at: ev.created_at,
          };
          profiles.value.set(ev.pubkey, press);
          cacheMissHitPubkeys.delete(ev.pubkey);
        }
      }
    },
    undefined,
    () => {
      if (cacheMissHitPubkeys.size === 0) {
        unsub();
        clearTimeout(timeout);
      }
    },
    { unsubscribeOnEose: true }
  );
  const timeout = setTimeout(() => {
    unsub();
    console.log(`collectProfiles(${timeout}) => Timeout, ${cacheMissHitPubkeys.size} pubkeys remain`);
  }, 5 * 1000);
}

setInterval(() => {
  collectProfiles();
}, 5 * 1000);

setInterval(() => {
  // ローカルストレージにプロフィール情報を保存しておく
  const diskProfiles = new Map<string, any>(JSON.parse(localStorage.getItem("profiles") ?? "[]"));

  profiles.value.forEach((val, key) => {
    if (val.created_at > 0) {
      if (diskProfiles.has(key) && diskProfiles.get(key).created_at < val.created_at) {
        diskProfiles.set(key, val);
      } else {
        diskProfiles.set(key, val);
      }
    }
  });

  localStorage.setItem(
    "profiles",
    JSON.stringify(Array.from(profiles.value.entries()))
  );
}, 8 * 1000);

</script>
<template>
  <h1>Japanese Nostr Board</h1>
  <div v-for="u in getSortedUserEvents()" class="div-events">
    <h2><a :href="'https://relay-jp.nostr.wirednet.jp/index.html?' + Nostr.nip19.npubEncode(u[0])">{{
      getProfile(u[0]).display_name || getProfile(u[0]).name || getProfile(u[0]).pubkey }}</a></h2>
    <div class="div-events-content">
      <p v-for="e in u[1].events.slice(-3).reverse()">
        <span>{{ new Date(e.created_at * 1000).toLocaleTimeString() }}</span>
        <span>&nbsp;</span>
        <span>{{ e.content.split("\n").slice(0, 1).join("\n") }}</span>
      </p>
    </div>
  </div>
</template>

<style lang="scss">
h2 {
  margin: 0.1em;
  padding: 0.1em;
  margin-block: 0.1em;
  font-size: 18px;
}
.div-events {
  margin: 0.2em;
}
.div-events-content {
  padding: 0.5em;
  margin: 0.5em 1em;
  border: 0.5px solid #ccc;
  border-radius: 0.5em;
}
.div-events-content p {
  margin: 0;
  font-size: 16px;
}
</style>
