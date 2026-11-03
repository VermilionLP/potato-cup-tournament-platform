<script>
  // Shows askConfirm / askText requests ($lib/confirm.svelte.js) as an
  // in-page dialog. Mounted once in the root layout.
  import { onMount } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { confirmRequest as req, finishConfirm, setConfirmHost } from "$lib/confirm.svelte.js";

  onMount(() => {
    setConfirmHost(true);
    return () => setConfirmHost(false);
  });

  const cancel = () => finishConfirm(req.input ? null : false);
  const accept = () => finishConfirm(req.input ? req.value : true);
</script>

<Dialog.Root open={req.open} onOpenChange={(open) => !open && req.open && cancel()}>
  <Dialog.Content class="sm:max-w-[440px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-sm font-bold">{req.danger ? "请确认" : "确认"}</Dialog.Title>
      <Dialog.Description class="whitespace-pre-line text-xs leading-relaxed text-foreground/90">{req.message}</Dialog.Description>
    </Dialog.Header>
    {#if req.input}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        autofocus
        bind:value={req.value}
        onkeydown={(e) => e.key === "Enter" && accept()}
        class="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
      />
    {/if}
    <Dialog.Footer class="flex gap-2">
      <Button variant="outline" size="sm" onclick={cancel} class="text-xs">取消</Button>
      <Button variant={req.danger ? "destructive" : "default"} size="sm" onclick={accept} class="text-xs font-bold">{req.confirmText}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
