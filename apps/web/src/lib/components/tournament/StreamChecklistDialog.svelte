<script>
  // Going-live pre-flight checklist: every item must be ticked before the
  // stream mode can be switched on. The ticks reset each time it opens.
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import RadioIcon from "@lucide/svelte/icons/radio";
  import MicIcon from "@lucide/svelte/icons/mic";
  import HeadphonesIcon from "@lucide/svelte/icons/headphones";
  import Volume2Icon from "@lucide/svelte/icons/volume-2";
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";

  let { open = $bindable(false), onconfirm } = $props();

  const ITEMS = [
    { key: "mic", label: "麦克风", desc: "麦克风已连接，收音正常", icon: MicIcon },
    { key: "voice", label: "语音", desc: "语音 / 开黑频道已就绪", icon: HeadphonesIcon },
    { key: "gameSound", label: "游戏声音", desc: "游戏音效已进入 OBS 混音", icon: Volume2Icon },
    { key: "gameScreen", label: "游戏画面", desc: "游戏画面采集正常", icon: MonitorIcon },
    { key: "overlay", label: "Overlay", desc: "直播大屏叠加已设置完成", icon: LayoutDashboardIcon },
  ];
  let checks = $state({});
  let allDone = $derived(ITEMS.every((item) => checks[item.key]));

  $effect(() => {
    if (open) checks = {};
  });

  function confirm() {
    if (!allDone) return;
    open = false;
    onconfirm?.();
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-2xl bg-card border border-primary/30">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-primary flex items-center gap-2">
        <RadioIcon class="w-4 h-4" /> 开播前检查
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        请确认以下各项均已设置完成；全部勾选后才能激活直播状态。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-2 py-2">
      {#each ITEMS as item (item.key)}
        {@const ItemIcon = item.icon}
        <label class="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/40 cursor-pointer select-none">
          <input type="checkbox" bind:checked={checks[item.key]} class="h-4 w-4 accent-primary cursor-pointer" />
          <ItemIcon class="w-4 h-4 text-muted-foreground shrink-0" />
          <div class="min-w-0">
            <div class="text-xs font-semibold text-foreground">{item.label}</div>
            <div class="text-[10px] text-muted-foreground">{item.desc}</div>
          </div>
        </label>
      {/each}
    </div>

    <Dialog.Footer class="flex flex-row justify-end gap-2">
      <Button variant="ghost" size="sm" class="h-8 text-xs cursor-pointer" onclick={() => (open = false)}>取消</Button>
      <Button size="sm" class="h-8 text-xs cursor-pointer" disabled={!allDone} onclick={confirm}>开始直播</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
