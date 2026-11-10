<script>
  // Phones: the one thing the player should do now (#lib/my-match.js
  // playerAction) in a bar above the bottom tab bar, shown once the place
  // that has the same button (我的比赛, the registration card) is out of
  // view, so the action is always a thumb away.
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { playerAction } from "#lib/my-match.js";
  import { Button } from "#lib/components/ui/button/index.js";

  let { tournament, tid, playerId = "", order = null, canSignUp = false, isRegistered = false, needsIdentity = () => false, onregister, onreport, onreload } = $props();

  const action = $derived(playerAction(tournament, playerId, { order, canSignUp, isRegistered }));
  // The element whose button this bar repeats.
  const targetId = $derived(action?.kind === "register" ? "registration-card" : "my-match-card");

  let targetVisible = $state(false);
  $effect(() => {
    const id = targetId;
    if (!action) return;
    let observer = null;
    let stopped = false;
    tick().then(() => {
      if (stopped) return;
      const el = document.getElementById(id);
      if (!el || typeof IntersectionObserver === "undefined") {
        targetVisible = false;
        return;
      }
      observer = new IntersectionObserver(([entry]) => (targetVisible = entry.isIntersecting), { threshold: 0.4 });
      observer.observe(el);
    });
    return () => {
      stopped = true;
      observer?.disconnect();
    };
  });

  let busy = $state(false);
  async function run() {
    const a = action;
    if (!a) return;
    if (a.kind === "register") return onregister?.();
    if (a.kind === "report") return onreport?.(a.match);
    if (a.kind === "confirm") {
      document.getElementById("my-match-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (a.kind === "checkin") {
      if (needsIdentity()) return;
      busy = true;
      try {
        await API.checkIn(tid, playerId);
        toast.success("签到成功");
        await onreload?.();
      } catch (e) {
        toast.error(e.message);
      } finally {
        busy = false;
      }
    }
  }
</script>

<!-- Room at the end of the page so the bar never hides the last content. -->
{#if action}<div class="h-14 md:hidden" aria-hidden="true"></div>{/if}
{#if action && !targetVisible}
  <div
    class="md:hidden fixed inset-x-0 z-30 border-t border-primary/30 bg-background/95 px-3 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm"
    style="bottom: calc(57px + env(safe-area-inset-bottom))"
    data-player-action={action.kind}
  >
    <div class="flex items-center gap-3">
      <p class="min-w-0 flex-1 truncate text-sm font-semibold">{action.title}</p>
      <Button size="sm" disabled={busy} onclick={run} class="shrink-0 font-bold">{action.label}</Button>
    </div>
  </div>
{/if}
