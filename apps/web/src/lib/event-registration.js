// Registration and seeding actions of the event page. `ctx` gives the
// page's state: tid(), tournament(), setTournament(t), seedOrder(),
// setSeedOrder(ids), isAdmin(), load(), refreshPreview(), ensureAdmin(),
// needsIdentity().

import { toast } from "svelte-sonner";
import { API } from "$lib/api.js";
import { userState } from "$lib/user.svelte.js";

export function registrationActions(ctx) {
  // Registration. targetId: another player (admins); "" registers the
  // visitor. Resolves to true once registered.
  async function doRegister(targetId = "") {
    targetId = String(targetId || "").trim();
    if (targetId && targetId !== userState.id && !ctx.ensureAdmin()) return;
    if (!targetId && ctx.needsIdentity()) return;
    const id = targetId || userState.id;
    if (!id) return toast.error("请输入选手 ID");
    try {
      const players = await API.register(ctx.tid(), id);
      ctx.setTournament({ ...ctx.tournament(), players });
      toast.success(`选手 ${id} 报名成功`);
      await ctx.load();
      if (ctx.isAdmin()) await ctx.refreshPreview();
      return true;
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function doBatchRegister(ids = []) {
    if (!ctx.ensureAdmin()) return;
    if (ids.length === 0) return toast.error("请先选择选手");
    let ok = 0;
    const errors = [];
    for (const id of ids) {
      try {
        await API.register(ctx.tid(), id);
        ok += 1;
      } catch (e) {
        errors.push(`${id}: ${e.message}`);
      }
    }
    await ctx.load();
    try {
      await ctx.refreshPreview();
    } catch (e) {
      console.warn("bracket regeneration failed:", e);
    }
    if (ok > 0) toast.success(`已批量报名 ${ok} 人`);
    if (errors.length > 0) toast.error(errors[0]);
  }

  async function doUnregister(pid) {
    if (pid !== userState.id) {
      if (!ctx.ensureAdmin()) return;
    } else if (ctx.needsIdentity()) return;
    try {
      await API.unregister(ctx.tid(), pid);
      toast.success(`选手 ${pid} 已取消报名`);
      await ctx.load();
      if (ctx.isAdmin()) await ctx.refreshPreview();
      else ctx.setTournament({ ...ctx.tournament(), matches: [] });
    } catch (e) {
      toast.error(e.message);
    }
  }

  // Seeds
  async function autoSeed() {
    if (!ctx.ensureAdmin()) return;
    try {
      await API.autoSeeds(ctx.tid());
      await ctx.load();
      toast.success("已按天梯 MMR 自动重排种子");
    } catch (e) {
      toast.error("自动排序失败: " + e.message);
    }
  }

  async function randomizeSeed() {
    if (!ctx.ensureAdmin()) return;
    if (!confirm("随机微调会打乱 MMR 相近的选手（保留前 2 和后 2 名），继续？")) return;
    try {
      await API.randomizeSeeds(ctx.tid(), { band: 80, keep_top: 2, keep_bottom: 2 });
      await ctx.load();
      toast.success("已在相近分段内随机微调种子");
    } catch (e) {
      toast.error("随机微调失败: " + e.message);
    }
  }

  async function moveSeed(idx, dir) {
    if (!ctx.ensureAdmin()) return;
    const target = idx + dir;
    const order = [...ctx.seedOrder()];
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    ctx.setSeedOrder(order);
    try {
      await API.setSeeds(ctx.tid(), order);
      // Reload so the seed panel keeps the ladder MMR/tier fields and the
      // preview stays in sync with the server-side seed order.
      await ctx.load();
    } catch (e) {
      toast.error("保存种子排序失败: " + e.message);
    }
  }

  return { doRegister, doBatchRegister, doUnregister, autoSeed, randomizeSeed, moveSeed };
}
