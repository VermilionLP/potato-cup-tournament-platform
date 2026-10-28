<script>
  // Admin sign-in: the ADMIN_TOKEN is kept in this tab only
  // (userState.adminToken, sessionStorage).
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { userState } from "$lib/user.svelte.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

  let { open = $bindable(false) } = $props();

  let tokenInput = $state("");
  let busy = $state(false);

  $effect(() => {
    if (open) tokenInput = "";
  });

  async function login() {
    const token = tokenInput.trim();
    if (!token) {
      toast.error("请输入管理员令牌");
      return;
    }
    busy = true;
    try {
      userState.setAdminToken(token);
      await API.verifyAdmin();
      toast.success("管理员登录成功");
      open = false;
      tokenInput = "";
    } catch (err) {
      userState.setAdminToken("");
      if (err.status === 401) toast.error("管理员登录失败: 令牌不正确");
      else if (err.status === 503) toast.error("管理员登录失败: 服务器未配置 ADMIN_TOKEN");
      else toast.error("管理员登录失败: " + err.message);
    } finally {
      busy = false;
    }
  }

  function logout() {
    userState.setAdminToken("");
    tokenInput = "";
    open = false;
    toast.success("已退出管理员");
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-85 sm:max-w-95 bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
        <ShieldCheckIcon class="w-5 h-5 text-primary" />
        管理员权限
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {#if userState.adminToken}
          当前标签页已保存管理员令牌，可执行删除、批量导入、重解析等破坏性操作。
        {:else}
          输入服务器 .env 中配置的 ADMIN_TOKEN，以解锁删除、批量导入、重解析等破坏性操作。令牌只保存在本标签页。
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if !userState.adminToken}
      <div class="space-y-1.5 py-1">
        <label for="admin-token-input" class="text-xs font-bold text-muted-foreground">管理员令牌</label>
        <Input
          id="admin-token-input"
          type="password"
          bind:value={tokenInput}
          placeholder="ADMIN_TOKEN"
          autocomplete="off"
          class="text-xs h-8 bg-background border-border text-foreground"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              login();
            }
          }}
        />
        <p class="text-[10px] text-muted-foreground/60">
          令牌由部署者在 <code>apps/api/.env</code> 的 ADMIN_TOKEN 中设置。
        </p>
      </div>
    {/if}

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      {#if userState.adminToken}
        <Button variant="destructive" size="sm" onclick={logout} class="w-full sm:w-auto text-xs">退出管理员</Button>
      {/if}
      <div class="flex-1"></div>
      <Button variant="outline" size="sm" onclick={() => (open = false)} class="w-full sm:w-auto text-xs">关闭</Button>
      {#if !userState.adminToken}
        <Button size="sm" onclick={login} disabled={busy} class="w-full sm:w-auto text-xs font-semibold">
          {#if busy}正在验证...{:else}登录{/if}
        </Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
