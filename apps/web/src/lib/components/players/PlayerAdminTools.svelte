<script>
  // Admin part of the player profile dialog (editing an existing player):
  // the device key (bound or not, reset) and merging this player into
  // another. Loaded only for admins (PlayerProfileDialog). `pendingAction`
  // is the dialog's in-page confirmation, shared so one confirm shows at a
  // time ('reset-key' / 'merge' here).
  import { toast } from "svelte-sonner";
  import { API } from "#lib/api.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MergeIcon from "@lucide/svelte/icons/git-merge";

  let { playerId, players = [], pendingAction = $bindable(null), onmerged } = $props();

  let keyBound = $state(null);
  let mergeTargetId = $state("");

  // Key status of the player being edited (cleared when it changes).
  $effect(() => {
    const id = playerId;
    keyBound = null;
    mergeTargetId = "";
    API.playerKeyStatus(id)
      .then((res) => playerId === id && (keyBound = res.bound))
      .catch(() => {});
  });

  async function resetKey() {
    if (pendingAction !== "reset-key") {
      pendingAction = "reset-key";
      return;
    }
    pendingAction = null;
    try {
      await API.resetPlayerKey(playerId);
      keyBound = false;
      toast.success("设备密钥已重置，选手下次打开网站时会绑定新设备");
    } catch (e) {
      toast.error("重置失败: " + e.message);
    }
  }

  async function merge() {
    mergeTargetId = mergeTargetId.trim();
    if (!mergeTargetId) {
      toast.error("请选择合并目标选手");
      return;
    }
    if (mergeTargetId === playerId || !players.some((p) => p.id === mergeTargetId)) {
      toast.error(`找不到选手 ${mergeTargetId}，请从列表中选择`);
      return;
    }
    if (pendingAction !== "merge") {
      pendingAction = "merge";
      return;
    }
    pendingAction = null;
    const from = playerId;
    const into = mergeTargetId;
    try {
      toast.loading("正在合并...", { id: "pm" });
      await API.mergePlayer(from, into);
      toast.dismiss("pm");
      toast.success(`已将 ${from} 合并到 ${into}`);
      await onmerged?.(from);
    } catch (e) {
      toast.dismiss("pm");
      toast.error("合并失败: " + e.message);
    }
  }
</script>

<!-- Device key -->
{#if keyBound !== null}
  <div class="flex items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
    <span class="text-muted-foreground">
      设备密钥：<span class="font-semibold text-foreground">{keyBound ? "已绑定" : "未绑定"}</span>
    </span>
    {#if keyBound}
      <button
        type="button"
        onclick={resetKey}
        class="rounded-md border px-2 py-1 text-[11px] font-semibold cursor-pointer transition-colors
          {pendingAction === 'reset-key' ? 'border-red-500 bg-red-500 text-white' : 'border-border text-muted-foreground hover:text-foreground'}"
        title="选手换了设备又找不到原密钥时使用；重置后第一个用这个 ID 的设备会重新绑定"
      >
        {pendingAction === "reset-key" ? "确认重置" : "重置密钥"}
      </button>
    {/if}
  </div>
{/if}

<!-- Merge -->
<div class="space-y-2 pt-2 border-t border-border/60">
  <label for="merge-target" class="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
    <MergeIcon class="w-3.5 h-3.5" />
    合并到其他选手
  </label>
  <div class="flex gap-2">
    <input
      id="merge-target"
      list="merge-target-options"
      bind:value={mergeTargetId}
      oninput={() => pendingAction === "merge" && (pendingAction = null)}
      placeholder="输入或选择目标选手 ID..."
      autocomplete="off"
      class="flex-1 min-w-0 text-xs h-8 rounded-md bg-muted/40 border border-border px-2 text-foreground focus:outline-none focus:border-primary/50"
    />
    <datalist id="merge-target-options">
      {#each players.filter((p) => p.id !== playerId) as p (p.id)}
        <option value={p.id}>{p.team ? `[${p.team}] ` : ""}{(p.flag || "").toUpperCase()}</option>
      {/each}
    </datalist>
    <Button variant="outline" size="sm" onclick={merge} disabled={!mergeTargetId.trim()} class="text-xs gap-1 h-8 shrink-0">
      <MergeIcon class="w-3.5 h-3.5" />
      执行合并
    </Button>
  </div>
  {#if pendingAction === "merge"}
    <div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
      <p class="text-xs font-semibold text-amber-600 dark:text-amber-400">
        确定将 <span class="font-mono">{playerId}</span> 合并到 <span class="font-mono">{mergeTargetId}</span>？合并后 {playerId} 将被删除，无法撤销。
      </p>
      <div class="flex gap-2 justify-end">
        <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => (pendingAction = null)}>取消</Button>
        <Button size="sm" class="h-7 text-xs gap-1" onclick={merge}>
          <MergeIcon class="w-3.5 h-3.5" />
          确认合并
        </Button>
      </div>
    </div>
  {/if}
  <p class="text-[10px] text-muted-foreground/60">
    合并后此选手的所有对阵、报名、投票和赛事账号转移到目标选手；目标选手没填的国籍、战队、联系方式和 Liquipedia 链接用此选手的补上；然后删除此选手。
  </p>
</div>
