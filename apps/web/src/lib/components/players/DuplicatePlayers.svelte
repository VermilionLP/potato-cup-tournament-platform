<script>
  // Admins, player list: likely duplicate players (IDs that differ only in
  // case or separators, a typo, or one containing the other), from
  // GET /players/duplicates. Each pair merges the smaller record into the
  // bigger one (or the other way), or is marked as two different people.
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { askConfirm } from "#lib/confirm.svelte.js";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  let { onmerged } = $props();

  let pairs = $state([]);
  let open = $state(false);
  let busy = $state("");

  async function load() {
    try {
      pairs = (await API.getDuplicatePlayers()).pairs || [];
    } catch (e) {
      toast.error("加载疑似重复选手失败: " + e.message);
    }
  }
  onMount(load);

  const key = (pair) => `${pair.from.id}|${pair.into.id}`;
  const info = (p) => `${p.events ? `${p.events} 场赛事` : "无参赛"}${p.key_bound ? " · 已绑定设备" : ""}`;

  async function merge(pair, from, into) {
    const ok = await askConfirm(
      `把「${from.id}」合并到「${into.id}」？\n「${from.id}」的报名、对阵、投票和天梯记录都会归到「${into.id}」，旧 ID 保留为曾用名。此操作不能撤销。`,
      { danger: true, confirmText: "合并" },
    );
    if (!ok) return;
    busy = key(pair);
    try {
      await API.mergePlayer(from.id, into.id);
      toast.success(`已将 ${from.id} 合并到 ${into.id}`);
      await onmerged?.({ removed: from.id });
      await load();
    } catch (e) {
      toast.error("合并失败: " + e.message);
    } finally {
      busy = "";
    }
  }

  async function dismiss(pair) {
    busy = key(pair);
    try {
      await API.markNotDuplicate(pair.from.id, pair.into.id);
      pairs = pairs.filter((p) => key(p) !== key(pair));
    } catch (e) {
      toast.error(e.message);
    } finally {
      busy = "";
    }
  }
</script>

{#if pairs.length}
  <div class="rounded-xl border border-amber-500/30 bg-amber-500/5">
    <button
      type="button"
      onclick={() => (open = !open)}
      aria-expanded={open}
      class="w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
    >
      <UsersIcon class="w-4 h-4 shrink-0" />
      <span class="flex-1">疑似重复的选手（{pairs.length} 组）</span>
      <ChevronDownIcon class="w-4 h-4 shrink-0 transition-transform {open ? 'rotate-180' : ''}" />
    </button>
    {#if open}
      <div class="border-t border-amber-500/20 divide-y divide-border/60">
        <p class="px-4 py-2 text-[11px] text-muted-foreground">
          ID 只差大小写、空格 / 下划线或一两个字母的选手，可能是同一个人注册了两次。默认把参赛少的合并到参赛多的；不是同一人就点「不是同一人」，以后不再提示。
        </p>
        {#each pairs as pair (key(pair))}
          <div class="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <div class="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <a href="/player/{encodeURIComponent(pair.from.id)}" class="font-semibold hover:text-primary hover:underline break-all">{pair.from.id}</a>
              <span class="text-[10px] text-muted-foreground">{info(pair.from)}</span>
              <span class="text-muted-foreground">→</span>
              <a href="/player/{encodeURIComponent(pair.into.id)}" class="font-semibold hover:text-primary hover:underline break-all">{pair.into.id}</a>
              <span class="text-[10px] text-muted-foreground">{info(pair.into)}</span>
            </div>
            <div class="flex flex-wrap gap-1.5 shrink-0">
              <button type="button" disabled={busy === key(pair)} onclick={() => merge(pair, pair.from, pair.into)} class="h-7 rounded-md bg-primary px-2.5 font-semibold text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-50">
                合并到 {pair.into.id}
              </button>
              <button type="button" disabled={busy === key(pair)} onclick={() => merge(pair, pair.into, pair.from)} class="h-7 rounded-md border border-border px-2 hover:bg-muted cursor-pointer disabled:opacity-50" title="反过来合并">
                反向合并
              </button>
              <button type="button" disabled={busy === key(pair)} onclick={() => dismiss(pair)} class="h-7 rounded-md border border-border px-2 text-muted-foreground hover:bg-muted cursor-pointer disabled:opacity-50">
                不是同一人
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
