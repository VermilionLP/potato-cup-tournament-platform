<script>
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { API } from "$lib/api.js";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { userState } from "$lib/user.svelte.js";
  import { Calendar } from "$lib/components/ui/calendar/index.js";
  import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "$lib/components/ui/popover/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { CalendarDate } from "@internationalized/date";

  import TrophyIcon from "@lucide/svelte/icons/trophy";
  import UserRoundIcon from "@lucide/svelte/icons/user";
  import UsersIcon from "@lucide/svelte/icons/users";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import PlayIcon from "@lucide/svelte/icons/play";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import CrownIcon from "@lucide/svelte/icons/crown";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import UploadCloudIcon from "@lucide/svelte/icons/upload-cloud";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import ListOrderedIcon from "@lucide/svelte/icons/list-ordered";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import PlusIcon from "@lucide/svelte/icons/plus";

  let tid = $derived(page.params.id);
  let tournament = $state(null);
  let allPlayers = $state([]);
  let loading = $state(true);

  // Derived unregistered players list for quick registration select
  let unregisteredPlayers = $derived(
    allPlayers.filter(
      (ap) => !(tournament?.players || []).some((tp) => tp.id === ap.id),
    ),
  );

  // Replays integration states
  let showMatchDetailsDialog = $state(false);
  let matchReplays = $state([]);
  let loadingReplays = $state(false);
  let activeReplayTab = $state("overview"); // overview, build_order, curves, chat
  let selectedReplay = $state(null);
  let uploadingReplays = $state(false);

  // Player Editing states
  let showPlayerEditDialog = $state(false);
  let editingPlayerId = $state("");
  let editPlayerNewId = $state("");
  let editPlayerFlag = $state("cn");
  let editPlayerTeam = $state("");
  let editPlayerBattleTags = $state({ cn: [], global: [] });
  let editPlayerLink = $state("");
  let editPlayerBnetIds = $state([]);
  let unmappedReplays = $state([]);
  let showUnmappedDialog = $state(false);
  let tempBnetMappings = $state({});

  // Wiki generation states
  let showWikiDialog = $state(false);
  let generatedWikiText = $state("");
  let loadingWiki = $state(false);

  // Registration states
  let regInput = $state("");
  let seedOrder = $state([]);

  // Time voting states
  const today = new Date();
  let voteDate = $state(
    new CalendarDate(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate(),
    ),
  );
  let voteTime = $state("20:00");

  const timeSlots = [
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
    "20:30",
    "21:00",
    "21:30",
    "22:00",
    "22:30",
    "23:00",
    "23:30",
  ];

  // Modal for match results
  let showMatchDialog = $state(false);
  let selectedMatch = $state(null);
  let resultScore1 = $state(0);
  let resultScore2 = $state(0);
  let submittingResult = $state(false);

  // Modal for selecting final time
  let showStatusTimeDialog = $state(false);
  let selectedFinalTime = $state("");

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
    tournament?.players?.some((p) => p.id === userState.id),
  );

  onMount(load);

  let eventSource = null;
  $effect(() => {
    if (!tid) return;
    const es = new EventSource(`/api/tournaments/${tid}/stream`);
    eventSource = es;

    es.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("实时接收到服务器推送的赛事变动事件:", msg);
        const updated = await API.getTournament(tid);
        tournament = updated;
        initializeSeedOrder();
      } catch (e) {
        console.error("解析实时事件失败", e);
      }
    };

    es.onerror = (e) => {
      console.warn("实时推送连接发生错误，正在尝试重连...", e);
    };

    return () => {
      es.close();
    };
  });

  async function load() {
    loading = true;
    try {
      tournament = await API.getTournament(tid);
      allPlayers = await API.listPlayers();
      initializeSeedOrder();

      // Auto-generate/refresh bracket preview on page load in registration phase
      if (
        tournament.status === "registration" &&
        tournament.players?.length >= 2
      ) {
        const matches = await API.generateBracket(tid);
        tournament = { ...tournament, matches };
      }
    } catch (e) {
      toast.error("加载赛事详情失败: " + e.message);
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
    seedOrder = sortedPlayers.map((p) => p.id);
  }

  async function changeStatus(status) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    try {
      tournament = await API.updateStatus(tid, status);
      toast.success(`赛事状态已切换至: ${statusLabel(status)}`);
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function confirmEndVoting() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!selectedFinalTime.trim()) {
      return toast.error("请选择或输入确定的比赛时间");
    }
    try {
      tournament = await API.updateStatus(
        tid,
        "registration",
        selectedFinalTime.trim(),
      );
      toast.success(`赛事已开启报名，比赛时间已定为: ${selectedFinalTime}`);
      showStatusTimeDialog = false;
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Registration
  async function doRegister() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    const id = regInput.trim() || userState.id;
    if (!id) return toast.error("请输入选手 ID");
    try {
      const players = await API.register(tid, id);
      tournament = { ...tournament, players };
      toast.success(`选手 ${id} 报名成功`);
      regInput = "";
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
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
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
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
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
      toast.error("保存种子排序失败: " + e.message);
    }
  }

  // Bracket generation
  async function doGenerateBracket() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    try {
      const matches = await API.generateBracket(tid);
      tournament = { ...tournament, matches };
      toast.success("单淘汰 Bracket 已成功生成！");
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

  async function openMatchDetails(match) {
    selectedMatch = match;
    if (match.status === "pending" && tournament.status !== "completed") {
      showMatchDialog = true;
    } else {
      showMatchDetailsDialog = true;
      await loadReplaysForMatch(match.id);
    }
  }

  async function loadReplaysForMatch(matchId) {
    loadingReplays = true;
    try {
      matchReplays = await API.getReplays(matchId);
      if (matchReplays.length > 0) {
        selectedReplay = matchReplays[0];
      } else {
        selectedReplay = null;
      }
    } catch (e) {
      toast.error("加载录像数据失败: " + e.message);
    }
    loadingReplays = false;
  }

  async function uploadFileList(files) {
    uploadingReplays = true;
    const list = [];

    const readAsBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(",")[1]);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".sc2replay")) {
          toast.error(`文件 ${file.name} 格式不正确，必须为 .SC2Replay`);
          continue;
        }
        const base64 = await readAsBase64(file);
        list.push({ filename: file.name, content: base64 });
      }

      if (list.length === 0) {
        uploadingReplays = false;
        return;
      }

      const res = await API.uploadReplays(
        selectedMatch.id,
        list,
        userState.qqGroup,
      );

      const successCount = res.results.filter(
        (r) => r.status === "success",
      ).length;
      const failCount = res.results.length - successCount;

      if (successCount > 0) {
        toast.success(`成功上传并解析 ${successCount} 个录像文件！`);
      }
      if (failCount > 0) {
        const errors = res.results
          .filter((r) => r.status === "error")
          .map((r) => `${r.filename}: ${r.error}`)
          .join("\n");
        toast.error(`有 ${failCount} 个录像上传失败：\n${errors}`);
      }

      await loadReplaysForMatch(selectedMatch.id);
    } catch (e) {
      toast.error("上传录像失败: " + e.message);
    } finally {
      uploadingReplays = false;
    }
  }

  async function handleFileUpload(event) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!selectedMatch) return;
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadFileList(files);
    event.target.value = "";
  }

  async function handleBatchUpload(event) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    const files = event.target.files;
    if (!files || files.length === 0) return;

    toast.loading("正在解析并自动匹配录像...", { id: "batch-upload" });

    const list = [];
    const readAsBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(",")[1]);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".sc2replay")) {
          continue;
        }
        const base64 = await readAsBase64(file);
        list.push({ filename: file.name, content: base64 });
      }

      if (list.length === 0) {
        toast.dismiss("batch-upload");
        toast.error("未找到有效的 .SC2Replay 录像文件");
        return;
      }

      const res = await API.uploadBatchReplays(tid, list, userState.qqGroup);

      const successCount = res.results.filter(
        (r) => r.status === "success",
      ).length;
      const skippedCount = res.results.filter(
        (r) => r.status === "skipped",
      ).length;
      const unmapped = res.results.filter((r) => r.status === "unmapped");
      const failCount =
        res.results.length - successCount - skippedCount - unmapped.length;

      toast.dismiss("batch-upload");

      if (successCount > 0) {
        toast.success(`成功自动匹配并导入了 ${successCount} 个对局！`);
      }
      if (skippedCount > 0) {
        toast.info(`${skippedCount} 个已存在对局，已自动跳过。`);
      }
      if (unmapped.length > 0) {
        unmappedReplays = unmapped;
        tempBnetMappings = {};
        showUnmappedDialog = true;
        toast.info(
          `发现 ${unmapped.length} 个无法自动匹配的录像，已为您打开手动关联窗口。`,
        );
      }
      if (failCount > 0) {
        const errors = res.results
          .filter((r) => r.status === "error")
          .map((r) => `${r.filename}: ${r.error}`)
          .join("\n");
        toast.error(`有 ${failCount} 个录像解析失败：\n${errors}`);
      }

      await load();
    } catch (e) {
      toast.dismiss("batch-upload");
      toast.error("批量导入失败: " + e.message);
    } finally {
      event.target.value = "";
    }
  }

  function getUnrecognizedIds(replays) {
    const ids = new Set();
    replays.forEach((r) => {
      if (!r.p1Matched && r.repPlayers?.[0]) ids.add(r.repPlayers[0]);
      if (!r.p2Matched && r.repPlayers?.[1]) ids.add(r.repPlayers[1]);
    });
    return Array.from(ids);
  }

  function getAvailablePlayersForBnet(currentBnetId) {
    const allPlayers = tournament.players || [];
    const selectedPlayerIds = Object.entries(tempBnetMappings)
      .filter(([bid, pid]) => bid !== currentBnetId && !!pid)
      .map(([_, pid]) => pid);
    return allPlayers.filter((p) => !selectedPlayerIds.includes(p.id));
  }

  async function submitAllManualMappings() {
    const entries = Object.entries(tempBnetMappings).filter(
      ([_, pid]) => !!pid,
    );
    if (entries.length === 0) {
      return toast.error("请至少选择一个账号进行关联");
    }

    try {
      toast.loading("正在保存关联并重新导入对局...", { id: "manual-map" });

      const playerBnetUpdates = {};
      entries.forEach(([bnetId, pid]) => {
        if (!playerBnetUpdates[pid]) {
          playerBnetUpdates[pid] = [];
        }
        playerBnetUpdates[pid].push(bnetId);
      });

      for (const [pid, newBnetIds] of Object.entries(playerBnetUpdates)) {
        const playerObj = tournament.players.find((p) => p.id === pid);
        if (playerObj) {
          let bnetIds = [];
          if (playerObj.bnet_ids) {
            try {
              bnetIds =
                typeof playerObj.bnet_ids === "string"
                  ? JSON.parse(playerObj.bnet_ids)
                  : playerObj.bnet_ids;
            } catch (_) {}
          }
          if (!Array.isArray(bnetIds)) bnetIds = [];

          newBnetIds.forEach((newId) => {
            const hasId = bnetIds.some(
              (b) =>
                (typeof b === "string" ? b : b.id).toLowerCase() ===
                newId.toLowerCase(),
            );
            if (!hasId) {
              bnetIds.push({ id: newId, url: "" });
            }
          });

          await API.updatePlayer(playerObj.id, {
            flag: playerObj.flag,
            team: playerObj.team,
            link: playerObj.link,
            battle_tags: playerObj.battle_tags,
            bnet_ids: bnetIds,
            tournament_id: tid,
          });
        }
      }

      const replaysToUpload = unmappedReplays.map((r) => ({
        filename: r.filename,
        content: r.content,
      }));

      const res = await API.uploadBatchReplays(
        tid,
        replaysToUpload,
        userState.qqGroup,
      );

      const successCount = res.results.filter(
        (r) => r.status === "success",
      ).length;
      const skippedCount = res.results.filter(
        (r) => r.status === "skipped",
      ).length;
      const stillUnmapped = res.results.filter((r) => r.status === "unmapped");
      const failCount = res.results.filter((r) => r.status === "error").length;

      toast.dismiss("manual-map");

      if (stillUnmapped.length > 0) {
        unmappedReplays = stillUnmapped;
        tempBnetMappings = {};
        toast.info(
          `导入了部分对局，但仍有 ${stillUnmapped.length} 个录像未关联。`,
        );
      } else {
        showUnmappedDialog = false;
        unmappedReplays = [];
        tempBnetMappings = {};
        toast.success(`所有录像已成功关联并解析！`);
      }

      if (failCount > 0) {
        const errors = res.results
          .filter((r) => r.status === "error")
          .map((r) => `${r.filename}: ${r.error}`)
          .join("\n");
        toast.error(`有 ${failCount} 个录像解析失败：\n${errors}`);
      }

      await load();
    } catch (e) {
      toast.dismiss("manual-map");
      toast.error("保存关联或重新导入失败: " + e.message);
    }
  }

  async function handleFileDrop(event) {
    event.preventDefault();
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!selectedMatch) return;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    await uploadFileList(files);
  }

  async function handleDeleteReplay(replayId) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!confirm("确定要删除这个录像吗？此操作不可逆。")) return;
    try {
      await API.deleteReplay(replayId);
      toast.success("录像已成功删除");
      await loadReplaysForMatch(selectedMatch.id);
    } catch (e) {
      toast.error("删除录像失败: " + e.message);
    }
  }

  function downloadReplay(replayId) {
    window.open(`/api/replays/${replayId}/download`, "_blank");
  }

  async function openWikiExport() {
    loadingWiki = true;
    showWikiDialog = true;
    try {
      const res = await API.getWikiScript(tid);
      generatedWikiText = res.wikiScript;
    } catch (e) {
      toast.error("生成 Wiki 脚本失败: " + e.message);
    }
    loadingWiki = false;
  }

  function copyWikiToClipboard() {
    if (!generatedWikiText) return;
    navigator.clipboard.writeText(generatedWikiText);
    toast.success("Wiki 代码已成功复制到剪贴板！");
  }

  function formatDuration(sec) {
    if (!sec) return "00:00";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function getSvgPath(
    curve,
    width = 500,
    height = 200,
    maxTime = 20,
    maxWorkers = 85,
  ) {
    if (!curve || curve.length === 0) return "";
    return curve
      .map((pt) => {
        const x = Math.min(width, Math.max(0, (pt.t / maxTime) * width));
        const y = Math.min(
          height,
          Math.max(0, height - (pt.w / maxWorkers) * height),
        );
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  async function selectGameWinner(winnerId) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!selectedMatch) return;
    submittingResult = true;

    const isPlayer1 = winnerId === selectedMatch.player1_id;
    const score1 = isPlayer1 ? 1 : 0;
    const score2 = isPlayer1 ? 0 : 1;

    try {
      await API.submitResult(tid, selectedMatch.id, score1, score2);
      const advancerId = isPlayer1
        ? selectedMatch.player2_id
        : selectedMatch.player1_id;
      toast.success(
        `已判定游戏获胜者为 ${playerName(winnerId)}，败者 ${playerName(advancerId)} 晋级`,
      );
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
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!selectedMatch) return;
    submittingResult = true;
    try {
      await API.submitWalkover(tid, selectedMatch.id, winnerId);
      toast.success("已记录弃权并晋级胜者");
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
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    if (!voteDate) return toast.error("请选择日期");
    const timeStr = voteTime || "20:00";
    const dateStr = voteDate.toString();
    const iso = `${dateStr}T${timeStr}:00`;
    try {
      await API.submitVote(tid, userState.id, iso);
      toast.success("时间选项已添加并投票");
      voteDate = undefined;
      voteTime = "20:00";
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function toggleVoteOption(optionTime, voted) {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }
    try {
      if (voted) {
        await API.removeVote(tid, userState.id, optionTime);
        toast.success("已取消该时间的投票");
      } else {
        await API.submitVote(tid, userState.id, optionTime);
        toast.success("已投赞成票");
      }
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function openEditPlayer(p) {
    editingPlayerId = p.id;
    editPlayerNewId = p.id;
    editPlayerFlag = p.flag || "cn";
    editPlayerTeam = p.team || "";
    editPlayerLink = p.link || "";

    let parsedTags = {};
    if (p.battle_tags) {
      try {
        parsedTags =
          typeof p.battle_tags === "string"
            ? JSON.parse(p.battle_tags)
            : p.battle_tags;
      } catch (_) {}
    }
    const parseToArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean);
      if (typeof val === "string")
        return val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      return [];
    };
    editPlayerBattleTags = {
      cn: parseToArray(parsedTags.cn),
      global: parseToArray(parsedTags.global),
    };

    if (p.bnet_ids) {
      try {
        const ids =
          typeof p.bnet_ids === "string" ? JSON.parse(p.bnet_ids) : p.bnet_ids;
        if (Array.isArray(ids)) {
          editPlayerBnetIds = ids.map((item) =>
            typeof item === "string" ? { id: item, url: "" } : item,
          );
        } else {
          editPlayerBnetIds = [];
        }
      } catch (_) {
        editPlayerBnetIds = [];
      }
    } else {
      editPlayerBnetIds = [];
    }

    showPlayerEditDialog = true;
  }

  function removeBnetId(idx) {
    editPlayerBnetIds = editPlayerBnetIds.filter((_, i) => i !== idx);
  }

  async function handleSavePlayer() {
    if (!userState.qqGroup || !userState.id) {
      toast.error("此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！");
      document.getElementById("header-profile-button")?.click();
      return;
    }

    try {
      const cleanNewId = editPlayerNewId.trim();
      if (!cleanNewId) {
        toast.error("选手唯一 ID 不能为空");
        return;
      }

      if (cleanNewId !== editingPlayerId) {
        const isMe = (editingPlayerId === userState.id);
        if (isMe) {
          const confirmed = confirm(`修改您的选手 ID 将会同时更新您的登录凭证，确定要修改吗？`);
          if (!confirmed) return;
        }
        toast.loading("正在修改选手唯一 ID 并同步所有关联数据...", {
          id: "player-save",
        });
        await API.renamePlayer(editingPlayerId, cleanNewId);
        if (isMe) {
          userState.setId(cleanNewId);
        }
        editingPlayerId = cleanNewId;
      }

      toast.loading("正在更新选手资料...", { id: "player-save" });
      await API.updatePlayer(editingPlayerId, {
        flag: editPlayerFlag,
        team: editPlayerTeam,
        link: editPlayerLink,
        battle_tags: editPlayerBattleTags,
        tournament_id: tid,
      });

      toast.dismiss("player-save");
      toast.success("选手资料更新成功");
      showPlayerEditDialog = false;
      const isMe = (editingPlayerId === userState.id);
      await load();
      if (isMe) {
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    } catch (e) {
      toast.dismiss("player-save");
      toast.error("更新资料失败: " + e.message);
    }
  }

  // Helpers
  function playerName(pid, match = null) {
    if (!pid) {
      if (match) {
        const maxRound = Math.max(
          ...(tournament?.matches?.map((m) => m.round) || [1]),
        );
        if (match.round === maxRound) {
          return "BYE (轮空)";
        }
      }
      return "TBD";
    }
    const p = tournament?.players?.find((p) => p.id === pid);
    return p?.display_name || pid;
  }

  function rounds() {
    if (!tournament?.matches?.length) return [];
    const map = {};
    tournament.matches.forEach((m) => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    return Object.entries(map)
      .map(([round, ms]) => ({
        round: parseInt(round),
        matches: ms.sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => b.round - a.round);
  }

  function roundLabel(roundNum, totalRounds) {
    if (roundNum === 1) return "总决赛";
    if (roundNum === 2) return "半决赛";
    if (roundNum === 3 && totalRounds >= 3) return "四分之一决赛";
    return `第 ${roundNum} 轮`;
  }

  function statusLabel(s) {
    return (
      {
        registration: "报名中",
        voting: "时间投票",
        in_progress: "比赛进行中",
        completed: "已结束",
      }[s] || s
    );
  }

  // Find overall champion and runner-up
  let podium = $derived.by(() => {
    if (!tournament?.matches?.length || tournament.status !== "completed")
      return null;
    const finalMatch = tournament.matches.find(
      (m) => m.round === 1 && m.position === 1,
    );
    if (!finalMatch || finalMatch.status !== "completed") return null;
    const champion = finalMatch.winner_id;
    const runnerUp =
      champion === finalMatch.player1_id
        ? finalMatch.player2_id
        : finalMatch.player1_id;
    return { champion, runnerUp };
  });

  // Derive standings for completed/in-progress stages
  let standings = $derived.by(() => {
    if (!tournament?.matches?.length) return [];

    const playersMap = {};
    (tournament.players || []).forEach((p) => {
      playersMap[p.id] = {
        id: p.id,
        display_name: p.display_name,
        flag: p.flag,
        team: p.team,
        link: p.link,
        rank: "TBD",
        eliminatedRound: null,
        matchesPlayed: 0,
        matchesWon: 0,
      };
    });

    const matches = tournament.matches || [];
    const finalMatch = matches.find((m) => m.round === 1 && m.position === 1);

    matches.forEach((m) => {
      if (m.player1_id && playersMap[m.player1_id])
        playersMap[m.player1_id].matchesPlayed++;
      if (m.player2_id && playersMap[m.player2_id])
        playersMap[m.player2_id].matchesPlayed++;

      if (m.status === "completed" || m.status === "walkover") {
        const winnerId = m.winner_id;
        const loserId = winnerId === m.player1_id ? m.player2_id : m.player1_id;

        if (winnerId && playersMap[winnerId]) {
          playersMap[winnerId].matchesWon++;
        }

        if (loserId && playersMap[loserId]) {
          playersMap[loserId].eliminatedRound = m.round;
        }
      }
    });

    if (
      finalMatch &&
      (finalMatch.status === "completed" || finalMatch.status === "walkover")
    ) {
      const champId = finalMatch.winner_id;
      const runnerUpId =
        champId === finalMatch.player1_id
          ? finalMatch.player2_id
          : finalMatch.player1_id;

      if (champId && playersMap[champId]) {
        playersMap[champId].rank = "第 1 名 (冠军)";
      }
      if (runnerUpId && playersMap[runnerUpId]) {
        playersMap[runnerUpId].rank = "第 2 名 (亚军)";
      }
    }

    Object.values(playersMap).forEach((p) => {
      if (p.rank !== "TBD") return;
      if (p.eliminatedRound === null) {
        p.rank = "未淘汰";
        return;
      }

      const r = p.eliminatedRound;
      if (r === 2) {
        p.rank = "第 3 - 4 名 (四强)";
      } else if (r === 3) {
        p.rank = "第 5 - 8 名 (八强)";
      } else if (r === 4) {
        p.rank = "第 9 - 16 名";
      } else if (r > 4) {
        const minRank = (1 << (r - 1)) + 1;
        const maxRank = 1 << r;
        p.rank = `第 ${minRank} - ${maxRank} 名`;
      }
    });

    return Object.values(playersMap).sort((a, b) => {
      const getPriority = (rankStr) => {
        if (rankStr.includes("1")) return 1;
        if (rankStr.includes("2")) return 2;
        if (rankStr.includes("3")) return 3;
        if (rankStr.includes("5")) return 4;
        if (rankStr.includes("9")) return 5;
        if (rankStr.includes("未淘汰")) return 0;
        return 100;
      };
      return getPriority(a.rank) - getPriority(b.rank);
    });
  });

  // Direct download export
  function triggerJsonDownload() {
    if (!tournament) return;
    const json = JSON.stringify(tournament, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suck-tournament-${tournament.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("赛事 JSON 导出成功");
  }
</script>

{#if loading}
  <div
    class="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground"
  >
    <div
      class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
    ></div>
    <p class="text-sm">正在加载赛事详情...</p>
  </div>
{:else if !tournament}
  <div
    class="text-center py-16 border border-border bg-card/30 rounded-2xl max-w-xl mx-auto space-y-4"
  >
    <TrophyIcon class="w-12 h-12 text-muted-foreground mx-auto" />
    <div>
      <h2 class="text-lg font-bold text-foreground">赛事不存在</h2>
      <p class="text-xs text-muted-foreground mt-1">
        您访问的赛事 ID 在数据库中未找到。
      </p>
    </div>
    <Button size="sm" onclick={() => goto("/")} class="gap-1 text-xs">
      <ArrowLeftIcon class="w-3.5 h-3.5" /> 返回首页
    </Button>
  </div>
{:else}
  {#snippet rosterSidebar()}
    <Card.Root class="border-border bg-card/40">
      <Card.Header class="p-5 pb-3">
        <Card.Title class="text-sm font-bold flex items-center justify-between">
          <span>选手名册</span>
          <Badge
            variant="outline"
            class="text-[10px] bg-primary/10 text-primary border-primary/20"
          >
            {tournament.players?.length || 0} / {tournament.player_capacity}
            人
          </Badge>
        </Card.Title>
      </Card.Header>
      <Card.Content class="p-5 pt-0">
        <div class="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
          {#each tournament.players || [] as p}
            <div
              class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-background/40 border border-border/60 hover:bg-background/80 transition-colors"
            >
              <span
                class="text-xs font-medium flex items-center gap-1.5 truncate mr-2"
              >
                <div
                  class="w-2.5 h-2.5 rounded-full bg-primary/30 border border-primary/50"
                ></div>
                {#if p.team}
                  <span class="text-[10px] text-muted-foreground font-mono"
                    >[{p.team}]</span
                  >
                {/if}
                <span class="truncate">{p.display_name}</span>
                {#if p.flag}
                  <span
                    class="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground uppercase font-mono"
                    >{p.flag}</span
                  >
                {/if}
                {#if p.seed}
                  <span class="text-[10px] text-amber-500 font-bold"
                    >#{p.seed}</span
                  >
                {/if}
              </span>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  onclick={() => openEditPlayer(p)}
                  class="text-muted-foreground hover:text-primary p-1 rounded transition-colors cursor-pointer"
                  title="编辑选手资料"
                >
                  <SettingsIcon class="w-3.5 h-3.5" />
                </button>
                {#if tournament.status === "registration"}
                  <button
                    onclick={() => doUnregister(p.id)}
                    class="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors cursor-pointer"
                    title="注销此选手"
                  >
                    <TrashIcon class="w-3.5 h-3.5" />
                  </button>
                {/if}
              </div>
            </div>
          {/each}
          {#if (tournament.players || []).length === 0}
            <p class="text-xs text-muted-foreground/60 italic text-center py-6">
              暂无选手报名
            </p>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>
  {/snippet}

  {#snippet bracketView()}
    <Card.Root class="border-border bg-card/40">
      <Card.Header
        class="p-6 flex flex-row items-center justify-between gap-4 border-b border-border/40 pb-4"
      >
        <div>
          <Card.Title class="text-base font-bold flex items-center gap-2">
            <ShieldCheckIcon class="w-5 h-5 text-amber-500" />
            {#if tournament.status === "registration"}
              对阵图预览 (Bracket Preview)
            {:else}
              赛事对阵图 (Single Elimination Bracket)
            {/if}
          </Card.Title>
          <Card.Description class="text-xs">
            {#if tournament.status === "registration"}
              基于当前报名的选手和种子排名实时生成的对阵预览（调整上方种子排序会自动刷新）。
            {:else if tournament.status === "in_progress"}
              点击包含两位选手的待赛卡片可以填报比分或进行弃权处理。
            {:else}
              赛事已结束，此对阵图当前为只读。
            {/if}
          </Card.Description>
        </div>
        {#if ["in_progress", "completed"].includes(tournament.status)}
          <div class="flex items-center gap-2 shrink-0">
            <label
              class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-bold shadow hover:bg-primary hover:text-black transition-all cursor-pointer"
            >
              <input
                type="file"
                accept=".SC2Replay"
                multiple
                onchange={handleBatchUpload}
                class="hidden"
              />
              <UploadCloudIcon class="w-3.5 h-3.5" />
              <span>批量导入录像</span>
            </label>
          </div>
        {/if}
      </Card.Header>
      <Card.Content class="p-6 overflow-x-auto">
        {#if tournament.matches?.length > 0}
          <!-- Round flex container -->
          <div class="flex gap-8 justify-start py-4">
            {#each rounds() as r (r.round)}
              <div
                class="flex-shrink-0 w-56 flex flex-col justify-around gap-6"
              >
                <div
                  class="text-xs text-muted-foreground font-bold text-center border-b border-border/40 pb-1.5 mb-2 tracking-wider"
                >
                  {roundLabel(r.round, rounds().length)}
                </div>
                {#each r.matches as m (m.id)}
                  {@const userInMatch =
                    userState.id &&
                    (m.player1_id === userState.id ||
                      m.player2_id === userState.id)}
                  {@const bothPlayersReady = m.player1_id && m.player2_id}
                  {@const isPending = m.status === "pending"}
                  {@const isPlayable =
                    bothPlayersReady &&
                    isPending &&
                    tournament.status === "in_progress"}
                  {@const isBye =
                    m.status === "completed" &&
                    m.winner_id &&
                    (!m.player1_id || !m.player2_id)}

                  {#if isBye}
                    <!-- Bye match: minimal greyed-out card -->
                    <div
                      class="w-full p-2.5 rounded-xl border border-border/30 bg-muted/10 text-xs opacity-40"
                    >
                      <div
                        class="flex items-center justify-between text-[9px] text-muted-foreground font-mono mb-1"
                      >
                        <span>场次 {m.position}</span>
                        <span class="italic">轮空</span>
                      </div>
                      <div
                        class="flex items-center gap-1.5 text-muted-foreground"
                      >
                        <span class="font-medium"
                          >{playerName(m.winner_id)}</span
                        >
                        <span class="text-[9px] italic">→ 自动晋级</span>
                      </div>
                    </div>
                  {:else}
                    <!-- Normal match card -->
                    {@const isClickable =
                      bothPlayersReady &&
                      ["in_progress", "completed"].includes(tournament.status)}
                    <button
                      disabled={!isClickable}
                      onclick={() => openMatchDetails(m)}
                      class="w-full text-left p-3.5 rounded-xl border bg-background/50 transition-all flex flex-col gap-2 group/match shadow-sm text-xs cursor-default
                      {isClickable
                        ? 'hover:border-primary hover:bg-background/80 hover:shadow-md cursor-pointer'
                        : ''}
                      {isPlayable
                        ? userInMatch
                          ? 'border-primary ring-1 ring-primary/30 shadow shadow-primary/10 bg-primary/5'
                          : 'border-primary/45 shadow-sm shadow-primary/5'
                        : bothPlayersReady && !isPending
                          ? 'border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/5'
                          : 'border-border'}
                      "
                    >
                      <!-- Header slot indicators -->
                      <div
                        class="flex items-center justify-between text-[9px] text-muted-foreground w-full font-mono"
                      >
                        <span>场次 {m.position}</span>
                        {#if userInMatch && isPending}
                          <span class="text-primary font-bold animate-pulse"
                            >我的比赛</span
                          >
                        {/if}
                        {#if m.status === "completed"}
                          <span
                            class="text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20"
                            >完赛</span
                          >
                        {:else if m.status === "walkover"}
                          <span
                            class="text-amber-500 font-bold bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20"
                            >弃权</span
                          >
                        {/if}
                      </div>

                      <!-- Player 1 row -->
                      <div
                        class="flex items-center justify-between w-full py-0.5"
                      >
                        <span
                          class="truncate font-semibold flex items-center gap-1.5
                          {m.winner_id === m.player1_id
                            ? 'text-primary font-extrabold'
                            : 'text-foreground/80'}
                          {!m.player1_id
                            ? 'text-muted-foreground/50 italic font-light'
                            : ''}
                        "
                        >
                          {#if m.winner_id === m.player1_id && m.winner_id}
                            <CrownIcon
                              class="w-3.5 h-3.5 text-primary shrink-0"
                            />
                          {/if}
                          {playerName(m.player1_id, m)}
                        </span>
                        {#if m.status !== "pending"}
                          <span
                            class="font-mono font-bold {m.winner_id ===
                            m.player1_id
                              ? 'text-primary'
                              : 'text-muted-foreground'}">{m.score1}</span
                          >
                        {/if}
                      </div>

                      <!-- VS separator / Line -->
                      <div class="h-[1px] bg-border/50 w-full"></div>

                      <!-- Player 2 row -->
                      <div
                        class="flex items-center justify-between w-full py-0.5"
                      >
                        <span
                          class="truncate font-semibold flex items-center gap-1.5
                          {m.winner_id === m.player2_id
                            ? 'text-primary font-extrabold'
                            : 'text-foreground/80'}
                          {!m.player2_id
                            ? 'text-muted-foreground/50 italic font-light'
                            : ''}
                        "
                        >
                          {#if m.winner_id === m.player2_id && m.winner_id}
                            <CrownIcon
                              class="w-3.5 h-3.5 text-primary shrink-0"
                            />
                          {/if}
                          {playerName(m.player2_id, m)}
                        </span>
                        {#if m.status !== "pending"}
                          <span
                            class="font-mono font-bold {m.winner_id ===
                            m.player2_id
                              ? 'text-primary'
                              : 'text-muted-foreground'}">{m.score2}</span
                          >
                        {/if}
                      </div>

                      <!-- Prompt for pending action -->
                      {#if bothPlayersReady && isPending && tournament.status === "in_progress"}
                        <div
                          class="text-[9.5px] text-muted-foreground/80 text-center w-full mt-1 border-t border-border/40 pt-1.5 group-hover/match:text-primary transition-colors"
                        >
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
            {#if tournament.status === "registration"}
              <p class="text-xs italic">
                暂无对阵预览，调整上面种子顺序后，点击“生成对阵预览”。
              </p>
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
    <div
      class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5"
    >
      <div class="space-y-1">
        <button
          onclick={() => goto("/")}
          class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mb-1.5 cursor-pointer"
        >
          <ArrowLeftIcon class="w-3 h-3" /> 返回大厅
        </button>
        <div class="flex items-center gap-3">
          <h1
            class="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground"
          >
            {tournament.name}
          </h1>
          <Badge
            variant="outline"
            class="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
          >
            {statusLabel(tournament.status)}
          </Badge>
        </div>
        <p class="text-xs text-muted-foreground font-medium">
          ID: {tournament.id} • 选手容量: {tournament.player_count ||
            0}/{tournament.player_capacity} 人 • 创建于 {new Date(
            tournament.created_at,
          ).toLocaleDateString("zh-CN")}
        </p>
        {#if tournament.scheduled_time}
          <div
            class="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-bold shadow-md shadow-primary/5"
          >
            <ClockIcon class="w-4 h-4 text-primary shrink-0 animate-pulse" />
            <span>比赛时间: {tournament.scheduled_time}</span>
          </div>
        {/if}
      </div>

      <!-- Admin Status Stepper Controls -->
      <div class="flex items-center gap-2 flex-wrap">
        {#if tournament.status === "voting"}
          <Button
            size="sm"
            onclick={() => {
              if (!userState.qqGroup || !userState.id) {
                toast.error(
                  "此操作需要先验证 QQ 群号与选手 ID。已为您打开配置面板！",
                );
                document.getElementById("header-profile-button")?.click();
                return;
              }
              if (voteOptions.length > 0) {
                selectedFinalTime = voteOptions[0].proposed_time.replace(
                  "T",
                  " ",
                );
              } else {
                selectedFinalTime = "";
              }
              showStatusTimeDialog = true;
            }}
            class="text-xs font-semibold cursor-pointer"
          >
            结束投票并开启报名
          </Button>
        {:else if tournament.status === "registration"}
          <Button
            variant="outline"
            size="sm"
            onclick={() => changeStatus("voting")}
            class="text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500 hover:text-white cursor-pointer"
          >
            返回时间投票
          </Button>
          <Button
            size="sm"
            onclick={() => changeStatus("in_progress")}
            class="text-xs font-semibold cursor-pointer"
          >
            结束报名并开赛
          </Button>
        {:else if tournament.status === "in_progress"}
          <Button
            variant="outline"
            size="sm"
            onclick={() => changeStatus("registration")}
            class="text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500 hover:text-white cursor-pointer"
          >
            返回选手报名
          </Button>
          <Button
            size="sm"
            onclick={() => changeStatus("completed")}
            class="text-xs font-bold cursor-pointer"
          >
            结束赛事
          </Button>
        {:else if tournament.status === "completed"}
          <Button
            variant="outline"
            size="sm"
            onclick={() => changeStatus("in_progress")}
            class="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-black cursor-pointer"
          >
            重新打开比赛
          </Button>
        {/if}
      </div>
    </div>

    <!-- Phase Stepper Graphic -->
    <div
      class="grid grid-cols-4 gap-2 border border-border bg-card/25 p-3 rounded-2xl text-center text-xs"
    >
      <div
        class="space-y-1.5 {tournament.status === 'voting'
          ? 'text-purple-400 font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'voting'
            ? 'bg-purple-500 text-white border-purple-500'
            : 'bg-muted/40 border-border'}"
        >
          1
        </div>
        <div>时间投票</div>
      </div>
      <div
        class="space-y-1.5 {tournament.status === 'registration'
          ? 'text-primary font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'registration'
            ? 'bg-primary text-black border-primary'
            : 'bg-muted/40 border-border'}"
        >
          2
        </div>
        <div>选手报名</div>
      </div>
      <div
        class="space-y-1.5 {tournament.status === 'in_progress'
          ? 'text-amber-500 font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'in_progress'
            ? 'bg-amber-500 text-black border-amber-500'
            : 'bg-muted/40 border-border'}"
        >
          3
        </div>
        <div>淘汰赛中</div>
      </div>
      <div
        class="space-y-1.5 {tournament.status === 'completed'
          ? 'text-emerald-400 font-bold'
          : 'text-muted-foreground'}"
      >
        <div
          class="w-6 h-6 rounded-full mx-auto flex items-center justify-center text-[10px] border {tournament.status ===
          'completed'
            ? 'bg-emerald-500 text-black border-emerald-500'
            : 'bg-muted/40 border-border'}"
        >
          4
        </div>
        <div>赛事结束</div>
      </div>
    </div>

    <!-- Active Panel based on current stage -->
    {#if tournament.status === "registration"}
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
                当报名人数达到设定或充足时，组织者可进行种子排序并生成单淘汰
                Bracket。
              </Card.Description>
            </Card.Header>
            <Card.Content class="p-6 pt-0 space-y-4">
              <!-- One-Click Register for Current User -->
              <div
                class="p-4 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                {#if userState.id}
                  <div class="flex items-center gap-3">
                    <div
                      class="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xs font-bold text-white uppercase"
                    >
                      {userState.id.slice(0, 2)}
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        当前浏览器 Gamer ID
                      </p>
                      <h4 class="font-bold text-foreground text-sm">
                        {userState.id}
                      </h4>
                    </div>
                  </div>
                  {#if isRegistered}
                    <div class="flex items-center gap-2">
                      <Badge
                        class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs gap-1 py-1"
                      >
                        <CheckIcon class="w-3.5 h-3.5" /> 已在选手中
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => doUnregister(userState.id)}
                        class="text-xs text-red-400 hover:text-red-300 border-red-500/20 hover:bg-red-500/10 h-8 cursor-pointer"
                      >
                        取消报名
                      </Button>
                    </div>
                  {:else}
                    <Button
                      onclick={doRegister}
                      size="sm"
                      class="font-bold text-xs h-8 cursor-pointer"
                    >
                      一键快速报名
                    </Button>
                  {/if}
                {:else}
                  <div class="flex items-center gap-3">
                    <div
                      class="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground"
                    >
                      ?
                    </div>
                    <div>
                      <p class="text-xs text-muted-foreground">
                        未关联 Gamer ID
                      </p>
                      <p class="text-[10px] text-muted-foreground/80 mt-0.5">
                        请先关联或在右侧输入框注册
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      document.getElementById("header-profile-button")?.click();
                    }}
                    class="text-xs h-8 cursor-pointer border-primary/30 text-primary animate-pulse"
                  >
                    去关联游戏ID
                  </Button>
                {/if}
              </div>

              <!-- Admin/Organizer Manual registration -->
              <div class="space-y-2.5">
                <label
                  for="reg-id-input"
                  class="text-xs font-bold text-muted-foreground"
                  >管理员手动为群友报名</label
                >
                <div class="flex gap-2">
                  <Input
                    id="reg-id-input"
                    bind:value={regInput}
                    placeholder="输入群友 ID，如 ZergKing"
                    class="bg-background border-border text-foreground flex-1 h-9 text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onclick={doRegister}
                    class="text-xs h-9 cursor-pointer"
                  >
                    添加选手
                  </Button>
                </div>

                {#if unregisteredPlayers.length > 0}
                  <div class="space-y-1.5 pt-1">
                    <span
                      class="text-[10px] font-bold text-muted-foreground block"
                      >快捷选择已有选手报名：</span
                    >
                    <div
                      class="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1"
                    >
                      {#each unregisteredPlayers as p}
                        <button
                          type="button"
                          onclick={() => (regInput = p.id)}
                          class="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-primary hover:text-primary-foreground border border-border/80 transition-colors cursor-pointer {regInput ===
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
            </Card.Content>
          </Card.Root>

          <!-- Seeding Panel -->
          {#if (tournament.players?.length || 0) >= 2}
            <Card.Root class="border-border bg-card/40">
              <Card.Header class="p-6">
                <div>
                  <Card.Title
                    class="text-base font-bold flex items-center gap-2"
                  >
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
                    <div
                      class="flex items-center gap-3 bg-background/50 border border-border rounded-xl px-4 py-2 text-xs"
                    >
                      <span class="text-amber-500 font-bold w-6"
                        >#{idx + 1}</span
                      >
                      <span class="flex-1 font-semibold">{playerName(pid)}</span
                      >
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
          {@render rosterSidebar()}
        </div>
      </div>

      <!-- Bracket Preview in Registration stage -->
      {#if (tournament.players?.length || 0) >= 2}
        <div class="mt-6">
          {@render bracketView()}
        </div>
      {/if}
    {:else if tournament.status === "voting"}
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
                    {@const voted = !!(tournament.votes || []).find(
                      (v) =>
                        v.player_id === userState.id &&
                        v.proposed_time === opt.proposed_time,
                    )}
                    <button
                      onclick={() => toggleVoteOption(opt.proposed_time, voted)}
                      class="flex flex-col text-left p-4 rounded-xl border transition-all text-xs cursor-pointer group/opt {voted
                        ? 'bg-purple-950/20 border-purple-500 shadow-md shadow-purple-500/5'
                        : 'bg-background/40 border-border hover:border-purple-500/40 hover:bg-background/80'}"
                    >
                      <div class="flex items-center justify-between w-full">
                        <span
                          class="font-bold text-foreground group-hover/opt:text-purple-400 transition-colors"
                        >
                          {opt.proposed_time.replace("T", " ")}
                        </span>
                        <div class="flex items-center gap-1.5">
                          {#if voted}
                            <Badge
                              class="bg-purple-500 text-white font-bold hover:bg-purple-500 text-[9px] px-1 py-0 shadow"
                              >已投票</Badge
                            >
                          {/if}
                          <span
                            class="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow"
                          >
                            {opt.count}
                          </span>
                        </div>
                      </div>

                      <!-- Voters display -->
                      <div
                        class="flex flex-wrap gap-1 mt-3 border-t border-border/50 pt-2 w-full"
                      >
                        {#each opt.voters as voter}
                          <span
                            class="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40 font-medium"
                          >
                            {playerName(voter.player_id)}
                          </span>
                        {/each}
                      </div>
                    </button>
                  {/each}
                </div>
              {:else}
                <div
                  class="text-center py-10 border border-dashed border-border rounded-xl bg-muted/10"
                >
                  <p class="text-xs text-muted-foreground/60 italic">
                    目前还没有人发起时间选项，请在右侧时间框中添加第一个偏好。
                  </p>
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
                  <div
                    class="border border-border bg-background/30 rounded-xl overflow-hidden flex flex-col"
                  >
                    <div
                      class="p-3 border-b border-border/40 bg-muted/5 flex items-center justify-between text-[10px] font-bold text-muted-foreground"
                    >
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
                    <div
                      class="border-t border-border/60 p-3 max-h-[160px] overflow-y-auto"
                    >
                      <span
                        class="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-2"
                        >选择具体时段</span
                      >
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

                  <div
                    class="p-3 bg-muted/20 border border-border rounded-xl text-xs space-y-2"
                  >
                    <div
                      class="text-[11px] text-muted-foreground leading-normal font-medium"
                    >
                      {#if voteDate && voteTime}
                        你选择的提案时间为:
                        <span class="font-bold text-foreground block mt-0.5">
                          {voteDate.toString()}
                          {voteTime}
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
                <div
                  class="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-2.5"
                >
                  <p class="text-xs text-muted-foreground leading-normal">
                    您需要先在右上角配置您的 <strong>Gamer ID</strong> 才能发起时间偏好提案。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      document.getElementById("header-profile-button")?.click();
                    }}
                    class="text-[11px] h-7 cursor-pointer"
                  >
                    立即配置游戏ID
                  </Button>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
          {@render rosterSidebar()}
        </div>
      </div>
    {:else if ["in_progress", "completed"].includes(tournament.status)}
      <!-- STAGE 3 & 4: BRACKET & RESULT -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          <!-- Winner Podium for Completed stage -->
          {#if tournament.status === "completed" && podium}
            <div
              class="bg-gradient-to-r from-amber-500/10 via-background to-amber-500/10 border border-primary/20 rounded-2xl p-6 text-center max-w-2xl mx-auto space-y-4 shadow-lg shadow-primary/5"
            >
              <TrophyIcon
                class="w-12 h-12 text-primary mx-auto animate-bounce"
              />
              <div>
                <h2
                  class="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent"
                >
                  冠军诞生！恭喜 {playerName(podium.champion)}
                </h2>
                <p class="text-xs text-muted-foreground mt-1">
                  SUCK 赛事已完美收官
                </p>
              </div>

              <div class="grid grid-cols-2 gap-4 max-w-md mx-auto pt-2">
                <div class="p-3 bg-card/60 border border-primary/20 rounded-xl">
                  <CrownIcon class="w-5 h-5 text-amber-400 mx-auto mb-1" />
                  <p
                    class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold"
                  >
                    冠军 (Gold)
                  </p>
                  <p class="text-sm font-bold text-foreground mt-0.5">
                    {playerName(podium.champion)}
                  </p>
                </div>
                <div class="p-3 bg-card/60 border border-border rounded-xl">
                  <div
                    class="w-5 h-5 rounded-full bg-zinc-400 text-black text-[10px] font-bold mx-auto mb-1 flex items-center justify-center"
                  >
                    2
                  </div>
                  <p
                    class="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold"
                  >
                    亚军 (Silver)
                  </p>
                  <p class="text-sm font-bold text-foreground mt-0.5">
                    {playerName(podium.runnerUp)}
                  </p>
                </div>
              </div>

              <!-- Export data for SUCK Utilities -->
              <div class="pt-2 flex justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={triggerJsonDownload}
                  class="text-xs gap-1.5 h-8 hover:bg-primary hover:text-black cursor-pointer border-primary/20"
                >
                  <DownloadIcon class="w-3.5 h-3.5" />
                  导出赛事数据 (JSON)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={openWikiExport}
                  class="text-xs gap-1.5 h-8 hover:bg-primary hover:text-black cursor-pointer border-primary/20"
                >
                  <FileTextIcon class="w-3.5 h-3.5" />
                  生成 Liquipedia Wiki 脚本
                </Button>
              </div>
            </div>
          {/if}

          <!-- Standings / Rankings Table for Completed stage -->
          {#if tournament.status === "completed" && standings.length > 0}
            <Card.Root class="border-border bg-card/40 max-w-2xl mx-auto mt-6">
              <Card.Header class="p-6 pb-3">
                <Card.Title class="text-base font-bold flex items-center gap-2">
                  <ListOrderedIcon class="w-5 h-5 text-primary" />
                  赛事最终名次排行 (Standings)
                </Card.Title>
                <Card.Description class="text-xs">
                  基于淘汰赛各轮次淘汰情况计算得出的选手最终名次。
                </Card.Description>
              </Card.Header>
              <Card.Content class="p-6 pt-0">
                <div
                  class="overflow-x-auto border border-border/50 rounded-xl bg-background/25"
                >
                  <table
                    class="w-full border-collapse text-left text-xs text-foreground/95"
                  >
                    <thead>
                      <tr
                        class="border-b border-border/50 bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground"
                      >
                        <th class="py-2.5 px-4 w-40">名次</th>
                        <th class="py-2.5 px-4">选手 (Player)</th>
                        <th class="py-2.5 px-4 text-center w-24">胜场/总场</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border/30">
                      {#each standings as item}
                        <tr class="hover:bg-background/40 transition-colors">
                          <td class="py-3 px-4 font-bold text-primary">
                            {item.rank}
                          </td>
                          <td class="py-3 px-4">
                            <span
                              class="flex items-center gap-1.5 font-semibold"
                            >
                              {#if item.team}
                                <span
                                  class="text-[10px] text-muted-foreground font-mono"
                                  >[{item.team}]</span
                                >
                              {/if}
                              <span>{item.display_name || item.id}</span>
                              {#if item.flag}
                                <span
                                  class="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground uppercase font-mono"
                                  >{item.flag}</span
                                >
                              {/if}
                            </span>
                          </td>
                          <td
                            class="py-3 px-4 text-center font-mono font-medium text-muted-foreground"
                          >
                            {item.matchesWon} / {item.matchesPlayed}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </Card.Content>
            </Card.Root>
          {/if}

          {@render bracketView()}
        </div>
        <div class="space-y-6">
          {@render rosterSidebar()}
        </div>
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
        <div
          class="space-y-3 p-4 rounded-xl border border-border bg-background/30 text-center"
        >
          <h4
            class="text-xs font-bold text-muted-foreground uppercase tracking-widest"
          >
            判定游戏获胜方 (败者晋级)
          </h4>
          <p class="text-[10px] text-muted-foreground/85 leading-normal">
            本比赛为“败者晋级杯赛”，星际2游戏获胜的一方记大分 1
            分并被淘汰，失败的一方记 0 分并晋级下一轮。请选择本局星际2游戏的<strong
              >获胜者</strong
            >：
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
        <div
          class="space-y-2.5 p-4 rounded-xl border border-border bg-destructive/5 text-center"
        >
          <h4
            class="text-xs font-bold text-destructive/80 uppercase tracking-widest"
          >
            弃权判定
          </h4>
          <p class="text-[10px] text-muted-foreground">
            若某方选手未能按时出席，可直接判定另一方弃权晋级下一轮。
          </p>
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
      <Button
        variant="ghost"
        size="sm"
        onclick={() => {
          showMatchDialog = false;
          selectedMatch = null;
        }}
        class="w-full text-xs h-8 cursor-pointer"
      >
        取消
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Dialog for ending voting and selecting final time -->
<Dialog.Root bind:open={showStatusTimeDialog}>
  <Dialog.Content class="max-w-[400px] bg-card border border-border">
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
      >
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
        <label
          for="final-time-input"
          class="text-xs font-bold text-muted-foreground"
          >确定的比赛时间 (支持输入自定义文字)</label
        >
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
          <span class="text-xs font-bold text-muted-foreground block"
            >根据投票结果快捷点选：</span
          >
          <div
            class="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-1"
          >
            {#each voteOptions as opt}
              {@const displayTime = opt.proposed_time.replace("T", " ")}
              <button
                type="button"
                onclick={() => (selectedFinalTime = displayTime)}
                class="flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-xs cursor-pointer text-left
                {selectedFinalTime === displayTime
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'bg-background/40 border-border hover:border-primary/40 hover:bg-background/80 text-foreground'}"
              >
                <span>{displayTime}</span>
                <Badge
                  variant="secondary"
                  class="bg-primary/20 text-primary font-bold text-[10px]"
                >
                  {opt.count} 票
                </Badge>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showStatusTimeDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={confirmEndVoting}
        class="w-full sm:w-auto text-xs font-bold"
      >
        确定并开启报名
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Match Replay Details Dialog -->
<Dialog.Root bind:open={showMatchDetailsDialog}>
  <Dialog.Content
    class="sm:max-w-[950px] w-[95vw] max-h-[85vh] overflow-y-auto bg-card border border-border p-6 flex flex-col gap-4"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold text-foreground flex items-center justify-between"
      >
        <span>比赛对局分析与录像</span>
        {#if selectedMatch}
          <span class="text-xs text-muted-foreground font-mono"
            >场次 {selectedMatch.position} • {playerName(
              selectedMatch.player1_id,
            )} vs {playerName(selectedMatch.player2_id)}</span
          >
        {/if}
      </Dialog.Title>
    </Dialog.Header>

    {#if loadingReplays}
      <div
        class="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground text-xs"
      >
        <div
          class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"
        ></div>
        <span>正在读取录像数据...</span>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
        <!-- Sidebar Replays List -->
        <div
          class="md:col-span-1 space-y-3 border-b md:border-b-0 md:border-r border-border pb-4 md:pb-0 md:pr-4"
        >
          <div class="flex items-center justify-between">
            <span
              class="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >录像场次</span
            >
            <span
              class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold"
              >{matchReplays.length} 局</span
            >
          </div>

          <div class="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
            {#each matchReplays as rep, idx}
              <button
                onclick={() => {
                  selectedReplay = rep;
                  activeReplayTab = "overview";
                }}
                class="w-full text-left text-xs p-2.5 rounded-xl border transition-all flex flex-col gap-1 cursor-pointer
                {selectedReplay?.id === rep.id
                  ? 'bg-primary/10 border-primary text-primary font-bold shadow'
                  : 'bg-background/40 border-border hover:bg-background/80 text-foreground'}"
              >
                <span class="truncate block font-semibold">Game {idx + 1}</span>
                <span class="text-[9px] text-muted-foreground truncate"
                  >{rep.map_name || "未知地图"}</span
                >
              </button>
            {/each}
            {#if matchReplays.length === 0}
              <p
                class="text-[11px] text-muted-foreground italic text-center py-4"
              >
                暂无录像
              </p>
            {/if}
          </div>

          <!-- Upload Area -->
          <div class="pt-2">
            <label
              class="w-full h-24 border border-dashed border-border/80 hover:border-primary/50 bg-background/30 hover:bg-background/50 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all p-3 text-center relative overflow-hidden"
              ondragover={(e) => e.preventDefault()}
              ondragenter={(e) => e.preventDefault()}
              ondrop={handleFileDrop}
            >
              <input
                type="file"
                accept=".SC2Replay"
                multiple
                onchange={handleFileUpload}
                disabled={uploadingReplays}
                class="hidden"
              />
              {#if uploadingReplays}
                <div
                  class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"
                ></div>
                <span class="text-[10px] text-muted-foreground"
                  >正在解析并保存...</span
                >
              {:else}
                <UploadCloudIcon
                  class="w-6 h-6 text-muted-foreground animate-pulse"
                />
                <span class="text-[10px] font-medium text-foreground"
                  >点击或拖拽上传</span
                >
                <span class="text-[8px] text-muted-foreground"
                  >仅限 .SC2Replay 格式</span
                >
              {/if}
            </label>
          </div>
        </div>

        <!-- Replay Content Area -->
        <div class="md:col-span-3 flex flex-col gap-3 min-h-[300px]">
          {#if selectedReplay}
            <!-- Mini Tab Bar -->
            <div
              class="flex gap-1 border-b border-border/60 pb-1.5 overflow-x-auto text-[11px]"
            >
              {#each [{ id: "overview", label: "对局概览", icon: FileTextIcon }, { id: "build_order", label: "建造顺序", icon: ListOrderedIcon }, { id: "curves", label: "农民折线", icon: TrendingUpIcon }, { id: "chat", label: "聊天历史", icon: MessageSquareIcon }] as tab}
                <button
                  onclick={() => (activeReplayTab = tab.id)}
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer
                  {activeReplayTab === tab.id
                    ? 'bg-primary text-primary-foreground font-bold shadow'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}"
                >
                  <tab.icon class="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              {/each}
            </div>

            <!-- Tab content: Overview -->
            {#if activeReplayTab === "overview"}
              <div class="space-y-4 pt-1">
                <div class="grid grid-cols-2 gap-3">
                  <div
                    class="p-3 bg-background/50 border border-border rounded-xl"
                  >
                    <p
                      class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider"
                    >
                      地图
                    </p>
                    <p class="text-sm font-bold mt-0.5 text-foreground">
                      {selectedReplay.map_name || "未知地图"}
                    </p>
                  </div>
                  <div
                    class="p-3 bg-background/50 border border-border rounded-xl"
                  >
                    <p
                      class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider"
                    >
                      游戏时长
                    </p>
                    <p class="text-sm font-bold mt-0.5 text-foreground">
                      {formatDuration(selectedReplay.game_length)}
                    </p>
                  </div>
                </div>

                <div
                  class="border border-border rounded-xl overflow-hidden bg-background/30"
                >
                  <div
                    class="p-2.5 bg-muted/20 border-b border-border/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                  >
                    对局结果
                  </div>
                  <div class="p-3 divide-y divide-border/40 space-y-2">
                    {#each selectedReplay.parsed_data?.teams || [] as team, tIdx}
                      {#each team.players || [] as player}
                        <div
                          class="flex items-center justify-between text-xs py-1.5 {tIdx ===
                          0
                            ? 'text-foreground'
                            : ''}"
                        >
                          <span class="font-semibold flex items-center gap-1.5">
                            <span
                              class="w-4 h-4 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-[8px] font-bold text-white uppercase"
                              >{player.name.slice(0, 1)}</span
                            >
                            {player.name}
                            <Badge
                              variant="outline"
                              class="text-[9px] px-1 py-0 border-primary/20 uppercase tracking-wider"
                              >{player.race}</Badge
                            >
                          </span>
                          {#if selectedReplay.winner === player.name}
                            <Badge
                              class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold"
                              >WINNER</Badge
                            >
                          {:else}
                            <span class="text-[10px] text-muted-foreground"
                              >LOSS</span
                            >
                          {/if}
                        </div>
                      {/each}
                    {/each}
                  </div>
                </div>

                <!-- Delete & Download Action -->
                <div
                  class="flex items-center gap-2 pt-2 border-t border-border/40"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => downloadReplay(selectedReplay.id)}
                    class="text-xs h-8 cursor-pointer border-primary/20 text-primary gap-1"
                  >
                    <DownloadIcon class="w-3.5 h-3.5" /> 下载 SC2Replay
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onclick={() => handleDeleteReplay(selectedReplay.id)}
                    class="text-xs h-8 cursor-pointer gap-1"
                  >
                    <TrashIcon class="w-3.5 h-3.5" /> 删除录像
                  </Button>
                </div>
              </div>

              <!-- Tab content: Build Order -->
            {:else if activeReplayTab === "build_order"}
              <div
                class="grid grid-cols-2 gap-4 flex-1 pt-1 max-h-[300px] overflow-y-auto pr-1"
              >
                {#each selectedReplay.parsed_data?.teams || [] as team, teamIdx}
                  {@const player = team.players?.[0]}
                  <div
                    class="space-y-2 bg-background/20 border border-border p-3 rounded-xl flex flex-col"
                  >
                    <div
                      class="flex items-center justify-between border-b border-border/40 pb-1"
                    >
                      <span
                        class="font-bold text-xs text-foreground truncate block"
                        >{player?.name || "Player"}</span
                      >
                      <Badge
                        variant="outline"
                        class="text-[9px] uppercase tracking-wider shrink-0"
                        >{player?.race || "?"}</Badge
                      >
                    </div>
                    <div
                      class="space-y-1.5 overflow-y-auto max-h-[220px] text-[10px] pr-1"
                    >
                      {#each (player?.build_order || []).filter((item) => !item.is_worker) as bo}
                        <div
                          class="flex items-center justify-between py-1 border-b border-border/10"
                        >
                          <span class="font-medium text-foreground truncate"
                            >{bo.unit}</span
                          >
                          <div
                            class="flex items-center gap-2 shrink-0 font-mono text-muted-foreground"
                          >
                            {#if bo.supply}
                              <span>{bo.supply} </span>
                            {/if}
                            <span>{formatDuration(bo.start_time)}</span>
                          </div>
                        </div>
                      {/each}
                      {#if (player?.build_order || []).length === 0}
                        <p
                          class="text-center italic text-muted-foreground/60 py-4"
                        >
                          无建造顺序记录
                        </p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Tab content: Curves -->
            {:else if activeReplayTab === "curves"}
              <div class="space-y-3 pt-1 flex-1 flex flex-col justify-between">
                <div
                  class="flex items-center justify-between text-[10px] text-muted-foreground font-semibold"
                >
                  <span>横轴：时间 (分钟) • 纵轴：农民数 (人)</span>
                  <div class="flex gap-3">
                    <span class="flex items-center gap-1"
                      ><span class="w-2.5 h-1 bg-blue-500 rounded"></span>
                      {selectedReplay.parsed_data.teams?.[0]?.players?.[0]
                        ?.name}</span
                    >
                    <span class="flex items-center gap-1"
                      ><span class="w-2.5 h-1 bg-rose-500 rounded"></span>
                      {selectedReplay.parsed_data.teams?.[1]?.players?.[0]
                        ?.name}</span
                    >
                  </div>
                </div>

                <div
                  class="w-full bg-background/50 border border-border rounded-xl p-4 flex items-center justify-center flex-1"
                >
                  {#if selectedReplay.parsed_data.teams?.[0]?.players?.[0]?.workers_curve?.length > 0}
                    {@const c1 =
                      selectedReplay.parsed_data.teams[0].players[0]
                        .workers_curve}
                    {@const c2 =
                      selectedReplay.parsed_data.teams[1]?.players?.[0]
                        ?.workers_curve || []}
                    {@const totalDurMin = selectedReplay.game_length / 60}
                    {@const maxWorkers = 80}
                    <svg
                      viewBox="0 0 500 200"
                      class="w-full h-44 overflow-visible"
                    >
                      <!-- Grid lines -->
                      <line
                        x1="0"
                        y1="200"
                        x2="500"
                        y2="200"
                        stroke="#333"
                        stroke-width="1.5"
                      />
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="200"
                        stroke="#333"
                        stroke-width="1.5"
                      />
                      <line
                        x1="0"
                        y1="100"
                        x2="500"
                        y2="100"
                        stroke="#222"
                        stroke-dasharray="3,3"
                      />
                      <line
                        x1="0"
                        y1="50"
                        x2="500"
                        y2="50"
                        stroke="#222"
                        stroke-dasharray="3,3"
                      />
                      <line
                        x1="0"
                        y1="150"
                        x2="500"
                        y2="150"
                        stroke="#222"
                        stroke-dasharray="3,3"
                      />

                      <!-- Path 1 (Blue) -->
                      <polyline
                        fill="none"
                        stroke="#3b82f6"
                        stroke-width="2.5"
                        points={getSvgPath(
                          c1,
                          500,
                          200,
                          totalDurMin,
                          maxWorkers,
                        )}
                      />
                      <!-- Path 2 (Red) -->
                      {#if c2.length > 0}
                        <polyline
                          fill="none"
                          stroke="#f43f5e"
                          stroke-width="2.5"
                          points={getSvgPath(
                            c2,
                            500,
                            200,
                            totalDurMin,
                            maxWorkers,
                          )}
                        />
                      {/if}
                    </svg>
                  {:else}
                    <p class="text-xs text-muted-foreground italic">
                      本局无追踪指标，无法渲染农民图表。
                    </p>
                  {/if}
                </div>
              </div>

              <!-- Tab content: Chat -->
            {:else if activeReplayTab === "chat"}
              <div
                class="border border-border bg-background/40 rounded-xl p-3 flex-1 overflow-y-auto max-h-[300px] text-[11px] space-y-2.5 font-mono"
              >
                {#each selectedReplay.parsed_data?.chat || [] as msg}
                  <div class="flex items-start gap-1.5 leading-normal">
                    <span class="text-muted-foreground shrink-0"
                      >[{formatDuration(msg.time)}]</span
                    >
                    <span class="font-bold text-primary shrink-0"
                      >{msg.player}:</span
                    >
                    <span class="text-foreground break-all">{msg.text}</span>
                  </div>
                {/each}
                {#if (selectedReplay.parsed_data?.chat || []).length === 0}
                  <p class="text-center italic text-muted-foreground/60 py-8">
                    本局没有聊天记录
                  </p>
                {/if}
              </div>
            {/if}
          {:else}
            <!-- Empty state -->
            <div
              class="flex-1 border border-dashed border-border rounded-xl bg-background/20 flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3"
            >
              <FileTextIcon class="w-10 h-10 text-muted-foreground/50" />
              <div>
                <h4 class="text-xs font-bold text-foreground">
                  未关联任何录像
                </h4>
                <p class="text-[10px] text-muted-foreground mt-0.5">
                  请通过左侧面板的上传入口上传此场比赛的 `.SC2Replay`
                  录像文件进行入库。
                </p>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <Dialog.Footer
      class="mt-2 border-t border-border pt-3 flex flex-row items-center justify-between gap-3"
    >
      {#if tournament.status === "in_progress"}
        <Button
          variant="outline"
          size="sm"
          onclick={() => {
            showMatchDetailsDialog = false;
            showMatchDialog = true;
          }}
          class="text-xs h-8 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 cursor-pointer"
        >
          修改比分 / 重新填报
        </Button>
      {/if}
      <Button
        variant="ghost"
        size="sm"
        onclick={() => {
          showMatchDetailsDialog = false;
          selectedMatch = null;
          matchReplays = [];
          selectedReplay = null;
        }}
        class="text-xs h-8 cursor-pointer"
      >
        关闭面板
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Liquipedia Wiki Export Dialog -->
<Dialog.Root bind:open={showWikiDialog}>
  <Dialog.Content
    class="max-w-[500px] bg-card border border-border p-6 flex flex-col gap-4"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold text-foreground flex items-center gap-2"
      >
        <FileTextIcon class="w-5 h-5 text-primary" />
        Liquipedia Wiki 代码导出
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        为您自动统计赛事结果、比分及录像分析数据，生成匹配的 Liquipedia Bracket
        格式代码。
      </Dialog.Description>
    </Dialog.Header>

    {#if loadingWiki}
      <div
        class="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground text-xs"
      >
        <div
          class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"
        ></div>
        <span>正在编译生成代码...</span>
      </div>
    {:else}
      <div class="space-y-4">
        <div class="relative">
          <textarea
            readonly
            value={generatedWikiText}
            class="w-full h-64 bg-background border border-border rounded-xl p-3 text-[10px] font-mono text-foreground focus-visible:outline-none resize-none"
          ></textarea>
        </div>

        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => (showWikiDialog = false)}
            class="flex-1 text-xs h-9 cursor-pointer"
          >
            取消
          </Button>
          <Button
            size="sm"
            onclick={copyWikiToClipboard}
            class="flex-1 text-xs font-semibold h-9 cursor-pointer gap-1.5"
          >
            <CopyIcon class="w-3.5 h-3.5" /> 复制 Wiki 代码
          </Button>
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<!-- Participant Profile Edit Dialog -->
<Dialog.Root bind:open={showPlayerEditDialog}>
  <Dialog.Content
    class="max-w-[420px] bg-card border border-border p-6 flex flex-col gap-4"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-base font-bold text-foreground flex items-center gap-2"
      >
        <SettingsIcon class="w-5 h-5 text-primary" />
        编辑选手资料
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        配置选手的展示名称、国籍、战队前缀等 Liquipedia Wiki 导出字段。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <!-- ID -->
      <div class="space-y-1.5">
        <label
          for="edit-player-id"
          class="text-xs font-bold text-muted-foreground"
          >选手唯一 ID (Player ID)</label
        >
        <Input
          id="edit-player-id"
          bind:value={editPlayerNewId}
          placeholder="选手唯一 ID（修改后会自动刷新全库所有对局和记录）"
          class="bg-background border-border text-foreground text-xs"
        />
      </div>

      <!-- BattleTags -->
      <div class="space-y-2.5">
        <span class="text-xs font-bold text-muted-foreground"
          >游戏 BattleTags</span
        >
        <div
          class="grid grid-cols-1 gap-3 bg-muted/20 border border-border/60 p-3 rounded-lg"
        >
          <!-- CN Server -->
          <div class="space-y-1.5">
            <span
              class="text-[10px] font-bold text-muted-foreground flex items-center justify-between"
            >
              <span>中国服务器 (CN)</span>
              <span class="text-[9px] text-muted-foreground/60 font-normal"
                >已添加 {editPlayerBattleTags.cn.length} 个</span
              >
            </span>
            <div
              class="flex flex-wrap gap-1 min-h-[30px] p-1.5 rounded bg-background/50 border border-border"
            >
              {#each editPlayerBattleTags.cn as tag, idx}
                <Badge
                  variant="secondary"
                  class="text-[9px] font-mono py-0 px-1.5 bg-muted border border-border/80 text-foreground flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onclick={() =>
                      (editPlayerBattleTags.cn = editPlayerBattleTags.cn.filter(
                        (_, i) => i !== idx,
                      ))}
                    class="text-muted-foreground hover:text-destructive font-bold text-xs cursor-pointer"
                    >&times;</button
                  >
                </Badge>
              {/each}
              {#if editPlayerBattleTags.cn.length === 0}
                <span
                  class="text-[9px] text-muted-foreground/50 italic self-center px-1"
                  >暂无账号</span
                >
              {/if}
            </div>
            <div class="flex gap-1">
              <Input
                type="text"
                placeholder="例如: Bnet#1234"
                id="edit-add-cn-input"
                class="bg-background border-border text-foreground text-xs h-7 flex-1"
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if (val && !editPlayerBattleTags.cn.includes(val)) {
                      editPlayerBattleTags.cn = [
                        ...editPlayerBattleTags.cn,
                        val,
                      ];
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="w-7 h-7 border-border shrink-0 cursor-pointer"
                onclick={() => {
                  const input = document.getElementById("edit-add-cn-input");
                  const val = input.value.trim();
                  if (val && !editPlayerBattleTags.cn.includes(val)) {
                    editPlayerBattleTags.cn = [...editPlayerBattleTags.cn, val];
                    input.value = "";
                  }
                }}
              >
                <PlusIcon class="w-3 h-3" />
              </Button>
            </div>
          </div>

          <!-- Global Server -->
          <div class="space-y-1.5">
            <span
              class="text-[10px] font-bold text-muted-foreground flex items-center justify-between"
            >
              <span>国际服务器 (Global)</span>
              <span class="text-[9px] text-muted-foreground/60 font-normal"
                >已添加 {editPlayerBattleTags.global.length} 个</span
              >
            </span>
            <div
              class="flex flex-wrap gap-1 min-h-[30px] p-1.5 rounded bg-background/50 border border-border"
            >
              {#each editPlayerBattleTags.global as tag, idx}
                <Badge
                  variant="secondary"
                  class="text-[9px] font-mono py-0 px-1.5 bg-muted border border-border/80 text-foreground flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onclick={() =>
                      (editPlayerBattleTags.global =
                        editPlayerBattleTags.global.filter(
                          (_, i) => i !== idx,
                        ))}
                    class="text-muted-foreground hover:text-destructive font-bold text-xs cursor-pointer"
                    >&times;</button
                  >
                </Badge>
              {/each}
              {#if editPlayerBattleTags.global.length === 0}
                <span
                  class="text-[9px] text-muted-foreground/50 italic self-center px-1"
                  >暂无账号</span
                >
              {/if}
            </div>
            <div class="flex gap-1">
              <Input
                type="text"
                placeholder="例如: Bnet#9012"
                id="edit-add-global-input"
                class="bg-background border-border text-foreground text-xs h-7 flex-1"
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if (val && !editPlayerBattleTags.global.includes(val)) {
                      editPlayerBattleTags.global = [
                        ...editPlayerBattleTags.global,
                        val,
                      ];
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="w-7 h-7 border-border shrink-0 cursor-pointer"
                onclick={() => {
                  const input = document.getElementById(
                    "edit-add-global-input",
                  );
                  const val = input.value.trim();
                  if (val && !editPlayerBattleTags.global.includes(val)) {
                    editPlayerBattleTags.global = [
                      ...editPlayerBattleTags.global,
                      val,
                    ];
                    input.value = "";
                  }
                }}
              >
                <PlusIcon class="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label for="edit-flag" class="text-xs font-bold text-muted-foreground"
            >国籍/地区 (Flag)</label
          >
          <Input
            id="edit-flag"
            bind:value={editPlayerFlag}
            placeholder="例如: cn, hk, tw"
            class="bg-background border-border text-foreground text-xs"
          />
        </div>
        <div class="space-y-1.5">
          <label for="edit-team" class="text-xs font-bold text-muted-foreground"
            >战队前缀 (Team Tag)</label
          >
          <Input
            id="edit-team"
            bind:value={editPlayerTeam}
            placeholder="例如: AlphaX"
            class="bg-background border-border text-foreground text-xs"
          />
        </div>
      </div>

      <!-- Battle.net IDs (Read-only) -->
      <div class="space-y-1.5">
        <span class="text-xs font-bold text-muted-foreground block"
          >已关联游戏账号 (Battle.net IDs) (只读，来自录像上传)</span
        >
        <div
          class="flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-xl border border-border bg-background/30"
        >
          {#each editPlayerBnetIds as account}
            <Badge
              variant="secondary"
              class="text-xs py-0.5 px-2 bg-muted/65 border border-border/60 text-foreground font-mono"
            >
              {#if account.url}
                <a
                  href={account.url}
                  target="_blank"
                  rel="noopener"
                  class="text-primary hover:underline">{account.id} ↗</a
                >
              {:else}
                {account.id}
              {/if}
            </Badge>
          {/each}
          {#if editPlayerBnetIds.length === 0}
            <span
              class="text-[10px] text-muted-foreground/60 italic self-center px-1"
              >暂无关联的游戏账号（将通过录像上传自动匹配并关联）</span
            >
          {/if}
        </div>
      </div>

      <!-- Wiki Link -->
      <div class="space-y-1.5">
        <label for="edit-link" class="text-xs font-bold text-muted-foreground"
          >Wiki 个人页链接 (Link)</label
        >
        <Input
          id="edit-link"
          bind:value={editPlayerLink}
          placeholder="例如: User:Bnet"
          class="bg-background border-border text-foreground text-xs"
        />
        <p class="text-[10px] text-muted-foreground/60">
          Liquipedia Wiki 页面名称，最终将链接至
          https://liquipedia.net/starcraft2/&lt;名称&gt;
        </p>
      </div>
    </div>

    <Dialog.Footer class="flex flex-col sm:flex-row gap-2 mt-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showPlayerEditDialog = false)}
        class="w-full sm:w-auto text-xs"
      >
        取消
      </Button>
      <Button
        size="sm"
        onclick={handleSavePlayer}
        class="w-full sm:w-auto text-xs font-bold"
      >
        保存资料
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Dialog for manual mapping of unmapped replays -->
<Dialog.Root bind:open={showUnmappedDialog}>
  <Dialog.Content
    class="max-w-[550px] bg-card border border-border p-6 flex flex-col gap-4"
  >
    <Dialog.Header>
      <Dialog.Title
        class="text-lg font-bold text-foreground flex items-center gap-2"
      >
        <UsersIcon class="w-5 h-5 text-amber-500" />
        手动关联录像账号
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        以下为录像解析中未识别的 Battle.net
        ID。请将它们绑定至对应的参赛选手，绑定后系统将自动重新解析并导入受影响的录像。
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 max-h-[350px] overflow-y-auto pr-1 py-1">
      {#each getUnrecognizedIds(unmappedReplays) as bnetId}
        <div
          class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-background/30"
        >
          <span class="font-mono text-sm font-bold text-amber-500 break-all"
            >{bnetId}</span
          >
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-muted-foreground shrink-0"
              >对应选手:</span
            >
            <select
              bind:value={tempBnetMappings[bnetId]}
              class="bg-background border border-border text-foreground text-xs rounded-lg p-2 focus-visible:outline-none min-w-[200px]"
            >
              <option value="">-- 选择参赛选手 --</option>
              {#each getAvailablePlayersForBnet(bnetId) as p}
                <option value={p.id}>{p.display_name} ({p.id})</option>
              {/each}
            </select>
          </div>
        </div>
      {/each}
    </div>

    <Dialog.Footer
      class="mt-2 border-t border-border pt-3 flex flex-row items-center justify-between gap-3"
    >
      <Button
        variant="ghost"
        size="sm"
        onclick={() => {
          showUnmappedDialog = false;
          unmappedReplays = [];
          tempBnetMappings = {};
        }}
        class="text-xs h-8 cursor-pointer"
      >
        关闭窗口
      </Button>
      <Button
        size="sm"
        onclick={submitAllManualMappings}
        class="text-xs font-bold px-4 h-8 cursor-pointer"
      >
        保存并重新解析
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
