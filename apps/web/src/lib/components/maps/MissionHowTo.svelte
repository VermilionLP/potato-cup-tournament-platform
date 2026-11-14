<script>
  // How to make a custom battle room with a 比赛地图 link.
  let { class: className = "" } = $props();
</script>

<ol class="list-decimal space-y-1 pl-5 text-sm leading-relaxed {className}">
  <li>在地图卡片上点「复制开房链接」（以 http:// 开头；游戏不接受 https:// 的链接）。</li>
  <li>游戏里：菜单 → 自定义战斗 → 创建房间 → Missions by URL。</li>
  <li>点「添加任务」，起个名字，把链接粘贴进去（看不到添加按钮时，先把 URL 一栏标为收藏）。</li>
  <li>开始任务，房间就建好了，对手在自定义战斗列表里加入。</li>
</ol>
<p class="mt-2 text-small text-muted-foreground">开房的账号需要有创建自定义战斗的权限。地图由开房玩家的游戏直接从本站下载。</p>
