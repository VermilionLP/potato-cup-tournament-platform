<script>
  // The user's Liquipedia user name → a link to create the generated page in
  // their own user space (User:<name>/<page>), never the main space. Used in
  // the guide and under the generated code on /tss.
  import { draftTitle, editUrl, keepUser, savedUser } from "#lib/tss-userspace.js";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";

  let { page = "" } = $props();
  let user = $state(savedUser());
  const title = $derived(draftTitle(user, page));
</script>

<div class="flex flex-wrap items-end gap-2">
  <label class="min-w-44 flex-1 space-y-1">
    <span class="text-small font-semibold text-muted-foreground">你的 Liquipedia 用户名</span>
    <input class="field w-full" bind:value={user} onchange={() => keepUser(user)} placeholder="例如 PotatoEditor" autocomplete="off" />
  </label>
  {#if title}
    <a
      href={editUrl(title)}
      target="_blank"
      rel="noopener"
      onclick={() => keepUser(user)}
      class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
    >
      在用户空间创建草稿 <ExternalLinkIcon class="h-3.5 w-3.5" />
    </a>
  {:else}
    <span class="inline-flex h-9 items-center text-small text-muted-foreground">填好用户名后会出现创建草稿的链接</span>
  {/if}
</div>
{#if title}<p class="mt-1 break-all text-small text-muted-foreground">草稿页：<span class="num text-foreground">{title}</span></p>{/if}
