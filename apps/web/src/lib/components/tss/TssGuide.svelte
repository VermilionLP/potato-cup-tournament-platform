<script>
  // The usage guide at the top of /tss: the three steps, what the page
  // information fields do in the generated page, and how to publish it —
  // into the user's own Liquipedia space first, the main space only once
  // checked. Open the first time; folding it is remembered in this browser.
  import TssDraftLink from "./TssDraftLink.svelte";
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

  let { page = "", date = "" } = $props();

  const KEY = "tss-guide-closed";
  let open = $state(true);
  try {
    open = localStorage.getItem(KEY) !== "1";
  } catch {
    /* default: open */
  }
  function toggle() {
    open = !open;
    try {
      localStorage.setItem(KEY, open ? "0" : "1");
    } catch {
      /* not kept */
    }
  }

  const FIELDS = [
    { name: "页面名称", what: "页面顶部显示的标题和信息框（Infobox）里的比赛名称。", how: "留空用 TSS 上的英文名加开赛日期（例如 Realistic Air Weekly 2026-11-15），因为 TSS 的周赛大多同名、没有届数。要改就照 Liquipedia 上同系列比赛的写法。它不决定页面地址。" },
    { name: "系列 series", what: "信息框里的系列名，同一系列的比赛在 Liquipedia 上会归在一起。", how: "同一系列的比赛都填一样的名称；不确定就照搬同系列已有页面的写法。" },
    { name: "Liquipedia 等级", what: "信息框里的 liquipediatier（Tier 1 最高，5 最低），决定比赛出现在哪一级赛事列表里。", how: "按 Liquipedia 的等级标准选；不确定就选「不填」，交给 Liquipedia 的编辑来定。" },
    { name: "等级类型", what: "信息框里的 liquipediatiertype，标出特殊性质的比赛。", how: "周赛填 Weekly，预选赛填 Qualifier，表演赛填 Showmatch；普通比赛留空。" },
  ];
</script>

<section class="rounded-xl border border-border bg-card/40">
  <button type="button" class="flex w-full items-center gap-2 px-4 py-3 text-left cursor-pointer" onclick={toggle} aria-expanded={open}>
    <BookOpenIcon class="h-4 w-4 text-brand-ink" />
    <span class="flex-1 text-sm font-bold">使用说明</span>
    <ChevronDownIcon class="h-4 w-4 text-muted-foreground transition-transform {open ? 'rotate-180' : ''}" />
  </button>

  {#if open}
    <div class="space-y-5 border-t border-border/60 px-4 py-4 text-xs leading-relaxed">
      <div class="space-y-1.5">
        <h3 class="text-label font-bold tracking-wider text-muted-foreground">三步完成</h3>
        <ol class="list-decimal space-y-1 pl-5">
          <li><span class="font-semibold">读取比赛</span>：填 TSS 比赛 ID，或直接粘贴 TSS 比赛页面的地址，点「读取」。</li>
          <li><span class="font-semibold">填写设置</span>：页面信息（见下）、要导出的部分、对阵图范围。默认设置就能用，只改需要改的。</li>
          <li><span class="font-semibold">生成并复制</span>：生成后先看代码上方的黄色提醒，再复制代码，按下面的方法发布到 Liquipedia。</li>
        </ol>
      </div>

      <div class="space-y-1.5">
        <h3 class="text-label font-bold tracking-wider text-muted-foreground">① 页面信息怎么填</h3>
        <div class="divide-y divide-border/60 rounded-lg border border-border/60">
          {#each FIELDS as f (f.name)}
            <div class="grid gap-1 px-3 py-2 sm:grid-cols-[7.5rem_1fr]">
              <span class="font-semibold">{f.name}</span>
              <div>
                <p>{f.what}</p>
                <p class="text-muted-foreground">{f.how}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="space-y-2">
        <h3 class="text-label font-bold tracking-wider text-muted-foreground">发布到 Liquipedia：先放进自己的用户空间</h3>
        <p class="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-amber-800 dark:text-amber-300">
          <TriangleAlertIcon class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>不要直接创建正式页面。正式页面（主空间）所有人都能看到，也要符合 Liquipedia 的收录标准，不符合的会被移走或删除；自动生成的代码也常常需要手动修改。</span>
        </p>
        <ol class="list-decimal space-y-1 pl-5">
          <li>在 Liquipedia 注册并登录账号。</li>
          <li>填你的用户名，点「在用户空间创建草稿」，会打开 User:用户名/比赛名/年/月-日 的编辑页（例如 User:用户名/Realistic Air Weekly/2026/11-15），用开赛日期区分同名的每一届。用户空间是你自己的草稿区，不会出现在赛事列表里。</li>
          <li>把生成的代码粘贴进去，先点「显示预览」，核对对阵、名单、奖金和 TSS 是否一致，按黄色提醒手动修改（比如改过名的选手），再保存。红色链接表示那个页面还不存在，可以去掉链接或留着。</li>
          <li>确认没问题后，先在 Liquipedia 搜索这场比赛是否已经有页面，再把草稿移动到正式页面名（保留「比赛名/年/月-日」的结构，同一系列就会归在一起）；没有移动权限的话，到 Liquipedia 的 Discord 请编辑帮忙。</li>
        </ol>
        <TssDraftLink {page} {date} />
      </div>
    </div>
  {/if}
</section>
