// The event page's data: the event (loaded, kept live over SSE), its Ban /
// Pick template (resolved on the server), and for admins every template
// (template picker) and every player (batch registration); also the play
// times behind the vote suggestions and the seed order. Create it while the
// page component initialises (it sets up effects):
//   const data = new EventData(() => tid, () => isAdmin);

import { untrack } from "svelte";
import { toast } from "svelte-sonner";
import { API } from "$lib/api.js";
import { liveSync } from "$lib/live-sync.js";
import { previewMinPlayers, seedOrderOf } from "$lib/event-view.js";

export class EventData {
  tournament = $state(null);
  loading = $state(true);
  bpTemplate = $state(null);
  vehicleTemplates = $state([]);
  allPlayers = $state([]);
  playTimes = $state(null);
  seedOrder = $state([]);

  #tid;
  #isAdmin;
  #loadedId = null;
  #rosterFor = null; // event whose player list was requested
  #templatesLoaded = false;
  // What picks the Ban / Pick template; it is reloaded when this changes.
  #poolKey = $derived(
    this.tournament
      ? [this.#tid(), this.tournament.vehicle_pool, this.tournament.game_mode, this.tournament.vehicle_template ?? ""].join("|")
      : "",
  );

  constructor(tid, isAdmin) {
    this.#tid = tid;
    this.#isAdmin = isAdmin;

    // Live updates ($lib/live-sync.js): match changes merge a delta, the
    // rest reloads the event; a burst of messages is one refresh.
    $effect(() => {
      const id = this.#tid();
      if (!id) return;
      return liveSync(id, {
        current: () => (this.#loadedId === id ? untrack(() => this.tournament) : null),
        apply: (next) => {
          if (id !== this.#tid()) return; // route moved to another event meanwhile
          this.tournament = next;
          this.seedOrder = seedOrderOf(next?.players);
        },
      });
    });

    // The Ban / Pick template, reloaded when the settings that pick it change.
    $effect(() => {
      const key = this.#poolKey;
      if (!key) return;
      untrack(() =>
        API.getEventVehiclePool(this.#tid())
          .then((res) => key === this.#poolKey && (this.bpTemplate = res.template || null))
          .catch((e) => console.warn("vehicle pool failed to load:", e)),
      );
    });

    // Admins: every template, for the picker.
    $effect(() => {
      if (!this.#isAdmin() || this.#templatesLoaded) return;
      this.#templatesLoaded = true;
      API.getVehiclePools()
        .then((res) => (this.vehicleTemplates = res.templates || []))
        .catch((e) => {
          this.#templatesLoaded = false;
          console.warn("vehicle pools failed to load:", e);
        });
    });

    // An admin who signs in on the page still gets the player list.
    $effect(() => {
      if (this.#isAdmin() && this.tournament?.status === "registration" && this.#rosterFor !== this.#tid()) {
        untrack(() => this.#loadRoster());
      }
    });
  }

  #loadRoster() {
    this.#rosterFor = this.#tid();
    API.listPlayers()
      .then((list) => (this.allPlayers = list))
      .catch((e) => console.warn("load players failed:", e));
  }

  /** Every player not registered yet (batch registration). */
  get unregisteredPlayers() {
    const ids = new Set((this.tournament?.players || []).map((p) => p.id));
    return this.allPlayers.filter((p) => !ids.has(p.id));
  }

  /**
   * (Re)loads the event. Only the first load (or a switch to another event)
   * shows the full-page loading state; refreshes after a vote, registration
   * or SSE event keep the page mounted.
   */
  async load() {
    const tid = this.#tid();
    const isInitial = !this.tournament || this.#loadedId !== tid;
    if (isInitial) this.loading = true;
    // Admins: the player list loads in parallel with the event.
    if (this.#isAdmin() && (isInitial || this.tournament?.status === "registration")) this.#loadRoster();
    try {
      this.tournament = await API.getTournament(tid);
      this.#loadedId = tid;
      if (isInitial && !this.playTimes) {
        API.getPlayTimes()
          .then((times) => (this.playTimes = times))
          .catch((e) => console.warn("load play times failed:", e));
      }
      this.seedOrder = seedOrderOf(this.tournament?.players);
      // Registration: refresh the bracket preview.
      if (this.#isAdmin() && this.tournament.status === "registration") await this.refreshPreview();
    } catch (e) {
      toast.error("加载赛事详情失败: " + e.message);
    } finally {
      if (isInitial) this.loading = false;
    }
  }

  /** Regenerates the bracket preview once there are enough players (admins). */
  async refreshPreview() {
    const t = this.tournament;
    if ((t?.players?.length || 0) < previewMinPlayers(t)) return;
    const matches = await API.generateBracket(this.#tid());
    this.tournament = { ...this.tournament, matches };
  }
}
