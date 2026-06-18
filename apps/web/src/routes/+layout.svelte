<script>
  import "../app.css";
  import { Toaster, toast } from "svelte-sonner";
  import { userState } from "$lib/user.svelte.js";
  import { API } from "$lib/api.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import UserRoundIcon from "@lucide/svelte/icons/user";
  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import SwordIcon from "@lucide/svelte/icons/swords";

  let { children } = $props();

  let openIdDialog = $state(false);
  let idInput = $state("");
  let existingPlayers = $state([]);

  let qqInput = $state("");
  let qqError = $state("");
  let verifying = $state(false);

  // Generate a premium gradient avatar color based on the player ID
  const avatarColors = [
    "from-amber-500 to-orange-600 shadow-amber-500/20",
    "from-purple-500 to-indigo-600 shadow-purple-500/20",
    "from-blue-500 to-cyan-600 shadow-blue-500/20",
    "from-emerald-500 to-teal-600 shadow-emerald-500/20",
    "from-rose-500 to-pink-600 shadow-rose-500/20",
    "from-violet-500 to-fuchsia-600 shadow-violet-500/20",
  ];

  let avatarGradient = $derived.by(() => {
    if (!userState.id) return avatarColors[0];
    let sum = 0;
    for (let i = 0; i < userState.id.length; i++) {
      sum += userState.id.charCodeAt(i);
    }
    return avatarColors[sum % avatarColors.length];
  });

  async function handleOpenDialog() {
    idInput = userState.id || "";
    qqInput = userState.qqGroup || "";
    qqError = "";
    openIdDialog = true;
    try {
      existingPlayers = await API.listPlayers();
    } catch (e) {
      console.error("加载选手列表失败:", e);
    }
  }

  async function handleSaveId() {
    const trimmedQQ = qqInput.trim();
    const trimmedId = idInput.trim();
    if (!trimmedQQ) {
      qqError = "请输入 QQ 群号";
      return;
    }
    if (!trimmedId) {
      toast.error("请输入选手 ID");
      return;
    }

    verifying = true;
    qqError = "";

    try {
      const res = await API.verifyQQ(trimmedQQ);
      if (res.valid) {
        userState.setQQGroup(trimmedQQ);
        userState.setId(trimmedId);
        openIdDialog = false;
        toast.success("身份配置已保存并激活权限！");
      } else {
        qqError = "验证未通过，请输入正确的 SUCK 水友群号";
        toast.error("群号验证失败！");
      }
    } catch (err) {
      qqError = "验证请求发生错误，请稍后重试";
      toast.error("网络错误，请稍后重试");
      console.error(err);
    } finally {
      verifying = false;
    }
  }

  function handleClearId() {
    userState.setId("");
    userState.setQQGroup("");
    idInput = "";
    qqInput = "";
    openIdDialog = false;
    toast.success("已退出身份，目前为只读查看模式");
  }
</script>

<div
  class="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30"
>
  <!-- Top Bar / Header -->
  <header
    class="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-4 flex items-center justify-between"
  >
    <div class="flex items-center gap-3">
      <div
        class="bg-primary/10 text-primary p-2 rounded-lg border border-primary/20"
      >
        <TrophyIcon class="w-5 h-5" />
      </div>
      <div>
        <a
          href="/"
          class="flex items-center gap-2 text-xl font-bold tracking-wider hover:text-primary transition-colors text-foreground"
        >
          SUCK <span
            class="text-primary font-light text-sm tracking-widest border-l border-border pl-2 uppercase"
            >Tournament</span
          >
        </a>
        <p class="text-xs text-muted-foreground mt-0.5">Matchmaking Site</p>
      </div>
    </div>

    <!-- Right Side Profile -->
    <div class="flex items-center gap-3">
      <button
        id="header-profile-button"
        onclick={handleOpenDialog}
        class="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-muted/40 hover:bg-muted/70 border border-border transition-all text-xs group text-left cursor-pointer"
      >
        <div
          class="w-6 h-6 rounded-full bg-gradient-to-br {avatarGradient} flex items-center justify-center text-[10px] font-bold text-white shadow-md uppercase"
        >
          {userState.id ? userState.id.slice(0, 2) : "?"}
        </div>
        <div class="hidden sm:block">
          <div
            class="text-xs font-semibold text-foreground leading-tight group-hover:text-primary transition-colors"
          >
            {userState.id || "游客模式"}
          </div>
          <div class="text-[9px] text-muted-foreground leading-none">
            {userState.qqGroup
              ? `群: ${userState.qqGroup}`
              : "查看模式 (未登录)"}
          </div>
        </div>
      </button>
    </div>
  </header>

  <!-- Main View -->
  <main class="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col">
    {#if children}
      {@render children()}
    {/if}
  </main>
</div>

<!-- Global Toaster -->
<Toaster position="bottom-right" theme="dark" />

<!-- Player ID Config Dialog -->
<Dialog.Root bind:open={openIdDialog}>
  <Dialog.Content
    class="max-w-[340px] sm:max-w-[380px] bg-card border border-border"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
      >
        <UserRoundIcon class="w-5 h-5 text-primary" />
        身份与加入群验证
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        输入您所在的 SUCK 战队 QQ 水友群号和游戏昵称
        ID，以解锁创建、报名和修改权限。
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-4 py-2">
      <div class="space-y-1.5">
        <label
          for="layout-qq-input"
          class="text-xs font-semibold text-muted-foreground"
          >群验证 QQ 群号</label
        >
        <Input
          id="layout-qq-input"
          bind:value={qqInput}
          placeholder="请输入 SUCK 任意群号"
          class="bg-background border-border text-foreground"
        />
        {#if qqError}
          <p class="text-[10px] text-destructive font-medium animate-pulse">
            {qqError}
          </p>
        {/if}
      </div>

      <div class="space-y-1.5">
        <label
          for="player-id-input"
          class="text-xs font-medium text-muted-foreground"
          >选手游戏昵称 / ID</label
        >
        <Input
          id="player-id-input"
          bind:value={idInput}
          placeholder="例如: Wayne"
          class="bg-background border-border text-foreground"
          onkeydown={(e) => {
            if (e.key === "Enter") handleSaveId();
          }}
        />
      </div>

      {#if existingPlayers.length > 0}
        <div class="space-y-1.5">
          <span class="text-xs font-medium text-muted-foreground block"
            >快捷选择已有选手 ID：</span
          >
          <div
            class="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1"
          >
            {#each existingPlayers as p}
              <button
                type="button"
                onclick={() => (idInput = p.id)}
                class="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors cursor-pointer {idInput ===
                p.id
                  ? 'bg-primary text-primary-foreground border-primary font-bold'
                  : 'text-foreground'}"
              >
                {p.display_name}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      {#if userState.id || userState.qqGroup}
        <Button
          variant="destructive"
          size="sm"
          onclick={handleClearId}
          class="w-full sm:w-auto text-xs"
        >
          退出当前身份
        </Button>
      {/if}
      <div class="flex-1"></div>
      <Button
        variant="outline"
        size="sm"
        onclick={() => (openIdDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={handleSaveId}
        disabled={verifying}
        class="w-full sm:w-auto text-xs font-semibold"
      >
        {#if verifying}正在验证...{:else}保存{/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
