<script>
  // Device key of the signed-in player ID: copy it to use the ID on another
  // device, or import the key from the device the ID is bound to.
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { copyText } from "$lib/clipboard.js";
  import { userState } from "$lib/user.svelte.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import KeyRoundIcon from "@lucide/svelte/icons/key-round";

  let keyImport = $state("");
  let busy = $state(false);
  let showKey = $state(false);

  async function importKey() {
    const key = keyImport.trim();
    if (!key || !userState.id) return;
    busy = true;
    try {
      await API.claimPlayerKey(userState.id, key);
      userState.setKey(userState.id, key);
      keyImport = "";
      toast.success("设备密钥已导入，这台设备可以正常使用了");
    } catch (e) {
      toast.error(e.status === 409 ? "密钥不正确" : "导入失败: " + e.message);
    } finally {
      busy = false;
    }
  }

  async function copyKey() {
    const ok = await copyText(userState.key);
    if (ok) toast.success("设备密钥已复制，请妥善保管，不要发给别人");
    else toast.error("复制失败，请手动选中后复制");
  }
</script>

<div class="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
  <div class="flex items-center gap-1.5 text-xs font-bold text-foreground">
    <KeyRoundIcon class="w-3.5 h-3.5" />
    设备密钥
  </div>
  {#if userState.key}
    <p class="text-[11px] text-muted-foreground">
      这个 ID 已绑定到本设备。换设备或浏览器时，把密钥复制过去导入即可；不要发给别人，拿到密钥的人可以用你的 ID 报名和修改资料。
    </p>
    <div class="flex gap-2">
      <input
        readonly
        value={showKey ? userState.key : "•".repeat(16)}
        aria-label="设备密钥"
        class="flex-1 min-w-0 h-8 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground"
        onfocus={(e) => showKey && e.currentTarget.select()}
      />
      <Button variant="outline" size="sm" class="h-8 text-xs" onclick={() => (showKey = !showKey)}>{showKey ? "隐藏" : "显示"}</Button>
      <Button variant="outline" size="sm" class="h-8 text-xs" onclick={copyKey}>复制</Button>
    </div>
  {:else}
    <p class="text-[11px] {userState.keyConflict ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}">
      {userState.keyConflict
        ? "这个 ID 已绑定其他设备。请在那台设备的「个人资料」里复制设备密钥，粘贴到下面导入；找不到原设备请联系管理员重置。"
        : "本设备还没有这个 ID 的密钥。如果你在别的设备上用过这个 ID，请把那边的密钥导入。"}
    </p>
    <div class="flex gap-2">
      <Input bind:value={keyImport} placeholder="粘贴设备密钥" class="h-8 flex-1 font-mono text-[11px]" />
      <Button size="sm" class="h-8 text-xs" disabled={busy || !keyImport.trim()} onclick={importKey}>导入</Button>
    </div>
  {/if}
</div>
