<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { API } from '$lib/api.js';
  import { goto } from '$app/navigation';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import UsersIcon from '@lucide/svelte/icons/users';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

  let tournaments = $state([]);
  let loading = $state(true);

  // Modal creation states
  let showCreateDialog = $state(false);
  let newId = $state('');
  let newName = $state('');
  let newCapacity = $state(16);
  let newThirdPlace = $state(false);
  let creating = $state(false);

  // Divide tournaments
  let activeTournaments = $derived(
    tournaments.filter(t => t.status !== 'completed')
  );
  let historyTournaments = $derived(
    tournaments.filter(t => t.status === 'completed')
  );

  onMount(load);

  async function load() {
    loading = true;
    try {
      tournaments = await API.listTournaments();
    } catch (e) {
      toast.error('加载赛事失败: ' + e.message);
    }
    loading = false;
  }

  async function createTournament() {
    const trimmedId = newId.trim();
    const trimmedName = newName.trim();
    if (!trimmedId || !trimmedName) return toast.error('请输入赛事ID和名称');
    
    // Validate ID format (avoid special chars, allow letters, numbers, hyphens, hashes)
    if (/[\/\?\#\s]/.test(trimmedId)) {
      return toast.error('赛事ID不能包含空格、#、/ 或 ? 等特殊字符');
    }

    if (newCapacity < 2 || newCapacity > 16) {
      return toast.error('选手容量必须在 2 至 16 人之间');
    }

    creating = true;
    try {
      await API.createTournament({ 
        id: trimmedId, 
        name: trimmedName, 
        player_capacity: newCapacity,
        hold_third_place: newThirdPlace ? 1 : 0
      });
      toast.success('赛事创建成功！');
      newId = ''; 
      newName = ''; 
      newCapacity = 16;
      newThirdPlace = false;
      showCreateDialog = false;
      await load();
    } catch (e) { 
      toast.error(e.message); 
    } finally {
      creating = false;
    }
  }

  // Quick download export for historical tournaments
  async function exportTournament(tId, tName) {
    try {
      const details = await API.getTournament(tId);
      const json = JSON.stringify(details, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `suck-tournament-${tId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${tName} 数据导出成功`);
    } catch (e) {
      toast.error('导出失败: ' + e.message);
    }
  }

  function getStatusStyle(status) {
    return {
      registration: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
      voting: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      in_progress: 'bg-amber-500/10 text-primary border-primary/30',
      completed: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
    }[status] || 'bg-zinc-500/10 text-zinc-400';
  }

  function getStatusLabel(status) {
    return {
      registration: '报名中',
      voting: '投票中',
      in_progress: '比赛进行中',
      completed: '已结束'
    }[status] || status;
  }
</script>

<div class="space-y-6">
  <!-- Top Headline and Create trigger -->
  <div class="flex items-center justify-between border-b border-border/60 pb-5">
    <div>
      <h1 class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-primary bg-clip-text text-transparent">
        赛事大厅
      </h1>
      <p class="text-xs text-muted-foreground mt-1">管理并投票单淘汰赛事的首选工具</p>
    </div>
    <Button 
      onclick={() => showCreateDialog = true}
      class="gap-1.5 font-bold hover:scale-[1.02] transition-transform text-xs"
    >
      <PlusIcon class="w-4 h-4" />
      创建赛事
    </Button>
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      <p class="text-sm">正在加载赛事数据...</p>
    </div>
  {:else}
    <Tabs.Root value="active" class="w-full">
      <Tabs.List class="grid grid-cols-2 max-w-[280px] bg-muted/50 border border-border p-1 rounded-xl mb-6">
        <Tabs.Trigger value="active" class="text-xs font-semibold py-1.5 rounded-lg data-[state=active]:bg-card transition-all cursor-pointer">
          当前赛事
        </Tabs.Trigger>
        <Tabs.Trigger value="history" class="text-xs font-semibold py-1.5 rounded-lg data-[state=active]:bg-card transition-all cursor-pointer">
          历史记录
        </Tabs.Trigger>
      </Tabs.List>

      <!-- Active Tournaments Tab -->
      <Tabs.Content value="active" class="focus-visible:outline-none">
        {#if activeTournaments.length === 0}
          <div class="text-center py-16 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col items-center justify-center gap-3">
            <UsersIcon class="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p class="text-sm font-semibold text-foreground">暂无活跃赛事</p>
              <p class="text-xs text-muted-foreground mt-1">点击右上角按钮创建一场新的 StarCraft 锦标赛</p>
            </div>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each activeTournaments as t (t.id)}
              <Card.Root class="group border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-primary/5">
                <Card.Header class="p-5 pb-3">
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <Badge variant="outline" class="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider {getStatusStyle(t.status)}">
                      {getStatusLabel(t.status)}
                    </Badge>
                    <span class="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">
                      ID: {t.id}
                    </span>
                  </div>
                  <Card.Title class="text-lg font-bold group-hover:text-primary transition-colors line-clamp-1">
                    {t.name}
                  </Card.Title>
                  <div class="mt-3.5 h-8 flex items-center">
                    {#if t.scheduled_time}
                      <div class="flex items-center gap-2 text-primary">
                        <ClockIcon class="w-4.5 h-4.5 text-primary shrink-0 animate-pulse" />
                        <span class="text-sm font-extrabold tracking-wide">{t.scheduled_time}</span>
                      </div>
                    {:else if t.status === 'voting'}
                      <div class="flex items-center gap-2 text-purple-400">
                        <ClockIcon class="w-4.5 h-4.5 text-purple-400 shrink-0" />
                        <span class="text-xs font-semibold italic">时间投票火热进行中...</span>
                      </div>
                    {:else}
                      <div class="flex items-center gap-2 text-muted-foreground/60">
                        <ClockIcon class="w-4.5 h-4.5 text-muted-foreground/40 shrink-0" />
                        <span class="text-xs font-medium italic">比赛时间待定...</span>
                      </div>
                    {/if}
                  </div>
                </Card.Header>

                <Card.Content class="p-5 pt-0 pb-4 space-y-4">
                  <!-- Registered players progress -->
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between text-xs font-semibold">
                      <span class="text-muted-foreground flex items-center gap-1">
                        <UsersIcon class="w-3.5 h-3.5" />
                        已报名人数
                      </span>
                      <span class="text-foreground">
                        {t.player_count || 0} / {t.player_capacity}
                      </span>
                    </div>
                    <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        class="h-full bg-gradient-to-r from-amber-500 to-primary rounded-full transition-all duration-500"
                        style="width: {Math.min(100, ((t.player_count || 0) / t.player_capacity) * 100)}%"
                      ></div>
                    </div>
                  </div>

                  <!-- Date info -->
                  <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarIcon class="w-3.5 h-3.5 text-muted-foreground/60" />
                    <span>创建于 {new Date(t.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </Card.Content>

                <Card.Footer class="p-5 pt-0 border-t border-border/40 bg-muted/10 group-hover:bg-muted/30 transition-colors flex items-center justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onclick={() => goto(`/tournament/${encodeURIComponent(t.id)}`)}
                    class="text-xs font-bold gap-1 text-primary hover:text-primary-foreground hover:bg-primary transition-all p-2.5 rounded-lg cursor-pointer"
                  >
                    进入赛事
                    <ArrowRightIcon class="w-3.5 h-3.5" />
                  </Button>
                </Card.Footer>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- History/Completed Tournaments Tab -->
      <Tabs.Content value="history" class="focus-visible:outline-none">
        {#if historyTournaments.length === 0}
          <div class="text-center py-16 border border-dashed border-border rounded-2xl bg-card/20 flex flex-col items-center justify-center gap-3">
            <CalendarIcon class="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p class="text-sm font-semibold text-foreground">暂无历史比赛记录</p>
              <p class="text-xs text-muted-foreground mt-1">当有赛事完结并更改状态为已结束时，会移至此卡片区域</p>
            </div>
          </div>
        {:else}
          <div class="space-y-3">
            {#each historyTournaments as t (t.id)}
              <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-border bg-card/40 hover:bg-card/75 transition-all gap-4">
                <div class="space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <button type="button" class="font-bold text-foreground hover:text-primary transition-colors cursor-pointer text-sm sm:text-base text-left bg-transparent border-none p-0" onclick={() => goto(`/tournament/${encodeURIComponent(t.id)}`)}>
                      {t.name}
                    </button>
                    <Badge variant="outline" class="text-[9px] px-1.5 py-0 bg-zinc-500/10 text-zinc-400 border-zinc-500/20">
                      已完结
                    </Badge>
                  </div>
                  <div class="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                    <span>ID: {t.id}</span>
                    <span>•</span>
                    <span>选手: {t.player_count || 0}人</span>
                    {#if t.scheduled_time}
                      <span>•</span>
                      <span class="text-primary font-bold">时间: {t.scheduled_time}</span>
                    {/if}
                    <span>•</span>
                    <span>创建日期: {new Date(t.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onclick={() => exportTournament(t.id, t.name)}
                    class="text-xs font-semibold gap-1 px-3 py-1.5 h-8 w-full sm:w-auto hover:bg-secondary cursor-pointer"
                  >
                    <DownloadIcon class="w-3.5 h-3.5" />
                    导出 JSON
                  </Button>
                  <Button 
                    size="sm" 
                    onclick={() => goto(`/tournament/${encodeURIComponent(t.id)}`)}
                    class="text-xs font-bold h-8 px-3.5 py-1.5 w-full sm:w-auto cursor-pointer"
                  >
                    查看 Bracket
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </Tabs.Content>
    </Tabs.Root>
  {/if}
</div>

<!-- Create Tournament Dialog -->
<Dialog.Root bind:open={showCreateDialog}>
  <Dialog.Content class="max-w-[420px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground">
        创建新赛事
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        输入基本信息以初始化新单淘 StarCraft 赛事。
      </Dialog.Description>
    </Dialog.Header>
    <div class="space-y-4 py-3">
      <div class="space-y-1.5">
        <label for="create-id-input" class="text-xs font-bold text-muted-foreground">赛事 ID (不可包含特殊字符或空格)</label>
        <Input 
          id="create-id-input"
          bind:value={newId} 
          placeholder="如: SUCK50" 
          class="bg-background border-border text-foreground"
        />
        <p class="text-[10px] text-muted-foreground/60">ID 会拼在网址中，建议纯字母/数字，如 SUCK50。</p>
      </div>

      <div class="space-y-1.5">
        <label for="create-name-input" class="text-xs font-bold text-muted-foreground">赛事名称</label>
        <Input 
          id="create-name-input"
          bind:value={newName} 
          placeholder="如: StarCraft Ultra Chicken King #50" 
          class="bg-background border-border text-foreground"
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label for="create-capacity-input" class="text-xs font-bold text-muted-foreground">选手上限</label>
          <Input 
            id="create-capacity-input"
            type="number" 
            bind:value={newCapacity} 
            min="2" 
            max="16" 
            class="bg-background border-border text-foreground"
          />
        </div>
        <div class="flex flex-col justify-end pb-1.5">
          <label class="flex items-center gap-2 text-xs font-bold text-muted-foreground select-none cursor-pointer">
            <input 
              type="checkbox" 
              bind:checked={newThirdPlace} 
              class="w-4 h-4 rounded bg-background border-border accent-primary cursor-pointer" 
            />
            决出第三名 (季军)
          </label>
        </div>
      </div>
    </div>
    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button variant="outline" size="sm" onclick={() => showCreateDialog = false} disabled={creating} class="w-full sm:w-auto text-xs">
        取消
      </Button>
      <Button size="sm" onclick={createTournament} disabled={creating} class="w-full sm:w-auto text-xs font-bold">
        {#if creating}创建中...{:else}创建赛事{/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
