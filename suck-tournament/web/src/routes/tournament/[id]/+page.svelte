<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { API } from '$lib/api.js';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { userState } from '$lib/user.svelte.js';
  import { Calendar } from '$lib/components/ui/calendar/index.js';
  import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { CalendarDate } from '@internationalized/date';
  
  import TrophyIcon from '@lucide/svelte/icons/trophy';
  import UserRoundIcon from '@lucide/svelte/icons/user';
  import UsersIcon from '@lucide/svelte/icons/users';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import CheckIcon from '@lucide/svelte/icons/check';
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import PlayIcon from '@lucide/svelte/icons/play';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import TrashIcon from '@lucide/svelte/icons/trash-2';
  import CrownIcon from '@lucide/svelte/icons/crown';
  import DownloadIcon from '@lucide/svelte/icons/download';

  let tid = $derived(page.params.id);
  let tournament = $state(null);
  let loading = $state(true);

  // Registration states
  let regInput = $state('');
  let seedOrder = $state([]);

  // Time voting states
  const today = new Date();
  let voteDate = $state(new CalendarDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  let voteTime = $state('20:00');

  const timeSlots = [
    "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
    "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"
  ];
  
  // Modal for match results
  let showMatchDialog = $state(false);
  let selectedMatch = $state(null);
  let resultScore1 = $state(0);
  let resultScore2 = $state(0);
  let submittingResult = $state(false);

  // Modal for selecting final time
  let showStatusTimeDialog = $state(false);
  let selectedFinalTime = $state('');

  // Compute votes sorted by count
  let voteOptions = $derived.by(() => {
    if (!tournament?.votes) return [];
    const map = {};
    for (const v of tournament.votes) {
      const t = v.proposed_time;
      if (!map[t]) map[t] = { proposed_time: t, count: 0, voters: [] };
      map[t].count++;
      map[t].voters.push(v);
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  });

  // Derived properties for stages
  let isRegistered = $derived(
    tournament?.players?.some(p => p.id === userState.id)
  );

  onMount(load);

  async function load() {
    loading = true;
    try {
      tournament = await API.getTournament(tid);
      initializeSeedOrder();
      
      // Auto-generate/refresh bracket preview on page load in registration phase
      if (tournament.status === 'registration' && tournament.players?.length >= 2) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      }
    } catch (e) {
      toast.error('加载赛事详情失败: ' + e.message);
    }
    loading = false;
  }

  function initializeSeedOrder() {
    if (!tournament?.players) return;
    const sortedPlayers = [...tournament.players].sort((a, b) => {
      const aSeed = a.seed !== null && a.seed !== undefined ? a.seed : 999999;
      const bSeed = b.seed !== null && b.seed !== undefined ? b.seed : 999999;
      if (aSeed !== bSeed) return aSeed - bSeed;
      return new Date(a.registered_at) - new Date(b.registered_at);
    });
    seedOrder = sortedPlayers.map(p => p.id);
  }

  async function changeStatus(status) {
    try {
      tournament = await API.updateStatus(tid, status);
      toast.success(`赛事状态已切换至: ${statusLabel(status)}`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function confirmEndVoting() {
    if (!selectedFinalTime.trim()) {
      return toast.error('请选择或输入确定的比赛时间');
    }
    try {
      tournament = await API.updateStatus(tid, 'registration', selectedFinalTime.trim());
      toast.success(`赛事已开启报名，比赛时间已定为: ${selectedFinalTime}`);
      showStatusTimeDialog = false;
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Registration
  async function doRegister() {
    const id = regInput.trim() || userState.id;
    if (!id) return toast.error('请输入选手 ID');
    try {
      const players = await API.register(tid, id);
      tournament = { ...tournament, players };
      toast.success(`选手 ${id} 报名成功`);
      regInput = '';
      await load();
      
      // Auto-update bracket preview
      if (tournament.players?.length >= 2) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      }
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function doUnregister(pid) {
    try {
      await API.unregister(tid, pid);
      toast.success(`选手 ${pid} 已取消报名`);
      await load();
      
      // Auto-update bracket preview
      if (tournament.players?.length >= 2) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      } else {
        tournament = { ...tournament, matches: [] };
      }
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Seeding setup
  async function moveSeed(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= seedOrder.length) return;
    [seedOrder[idx], seedOrder[target]] = [seedOrder[target], seedOrder[idx]];
    seedOrder = [...seedOrder];

    try {
      const players = await API.setSeeds(tid, seedOrder);
      tournament = { ...tournament, players };
      
      if (tournament.players?.length >= 2) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      }
    } catch (e) {
      toast.error('保存种子排序失败: ' + e.message);
    }
  }

  // Bracket generation
  async function doGenerateBracket() {
    try {
      const matches = await API.generateBracket(tid);
      tournament = { ...tournament, matches };
      toast.success('单淘汰 Bracket 已成功生成！');
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Match report modal triggers
  // Match report modal triggers
  function openMatchReport(match) {
    selectedMatch = match;
    showMatchDialog = true;
  }

  async function selectGameWinner(winnerId) {
    if (!selectedMatch) return;
    submittingResult = true;

    const isPlayer1 = winnerId === selectedMatch.player1_id;
    const score1 = isPlayer1 ? 1 : 0;
    const score2 = isPlayer1 ? 0 : 1;

    try {
      await API.submitResult(tid, selectedMatch.id, score1, score2);
      const advancerId = isPlayer1 ? selectedMatch.player2_id : selectedMatch.player1_id;
      toast.success(`已判定游戏获胜者为 ${playerName(winnerId)}，败者 ${playerName(advancerId)} 晋级`);
      showMatchDialog = false;
      selectedMatch = null;
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }

  async function recordWalkover(winnerId) {
    if (!selectedMatch) return;
    submittingResult = true;
    try {
      await API.submitWalkover(tid, selectedMatch.id, winnerId);
      toast.success('已记录弃权并晋级胜者');
      showMatchDialog = false;
      selectedMatch = null;
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      submittingResult = false;
    }
  }

  // Time voting
  async function doVote() {
    if (!userState.id) return toast.error('请先在顶栏设置你的游戏 ID');
    if (!voteDate) return toast.error('请选择日期');
    const timeStr = voteTime || '20:00';
    const dateStr = voteDate.toString();
    const iso = `${dateStr}T${timeStr}:00`;
    try {
      await API.submitVote(tid, userState.id, iso);
      toast.success('时间选项已添加并投票');
      voteDate = undefined;
      voteTime = '20:00';
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function toggleVoteOption(optionTime, voted) {
    if (!userState.id) return toast.error('请先在顶栏设置你的游戏 ID');
    try {
      if (voted) {
        await API.removeVote(tid, userState.id, optionTime);
        toast.success('已取消该时间的投票');
      } else {
        await API.submitVote(tid, userState.id, optionTime);
        toast.success('已投赞成票');
      }
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Helpers
  function playerName(pid, match = null) {
    if (!pid) {
      if (match) {
        const maxRound = Math.max(...(tournament?.matches?.map(m => m.round) || [1]));
        if (match.round === maxRound) {
          return 'BYE (轮空)';
        }
      }
      return 'TBD';
    }
    const p = tournament?.players?.find(p => p.id === pid);
    return p?.display_name || pid;
  }

  function rounds() {
    if (!tournament?.matches?.length) return [];
    const map = {};
    tournament.matches.forEach(m => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    return Object.entries(map)
      .map(([round, ms]) => ({ round: parseInt(round), matches: ms.sort((a, b) => a.position - b.position) }))
      .sort((a, b) => b.round - a.round);
  }

  function roundLabel(roundNum, totalRounds) {
    if (roundNum === 1) return '总决赛';
    if (roundNum === 2) return '半决赛';
    if (roundNum === 3 && totalRounds >= 3) return '四分之一决赛';
    return `第 ${roundNum} 轮`;
  }

  function statusLabel(s) {
    return { registration: '报名中', voting: '时间投票', in_progress: '比赛进行中', completed: '已结束' }[s] || s;
  }

  // Find overall champion and runner-up
  let podium = $derived.by(() => {
    if (!tournament?.matches?.length || tournament.status !== 'completed') return null;
    const finalMatch = tournament.matches.find(m => m.round === 1 && m.position === 1);
    if (!finalMatch || finalMatch.status !== 'completed') return null;
    const champion = finalMatch.winner_id;
    const runnerUp = champion === finalMatch.player1_id ? finalMatch.player2_id : finalMatch.player1_id;
    return { champion, runnerUp };
  });

  // Direct download export
  function triggerJsonDownload() {
    if (!tournament) return;
    const json = JSON.stringify(tournament, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suck-tournament-${tournament.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('赛事 JSON 导出成功');
  }
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
    <div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
    <p class="text-sm">正在加载赛事详情...</p>
  </div>
{:else if !tournament}
  <div class="text-center py-16 border border-border bg-card/30 rounded-2xl max-w-xl mx-auto space-y-4">
    <TrophyIcon class="w-12 h-12 text-muted-foreground mx-auto" />
    <div>
      <h2 class="text-lg font-bold text-foreground">赛事不存在</h2>
      <p class="text-xs text-muted-foreground mt-1">您访问的赛事 ID 在数据库中未找到。</p>
    </div>
    <Button size="sm" onclick={() => goto('/')} class="gap-1 text-xs">
      <ArrowLeftIcon class="w-3.5 h-3.5" /> 返回首页
    </Button>
  </div>
{:else}
  {#snippet bracketView()}
    <Card.Root class="border-border bg-card/40">
      <Card.Header class="p-6 flex flex-row items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <Card.Title class="text-base font-bold flex items-center gap-2">
            <ShieldCheckIcon class="w-5 h-5 text-amber-500" />
            {#if tournament.status === 'registration'}
              对阵图预览 (Bracket Preview)
            {:else}
              赛事对阵图 (Single Elimination Bracket)
            {/if}
          </Card.Title>
          <Card.Description class="text-xs">
            {#if tournament.status === 'registration'}
              基于当前报名的选手和种子排名实时生成的对阵预览（调整上方种子排序会自动刷新）。
            {:else}
              {#if tournament.status === 'in_progress'}
                点击包含两位选手的待赛卡片可以填报比分或进行弃权处理。
              {:else}
                赛事已结束，此对阵图当前为只读。
              {/if}
            {/if}
          </Card.Description>
        </div>
      </Card.Header>
      <Card.Content class="p-6 overflow-x-auto">
        {#if tournament.matches?.length > 0}
          <!-- Round flex container -->
          <div class="flex gap-8 justify-start py-4">
            {#each rounds() as r (r.round)}
              <div class="flex-shrink-0 w-56 flex flex-col justify-around gap-6">
                <div class="text-xs text-muted-foreground font-bold text-center border-b border-border/40 pb-1.5 mb-2 tracking-wider">
                  {roundLabel(r.round, rounds().length)}
                </div>
                {#each r.matches as m (m.id)}
                  {@const userInMatch = userState.id && (m.player1_id === userState.id || m.player2_id === userState.id)}
                  {@const bothPlayersReady = m.player1_id && m.player2_id}
                  {@const isPending = m.status === 'pending'}
                  {@const isPlayable = bothPlayersReady && isPending && tournament.status === 'in_progress'}
                  {@const isBye = m.status === 'completed' && m.winner_id && (!m.player1_id || !m.player2_id)}

                  {#if isBye}
                    <!-- Bye match: minimal greyed-out card -->
                    <div class="w-full p-2.5 rounded-xl border border-border/30 bg-muted/10 text-xs opacity-40">
                      <div class="flex items-center justify-between text-[9px] text-muted-foreground font-mono mb-1">
                        <span>场次 {m.position}</span>
                        <span class="italic">轮空</span>
                      </div>
                      <div class="flex items-center gap-1.5 text-muted-foreground">
                        <span class="font-medium">{playerName(m.winner_id)}</span>
                        <span class="text-[9px] italic">→ 自动晋级</span>
                      </div>
                    </div>
                  {:else}
                    <!-- Normal match card -->
                    <button 
                      disabled={!bothPlayersReady || !isPending || tournament.status !== 'in_progress'}
                      onclick={() => openMatchReport(m)}
                      class="w-full text-left p-3.5 rounded-xl border bg-background/50 transition-all flex flex-col gap-2 group/match shadow-sm text-xs cursor-default
                      {isPlayable ? 'hover:border-primary hover:bg-background/80 hover:shadow-md cursor-pointer' : ''}
                      {isPlayable
                        ? (userInMatch 
                          ? 'border-primary ring-1 ring-primary/30 shadow shadow-primary/10 bg-primary/5' 
                          : 'border-primary/45 shadow-sm shadow-primary/5')
                        : 'border-border'
                      }
                      "
                    >
                      <!-- Header slot indicators -->
                      <div class="flex items-center justify-between text-[9px] text-muted-foreground w-full font-mono">
                        <span>场次 {m.position}</span>
                        {#if userInMatch && isPending}
                          <span class="text-primary font-bold animate-pulse">我的比赛</span>
                        {/if}
                        {#if m.status === 'completed'}
                          <span class="text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">完赛</span>
                        {:else if m.status === 'walkover'}
                          <span class="text-amber-500 font-bold bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">弃权</span>
                        {/if}
                      </div>

                      <!-- Player 1 row -->
                      <div class="flex items-center justify-between w-full py-0.5">
                        <span class="truncate font-semibold flex items-center gap-1.5
                          {m.winner_id === m.player1_id ? 'text-primary font-extrabold' : 'text-foreground/80'}
                          {!m.player1_id ? 'text-muted-foreground/50 italic font-light' : ''}
                        ">
                          {#if m.winner_id === m.player1_id && m.winner_id}
                            <CrownIcon class="w-3.5 h-3.5 text-primary shrink-0" />
                          {/if}
                          {playerName(m.player1_id, m)}
                        </span>
                        {#if m.status !== 'pending'}
                          <span class="font-mono font-bold {m.winner_id === m.player1_id ? 'text-primary' : 'text-muted-foreground'}">{m.score1}</span>
                        {/if}
                      </div>

                      <!-- VS separator / Line -->
                      <div class="h-[1px] bg-border/50 w-full"></div>

                      <!-- Player 2 row -->
                      <div class="flex items-center justify-between w-full py-0.5">
                        <span class="truncate font-semibold flex items-center gap-1.5
                          {m.winner_id === m.player2_id ? 'text-primary font-extrabold' : 'text-foreground/80'}
                          {!m.player2_id ? 'text-muted-foreground/50 italic font-light' : ''}
                        ">
                          {#if m.winner_id === m.player2_id && m.winner_id}
                            <CrownIcon class="w-3.5 h-3.5 text-primary shrink-0" />
                          {/if}
                          {playerName(m.player2_id, m)}
                        </span>
                        {#if m.status !== 'pending'}
                          <span class="font-mono font-bold {m.winner_id === m.player2_id ? 'text-primary' : 'text-muted-foreground'}">{m.score2}</span>
                        {/if}
                      </div>

                      <!-- Prompt for pending action -->
                      {#if bothPlayersReady && isPending && tournament.status === 'in_progress'}
                        <div class="text-[9.5px] text-muted-foreground/80 text-center w-full mt-1 border-t border-border/40 pt-1.5 group-hover/match:text-primary transition-colors">
                          点击登记结果
                        </div>
                      {/if}
                    </button>
                  {/if}
                {/each}
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-12 text-muted-foreground">
            {#if tournament.status === 'registration'}
              <p class="text-xs italic">暂无对阵预览，调整上面种子顺序后，点击“生成对阵预览”。</p>
            {:else}
              <p class="text-xs italic">对阵图尚未生成。</p>
            {/if}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/snippet}

  <div class="space-y-6">
    <!-- Breadcrumb & Status Panel -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
      <div class="space-y-1">
        <button onclick={() => goto('/')} class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mb-1.5 cursor-pointer">
          <ArrowLeftIcon class="w-3 h-3" /> 返回大厅
        </button>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {tournament.name}
          </h1>
          <Badge variant="outline" class="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20">
            {statusLabel(tournament.status)}
          </Badge>
        </div>
        <p class="text-xs text-muted-foreground font-medium">ID: {tournament.id} • 选手容量: {tournament.player_count || 0}/{tournament.player_capacity} 人 • 创建于 {new Date(tournament.created_at).toLocaleDateString('zh-CN')}</p>
        {#if tournament.scheduled_time}
          <div class="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-bold shadow-md shadow-primary/5">
            <ClockIcon class="w-4 h-4 text-primary shrink-0 animate-pulse" />
            <span>比赛时间: {tournament.scheduled_time}</span>
          </div>
        {/if}
      </div>

      <!-- Admin Status Stepper Controls -->
      <div class="flex items-center gap-2 flex-wrap">
        {#if tournament.status === 'voting'}
          <Button size="sm" onclick={() => {
            if (voteOptions.length > 0) {
              selectedFinalTime = voteOptions[0].proposed_time.replace('T', ' ');
            } else {
              selectedFinalTime = '';
            }
            showStatusTimeDialog = true;
          }} class="text-xs font-semibold cursor-pointer">
            结束投票并开启报名
          </Button>
        {:else if tournament.status === 'registration'}
          <Button variant="outline" size="sm" onclick={() => changeStatus('voting')} class="text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500 hover:text-white cursor-pointer">
            返回时间投票
          </Button>
          <Button size="sm" onclick={() => changeStatus('in_progress')} class="text-xs font-semibold cursor-pointer">
            结束报名并开赛
          </Button>
        {:else if tournament.status === 'in_progress'}
          <Button variant="outline" size="sm" onclick={() => changeStatus('registration')} class="text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500 hover:text-white cursor-pointer">
            返回选手报名
          </Button>
          <Button size="sm" onclick={() => changeStatus('completed')} class="text-xs font-bold cursor-pointer">
            结束赛事
          </Button>
        {:else if tournament.status === 'completed'}
          <Button variant="outline" size="sm" onclick={() => changeStatus('in_progress')} class="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-black cursor-pointer">
            重新打开比赛
          </Button>
        {/if}
      </div>
    </div>

    <!-- Phase Stepper Graphic -->
    <div class="grid grid-cols-4 gap-2 border border-border bg-card/25 p-3 rounded-2xl text-center text-xs">
      <div class="space-y-1.5 {tournament.status === 'voting' ? 'text-purple-400 font-bold' : 'text-muted-foreground'}">
        <div class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status === 'voting' ? 'bg-purple-500 text-white border-purple-500' : 'bg-muted/40 border-border'}">1</div>
        <div>时间投票</div>
      </div>
      <div class="space-y-1.5 {tournament.status === 'registration' ? 'text-primary font-bold' : 'text-muted-foreground'}">
        <div class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status === 'registration' ? 'bg-primary text-black border-primary' : 'bg-muted/40 border-border'}">2</div>
        <div>选手报名</div>
      </div>
      <div class="space-y-1.5 {tournament.status === 'in_progress' ? 'text-amber-500 font-bold' : 'text-muted-foreground'}">
        <div class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status === 'in_progress' ? 'bg-amber-500 text-black border-amber-500' : 'bg-muted/40 border-border'}">3</div>
        <div>淘汰赛中</div>
      </div>
      <div class="space-y-1.5 {tournament.status === 'completed' ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}">
        <div class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status === 'completed' ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-muted/40 border-border'}">4</div>
        <div>赛事结束</div>
      </div>
    </div>

    <!-- Active Panel based on current stage -->
    {#if tournament.status === 'registration'}
      <!-- STAGE 1: REGISTRATION -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Join / Seeding Panel -->
        <div class="lg:col-span-2 space-y-6">
          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-6">
              <Card.Title class="text-base font-bold flex items-center gap-2">
                <UsersIcon class="w-5 h-5 text-primary" />
                选手报名管理
              </Card.Title>
              <Card.Description class="text-xs">
                当报名人数达到设定或充足时，组织者可进行种子排序并生成单淘汰 Bracket。
              </Card.Description>
            </Card.Header>
            <Card.Content class="p-6 pt-0 space-y-4">
              <!-- One-Click Register for Current User -->
              <div class="p-4 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                {#if userState.id}
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xs font-bold text-white uppercase">
                      {userState.id.slice(0, 2)}
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">当前浏览器 Gamer ID</p>
                      <h4 class="font-bold text-foreground text-sm">{userState.id}</h4>
                    </div>
                  </div>
                  {#if isRegistered}
                    <div class="flex items-center gap-2">
                      <Badge class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs gap-1 py-1">
                        <CheckIcon class="w-3.5 h-3.5" /> 已在选手中
                      </Badge>
                      <Button variant="outline" size="sm" onclick={() => doUnregister(userState.id)} class="text-xs text-red-400 hover:text-red-300 border-red-500/20 hover:bg-red-500/10 h-8 cursor-pointer">
                        取消报名
                      </Button>
                    </div>
                  {:else}
                    <Button onclick={doRegister} size="sm" class="font-bold text-xs h-8 cursor-pointer">
                      一键快速报名
                    </Button>
                  {/if}
                {:else}
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      ?
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">未关联 Gamer ID</p>
                      <p class="text-[10px] text-muted-foreground/80 mt-0.5">请先关联或在右侧输入框注册</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onclick={() => { document.querySelector('button[onclick="handleOpenDialog()"]')?.click(); }} class="text-xs h-8 cursor-pointer border-primary/30 text-primary animate-pulse">
                    去关联游戏ID
                  </Button>
                {/if}
              </div>

              <!-- Admin/Organizer Manual registration -->
              <div class="space-y-1.5">
                <label for="reg-id-input" class="text-xs font-bold text-muted-foreground">管理员手动为群友报名</label>
                <div class="flex gap-2">
                  <Input 
                    id="reg-id-input"
                    bind:value={regInput} 
                    placeholder="输入群友 ID，如 ZergKing" 
                    class="bg-background border-border text-foreground flex-1 h-9 text-xs"
                  />
                  <Button variant="secondary" size="sm" onclick={doRegister} class="text-xs h-9 cursor-pointer">
                    添加选手
                  </Button>
                </div>
              </div>
            </Card.Content>
          </Card.Root>

          <!-- Seeding Panel -->
          {#if (tournament.players?.length || 0) >= 2}
            <Card.Root class="border-border bg-card/40">
              <Card.Header class="p-6">
                <div>
                  <Card.Title class="text-base font-bold flex items-center gap-2">
                    <CrownIcon class="w-5 h-5 text-amber-500" />
                    种子排序配置
                  </Card.Title>
                  <Card.Description class="text-xs">
                    设定首轮对阵种子（高种子选手排在前面，空出的轮次会优先轮空高种子）。调整顺序后将自动刷新预览。
                  </Card.Description>
                </div>
              </Card.Header>
              <Card.Content class="p-6 pt-0 space-y-4">
                <div class="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {#each seedOrder as pid, idx}
                    <div class="flex items-center gap-3 bg-background/50 border border-border rounded-xl px-4 py-2 text-xs">
                      <span class="text-amber-500 font-bold w-6">#{idx + 1}</span>
                      <span class="flex-1 font-semibold">{playerName(pid)}</span>
                      <div class="flex items-center gap-1.5">
                        <Button 
                          variant="ghost" 
                          size="icon-xs" 
                          onclick={() => moveSeed(idx, -1)} 
                          disabled={idx === 0} 
                          class="h-6 w-6 cursor-pointer"
                        >
                          &uarr;
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon-xs" 
                          onclick={() => moveSeed(idx, 1)} 
                          disabled={idx === seedOrder.length - 1} 
                          class="h-6 w-6 cursor-pointer"
                        >
                          &darr;
                        </Button>
                      </div>
                    </div>
                  {/each}
                </div>
              </Card.Content>
            </Card.Root>
          {/if}
        </div>

        <!-- Sidebar Player List -->
        <div class="space-y-6">
          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-5 pb-3">
              <Card.Title class="text-sm font-bold flex items-center justify-between">
                <span>选手名册</span>
                <Badge variant="outline" class="text-[10px] bg-primary/10 text-primary border-primary/20">
                  {tournament.players?.length || 0} / {tournament.player_capacity} 人
                </Badge>
              </Card.Title>
            </Card.Header>
            <Card.Content class="p-5 pt-0">
              <div class="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                {#each tournament.players || [] as p}
                  <div class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-background/40 border border-border/60 hover:bg-background/80 transition-colors">
                    <span class="text-xs font-medium flex items-center gap-1.5">
                      <div class="w-2.5 h-2.5 rounded-full bg-primary/30 border border-primary/50"></div>
                      {p.display_name}
                      {#if p.seed}
                        <span class="text-[10px] text-amber-500 font-bold">#{p.seed}</span>
                      {/if}
                    </span>
                    <button 
                      onclick={() => doUnregister(p.id)} 
                      class="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                      title="注销此选手"
                    >
                      <TrashIcon class="w-3.5 h-3.5" />
                    </button>
                  </div>
                {/each}
                {#if (tournament.players || []).length === 0}
                  <p class="text-xs text-muted-foreground/60 italic text-center py-6">暂无选手报名</p>
                {/if}
              </div>
            </Card.Content>
          </Card.Root>
        </div>
      </div>

      <!-- Bracket Preview in Registration stage -->
      {#if (tournament.players?.length || 0) >= 2}
        <div class="mt-6">
          {@render bracketView()}
        </div>
      {/if}
    {:else if tournament.status === 'voting'}
      <!-- STAGE 2: VOTING -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Voting Slot List -->
        <div class="lg:col-span-2 space-y-6">
          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-6">
              <Card.Title class="text-base font-bold flex items-center gap-2">
                <ClockIcon class="w-5 h-5 text-purple-400" />
                时间偏好点选（可多选）
              </Card.Title>
              <Card.Description class="text-xs">
                点击对应的时间框来投出赞成票。我们会根据票数最高的时间来安排赛程。
              </Card.Description>
            </Card.Header>
            <Card.Content class="p-6 pt-0 space-y-4">
              {#if voteOptions.length > 0}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {#each voteOptions as opt}
                    {@const voted = !!(tournament.votes || []).find(v => v.player_id === userState.id && v.proposed_time === opt.proposed_time)}
                    <button 
                      onclick={() => toggleVoteOption(opt.proposed_time, voted)} 
                      class="flex flex-col text-left p-4 rounded-xl border transition-all text-xs cursor-pointer group/opt {voted ? 'bg-purple-950/20 border-purple-500 shadow-md shadow-purple-500/5' : 'bg-background/40 border-border hover:border-purple-500/40 hover:bg-background/80'}"
                    >
                      <div class="flex items-center justify-between w-full">
                        <span class="font-bold text-foreground group-hover/opt:text-purple-400 transition-colors">
                          {opt.proposed_time.replace('T', ' ')}
                        </span>
                        <div class="flex items-center gap-1.5">
                          {#if voted}
                            <Badge class="bg-purple-500 text-white font-bold hover:bg-purple-500 text-[9px] px-1 py-0 shadow">已投票</Badge>
                          {/if}
                          <span class="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                            {opt.count}
                          </span>
                        </div>
                      </div>
                      
                      <!-- Voters display -->
                      <div class="flex flex-wrap gap-1 mt-3 border-t border-border/50 pt-2 w-full">
                        {#each opt.voters as voter}
                          <span class="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40 font-medium">
                            {playerName(voter.player_id)}
                          </span>
                        {/each}
                      </div>
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="text-center py-10 border border-dashed border-border rounded-xl bg-muted/10">
                  <p class="text-xs text-muted-foreground/60 italic">目前还没有人发起时间选项，请在右侧时间框中添加第一个偏好。</p>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        </div>

        <!-- Add Option Sidebar -->
        <div class="space-y-6">
          <Card.Root class="border-border bg-card/40">
            <Card.Header class="p-5 pb-3">
              <Card.Title class="text-sm font-bold flex items-center gap-2">
                <CalendarIcon class="w-4 h-4 text-purple-400" />
                提案一个新的时间
              </Card.Title>
            </Card.Header>
            <Card.Content class="p-4 pt-0 space-y-4">
              {#if userState.id}
                <div class="space-y-3">
                  <!-- Inline Calendar and Time Slots Card -->
                  <div class="border border-border bg-background/30 rounded-xl overflow-hidden flex flex-col">
                    <div class="p-3 border-b border-border/40 bg-muted/5 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                      <span>当前身份: {userState.id}</span>
                      <span class="text-primary">不可代投票</span>
                    </div>
                    <div class="p-3">
                      <Calendar
                        type="single"
                        bind:value={voteDate}
                        class="bg-transparent p-0 mx-auto"
                        weekdayFormat="short"
                      />
                    </div>
                    <!-- Scrollable slots grid in sidebar -->
                    <div class="border-t border-border/60 p-3 max-h-[160px] overflow-y-auto">
                      <span class="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-2">选择具体时段</span>
                      <div class="grid grid-cols-3 gap-1.5">
                        {#each timeSlots as time}
                          <Button
                            variant={voteTime === time ? "default" : "outline"}
                            onclick={() => (voteTime = time)}
                            class="shadow-none text-[11px] h-7 py-1 px-1.5 cursor-pointer"
                          >
                            {time}
                          </Button>
                        {/each}
                      </div>
                    </div>
                  </div>

                  <div class="p-3 bg-muted/20 border border-border rounded-xl text-xs space-y-2">
                    <div class="text-[11px] text-muted-foreground leading-normal font-medium">
                      {#if voteDate && voteTime}
                        你选择的提案时间为:
                        <span class="font-bold text-foreground block mt-0.5">
                          {voteDate.toString()} {voteTime}
                        </span>
                      {:else}
                        请在上方日历和时段中选择时间
                      {/if}
                    </div>
                    <Button
                      disabled={!voteDate || !voteTime}
                      onclick={doVote}
                      class="w-full text-xs font-bold h-8 cursor-pointer mt-1"
                    >
                      添加此选项并投票
                    </Button>
                  </div>
                </div>
              {:else}
                <div class="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-2.5">
                  <p class="text-xs text-muted-foreground leading-normal">您需要先在右上角配置您的 <strong>Gamer ID</strong> 才能发起时间偏好提案。</p>
                  <Button variant="outline" size="sm" onclick={() => { document.querySelector('button[onclick="handleOpenDialog()"]')?.click(); }} class="text-[11px] h-7 cursor-pointer">
                    立即配置游戏ID
                  </Button>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        </div>
      </div>
    {:else if ['in_progress', 'completed'].includes(tournament.status)}
      <!-- STAGE 3 & 4: BRACKET & RESULT -->
      <div class="space-y-6">
        <!-- Winner Podium for Completed stage -->
        {#if tournament.status === 'completed' && podium}
          <div class="bg-gradient-to-r from-amber-500/10 via-background to-amber-500/10 border border-primary/20 rounded-2xl p-6 text-center max-w-2xl mx-auto space-y-4 shadow-lg shadow-primary/5">
            <TrophyIcon class="w-12 h-12 text-primary mx-auto animate-bounce" />
            <div>
              <h2 class="text-xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
                冠军诞生！恭喜 {playerName(podium.champion)}
              </h2>
              <p class="text-xs text-muted-foreground mt-1">S.U.C.K 赛事已完美收官</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4 max-w-md mx-auto pt-2">
              <div class="p-3 bg-card/60 border border-primary/20 rounded-xl">
                <CrownIcon class="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <p class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">冠军 (Gold)</p>
                <p class="text-sm font-bold text-foreground mt-0.5">{playerName(podium.champion)}</p>
              </div>
              <div class="p-3 bg-card/60 border border-border rounded-xl">
                <div class="w-5 h-5 rounded-full bg-zinc-400 text-black text-[10px] font-bold mx-auto mb-1 flex items-center justify-center">2</div>
                <p class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">亚军 (Silver)</p>
                <p class="text-sm font-bold text-foreground mt-0.5">{playerName(podium.runnerUp)}</p>
              </div>
            </div>

            <!-- Export data for SUCK Utilities -->
            <div class="pt-2">
              <Button variant="outline" size="sm" onclick={triggerJsonDownload} class="text-xs gap-1.5 h-8 hover:bg-primary hover:text-black cursor-pointer border-primary/20">
                <DownloadIcon class="w-3.5 h-3.5" />
                导出赛事数据 (JSON)
              </Button>
            </div>
          </div>
        {/if}

        {@render bracketView()}
      </div>
    {/if}
  </div>
{/if}

<!-- Match Result Submission Dialog -->
<Dialog.Root bind:open={showMatchDialog}>
  <Dialog.Content class="max-w-[380px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-base font-bold text-foreground">
        填报比赛结果
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        场次对局: {selectedMatch?.position} • 第 {selectedMatch?.round} 轮
      </Dialog.Description>
    </Dialog.Header>

    {#if selectedMatch}
      <div class="py-3 space-y-5">
        <!-- Standard Score Submission -->
        <div class="space-y-3 p-4 rounded-xl border border-border bg-background/30 text-center">
          <h4 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">判定游戏获胜方 (败者晋级)</h4>
          <p class="text-[10px] text-muted-foreground/85 leading-normal">
            本比赛为“败者晋级杯赛”，星际2游戏获胜的一方记大分 1 分并被淘汰，失败的一方记 0 分并晋级下一轮。请选择本局星际2游戏的<strong>获胜者</strong>：
          </p>
          <div class="flex flex-col gap-2 mt-1">
            <Button 
              disabled={submittingResult}
              onclick={() => selectGameWinner(selectedMatch.player1_id)}
              class="w-full text-xs font-bold h-9 cursor-pointer justify-center"
            >
              游戏获胜者: {playerName(selectedMatch.player1_id)} (对方晋级)
            </Button>
            <Button 
              disabled={submittingResult}
              onclick={() => selectGameWinner(selectedMatch.player2_id)}
              class="w-full text-xs font-bold h-9 cursor-pointer justify-center"
            >
              游戏获胜者: {playerName(selectedMatch.player2_id)} (对方晋级)
            </Button>
          </div>
        </div>

        <!-- Walkover / Forfeit -->
        <div class="space-y-2.5 p-4 rounded-xl border border-border bg-destructive/5 text-center">
          <h4 class="text-xs font-bold text-destructive/80 uppercase tracking-widest">弃权判定</h4>
          <p class="text-[10px] text-muted-foreground">若某方选手未能按时出席，可直接判定另一方弃权晋级下一轮。</p>
          <div class="grid grid-cols-2 gap-2 mt-1">
            <Button 
              variant="outline" 
              size="sm" 
              onclick={() => recordWalkover(selectedMatch.player2_id)}
              disabled={submittingResult}
              class="text-[11px] font-semibold border-red-500/20 text-foreground hover:bg-red-500/10 cursor-pointer text-center truncate px-2"
            >
              {playerName(selectedMatch.player2_id)} 晋级 (对方弃权)
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onclick={() => recordWalkover(selectedMatch.player1_id)}
              disabled={submittingResult}
              class="text-[11px] font-semibold border-red-500/20 text-foreground hover:bg-red-500/10 cursor-pointer text-center truncate px-2"
            >
              {playerName(selectedMatch.player1_id)} 晋级 (对方弃权)
            </Button>
          </div>
        </div>
      </div>
    {/if}

    <Dialog.Footer class="mt-1">
      <Button variant="ghost" size="sm" onclick={() => { showMatchDialog = false; selectedMatch = null; }} class="w-full text-xs h-8 cursor-pointer">
        取消
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Dialog for ending voting and selecting final time -->
<Dialog.Root bind:open={showStatusTimeDialog}>
  <Dialog.Content class="max-w-[400px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
        <ClockIcon class="w-5 h-5 text-primary" />
        确定比赛时间
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        请确定比赛最终进行的时间。开启报名后，选手将能看到此时间。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-3">
      <!-- Custom Input -->
      <div class="space-y-1.5">
        <label for="final-time-input" class="text-xs font-bold text-muted-foreground">确定的比赛时间 (支持输入自定义文字)</label>
        <Input 
          id="final-time-input"
          bind:value={selectedFinalTime} 
          placeholder="例如: 2026-06-20 20:00 或 本周六晚8点" 
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <!-- Voted Options to pick -->
      {#if voteOptions.length > 0}
        <div class="space-y-2">
          <label class="text-xs font-bold text-muted-foreground block">根据投票结果快捷点选：</label>
          <div class="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-1">
            {#each voteOptions as opt}
              {@const displayTime = opt.proposed_time.replace('T', ' ')}
              <button
                type="button"
                onclick={() => selectedFinalTime = displayTime}
                class="flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-xs cursor-pointer text-left
                {selectedFinalTime === displayTime ? 'bg-primary/10 border-primary text-primary font-bold' : 'bg-background/40 border-border hover:border-primary/40 hover:bg-background/80 text-foreground'}"
              >
                <span>{displayTime}</span>
                <Badge variant="secondary" class="bg-primary/20 text-primary font-bold text-[10px]">
                  {opt.count} 票
                </Badge>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button variant="outline" size="sm" onclick={() => showStatusTimeDialog = false} class="w-full sm:w-auto text-xs">
        取消
      </Button>
      <Button size="sm" onclick={confirmEndVoting} class="w-full sm:w-auto text-xs font-bold">
        确定并开启报名
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
