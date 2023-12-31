<script setup lang="ts">
import { ref } from "vue";
import * as Nostr from "nostr-tools";

import { feedRelays, profileRelays, pool, normalizeUrls } from "./relays";
import { addUserEvent, getSortedUserEvents, userAndEvents } from "./store";

pool.subscribe(
  [{
    kinds: [1],
    limit: 100,
  }],
  [...new Set(normalizeUrls([...feedRelays]))],
  async (ev, _isAfterEose, _relayURL) => {
    addUserEvent(ev);
  },
  0,
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

async function collectProfiles(force = false) {
  if (cacheMissHitPubkeys.size === 0 && !force) {
    return;
  }

  const pubkeys = [...new Set<string>([...userAndEvents.value.keys(), ...cacheMissHitPubkeys])];
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

        if (force && ev.created_at > Math.floor(new Date().getTime() / 1000) - forceProfileUpdateInterval * 2) {
          pool.publish(ev, [...new Set(normalizeUrls([...feedRelays]))]);
        } else if (cacheMissHitPubkeys.has(ev.pubkey)) {
          pool.publish(ev, [...new Set(normalizeUrls([...feedRelays]))]);
        }
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
  }, 5 * 1000);
}
setInterval(() => { collectProfiles(false); }, 5 * 1000);

const forceProfileUpdateInterval = 29;
setInterval(() => { collectProfiles(true); }, forceProfileUpdateInterval * 1000);

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
    <h2><a target="_blank" :href="'https://relay-jp.nostr.wirednet.jp/index.html?' + Nostr.nip19.npubEncode(u[0])">{{
      getProfile(u[0]).display_name || getProfile(u[0]).name || getProfile(u[0]).pubkey }}</a></h2>
    <hr />
    <div class="div-events-container">
      <img class="div-events-avator"
        :src="getProfile(u[0]).picture ? getProfile(u[0]).picture : 'https://placehold.jp/623e70/d7c6c6/60x60.png?text=Unknown'"
        @error="(e) => { (e.target as HTMLImageElement).src = 'https://placehold.jp/391e6c/d7c6c6/60x60.png?text=Image%0ANot%20Found' }" />
      <div class="div-events-content">
        <template v-for="e in u[1].events.slice(-1).reverse()">
          <p>
            <span>{{ new Date(e.created_at * 1000).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            }}</span>
            <span>&nbsp;&nbsp;</span>
            <span>{{ e.content.split("\n").slice(0, 1).join("\n") }}</span>
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
h2 {
  margin-block: 0;
  font-size: 18px;
  width: 100%;
  max-width: 100%;
}

h2>a {
  color: #222;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  max-width: 100%;
  display: inline-block;
}

hr {
  margin: 0.2rem;
  border: none;
  border-top: 1px solid #ccc;
}

.div-events {
  margin: 0 0.2em;
}

.div-events-container {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.div-events-avator {
  width: 3rem;
  max-width: 3rem;
  height: 3rem;
  max-height: 3rem;
  border-radius: 15%;
  margin: 0.2rem 0.5rem 1rem 0.5rem;
}

.div-events-content {
  flex: 1;
  padding: 0.5rem;
  margin: 0.2rem 0.5rem 1rem 0.5rem;
  border: 0.5px solid #ccc;
  border-radius: 7px;
  background-color: #f5ebeb;
  white-space: normal;
  word-break: break-word;
  word-wrap: break-word;
}

.div-events-content p {
  margin: 0;
  font-size: 16px;
  line-height: 1.2;
}
</style>
