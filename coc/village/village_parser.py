#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
天择网 · COC 村庄存档解析脚本  village_parser.py
================================================
功能：读取一个部落冲突（Clash of Clans）村庄存档 JSON，结合游戏静态数据，
      输出结构化中文报告，包括：
        1. 村庄概况（玩家标签、采集时间、家乡/夜世界大本营等级、建筑工人数）
        2. 家乡与夜世界按单位类型分类的完整清单
        3. 各类单位到达当前大本营满级的「剩余升级时间」汇总

用法：
    python village_parser.py <村庄JSON路径> [游戏数据JSON路径]

参数：
    村庄JSON路径      必填。从游戏中导出的村庄存档 JSON 文件。
    游戏数据JSON路径  可选。默认使用同目录 ../data/all_game_data_zh.json。
                      可从天择网「数据开源」下载：单位完整数据.json

示例：
    python village_parser.py my_village.json
    python village_parser.py my_village.json all_game_data_zh.json

说明：
    - 所有计算在本地完成，不上传任何数据。
    - 装备(90000xxx)与帮手(93000xxx)的 ID→中文名映射内置在本脚本中
      （由 character_items.csv 顺序推导）。
    - 升级时间两套语义：
        · 建筑/陷阱 BuildTime = 「升到该级」的时间，累加 levels[cur .. tgt-1]
        · 兵种/法术/英雄 UpgradeTime = 「从该级升下一级」的时间，累加 levels[cur-1 .. tgt-2]
    - 免费使用、不限用途。数据来自公开渠道整理，不含任何玩家隐私。

作者：天择网  ·  https://wjtianze.github.io/
"""

import json
import sys
import os
import datetime

# ===== 装备 ID(90000xxx) -> 中文名/英雄（由 character_items.csv 顺序推导） =====
EQUIP_MAP = {
    90000000:("野蛮人木偶","蛮王"),90000001:("狂暴药水瓶","蛮王"),90000002:("弓箭手木偶","女王"),
    90000003:("隐形药水瓶","女王"),90000004:("永恒书卷","永王"),90000005:("生命宝石","永王"),
    90000006:("寻踪飞盾","闰土"),90000007:("皇家宝石","闰土"),90000008:("地震金靴","蛮王"),
    90000009:("野猪骑士木偶","闰土"),90000010:("巨型手套","蛮王"),90000011:("治疗胡须","蛮王"),
    90000012:("急速药水瓶","闰土"),90000013:("火箭飞矛","闰土"),90000014:("尖刺足球","蛮王"),
    90000015:("冰封箭矢","女王"),90000016:("擎天箭矢","女王"),90000017:("巨型箭矢","女王"),
    90000019:("英雄火炬","永王"),90000020:("天使木偶","女王"),90000022:("巨大火球","永王"),
    90000024:("狂暴宝石","永王"),90000032:("灵蛇手镯","蛮王"),90000034:("治疗书卷","永王"),
    90000035:("暗黑皇冠","王子"),90000039:("克隆魔镜","女王"),90000040:("雷电战靴","闰土"),
    90000041:("熔岩气球玩偶","永王"),90000042:("护卫玩偶","王子"),90000043:("暗黑魔球","王子"),
    90000044:("铁甲短裤","王子"),90000047:("贵族哑铃","王子"),90000048:("动作人偶","女王"),
    90000049:("陨石法杖","王子"),90000050:("冷冽冰晶","闰土"),90000051:("木棍马驹","蛮王"),
    90000052:("烈焰之心","龙王"),90000053:("火箭背包","龙王"),90000056:("爆震器","龙王"),
    90000057:("助燃器","龙王"),90000059:("雷电獠牙","龙王"),90000060:("Draconic Counter","龙王"),
}
HELPER_MAP = {
    93000000:"建筑工人学徒", 93000001:"实验助手",
    93000002:"炼金术士",     93000003:"探矿者",
}


def num(v):
    try:
        v = int(v)
        return v
    except (TypeError, ValueError):
        return 0


def fmt_dur(sec):
    sec = max(0, int(round(sec)))
    d, sec = divmod(sec, 86400)
    h, sec = divmod(sec, 3600)
    m, s = divmod(sec, 60)
    p = []
    if d: p.append(f"{d}天")
    if h: p.append(f"{h}时")
    if m: p.append(f"{m}分")
    if not p: p.append(f"{s}秒")
    return "".join(p)


def load_game(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_idmap(units):
    idm = {}
    for u in units:
        gid = str(u.get("globalID", "")).strip()
        if gid:
            idm[gid] = u
    return idm


def name_of(data_id, idm):
    u = idm.get(str(data_id))
    if u and u.get("chineseName"):
        return u["chineseName"]
    if data_id in EQUIP_MAP:
        return EQUIP_MAP[data_id][0]
    if data_id in HELPER_MAP:
        return HELPER_MAP[data_id]
    return f"ID{data_id}"


def unit_of(data_id, idm):
    return idm.get(str(data_id))


def cat_of(data_id, idm):
    u = idm.get(str(data_id))
    return u["category"] if u else ""


def is_bb_cat(cat):
    return bool(cat) and cat.startswith("夜世界")


# ===== 升级时间计算 =====
def build_time_sec(row):
    if not row: return 0
    return (num(row.get("BuildTimeD")) * 86400 + num(row.get("BuildTimeH")) * 3600
            + num(row.get("BuildTimeM")) * 60 + num(row.get("BuildTimeS")))


def upgrade_time_sec(row):
    if not row: return 0
    return num(row.get("UpgradeTimeH")) * 3600 + num(row.get("UpgradeTimeM")) * 60


def th_of(row):
    if not row: return 99
    for k in ("requiredTownHallLevel", "RequiredTownHallLevel", "TownHallLevel"):
        if k in row and row[k] is not None:
            return num(row[k])
    return 99


def max_level_for_th(unit, th):
    if not unit or not unit.get("levels"):
        return 0
    m = 0
    for r in unit["levels"]:
        if th_of(r) <= th and num(r.get("level")) > m:
            m = num(r.get("level"))
    return m


def upgrade_sec(unit, cur, tgt, is_building):
    """从 cur 级升到 tgt 级的总秒数（按 level 字段查找，兼容等级不连续的单位）。
    建筑/陷阱：某级 row 的 BuildTime = 升到该级的时间 → 累加 level∈[cur+1, tgt]
    兵种/法术/英雄：某级 row 的 UpgradeTime = 从该级升下一级的时间 → 累加 level∈[cur, tgt-1]
    """
    if not unit or not unit.get("levels"):
        return 0
    lmap = {}
    for r in unit["levels"]:
        lv = num(r.get("level"))
        if lv:
            lmap[lv] = r
    total = 0
    if is_building:
        for L in range(cur + 1, tgt + 1):
            r = lmap.get(L)
            if not r:
                break
            total += build_time_sec(r)
    else:
        for L in range(cur, tgt):
            r = lmap.get(L)
            if not r:
                break
            total += upgrade_time_sec(r)
    return total


def lane_of(cat, world):
    bb = is_bb_cat(cat)
    if any(k in cat for k in ("建筑", "陷阱", "守卫")):
        return "bb_builder" if bb else "home_builder"
    if any(k in cat for k in ("兵", "法术", "攻城机器")):
        return "bb_lab" if bb else "home_lab"
    if "英雄" in cat:
        return "bb_hero" if bb else "home_hero"
    if "战宠" in cat:
        return "home_pet"
    return None


# ===== 村庄解析 =====
def detect_th(v, idm):
    th = 0
    for b in v.get("buildings", []):
        if "weapon" in b:
            th = b["lvl"]
    if not th:
        for b in v.get("buildings", []):
            if "大本营" in name_of(b["data"], idm):
                th = b["lvl"]
    return th


def detect_bh(v, idm):
    bh = 0
    for b in v.get("buildings2", []):
        if "大本营" in name_of(b["data"], idm):
            bh = b["lvl"]
    return bh


def builder_count(v, idm):
    n = 0
    for b in v.get("buildings", []):
        if "建筑工人小屋" in name_of(b["data"], idm):
            n += b.get("cnt", 1)
    return n or 5


def bb_builder_count(v, idm):
    n = 0
    for b in v.get("buildings2", []):
        nm = name_of(b["data"], idm)
        if any(k in nm for k in ("工人", "博仔", "奥仔", "控制室")):
            n += b.get("cnt", 1)
    return n or 5


def compute_tasks(v, idm, th, bh):
    """返回待升级任务列表，每项含 name/curLvl/maxLvl/sec/cat/world/upgrading。"""
    tasks = []
    bid = [0]

    def push(item, is_building, world, upgrading=False):
        unit = unit_of(item["data"], idm)
        if not unit or not unit.get("levels"):
            return
        cur = item["lvl"]
        max_l = max_level_for_th(unit, bh if world == "bb" else th)
        if max_l <= 0 or cur >= max_l:
            return
        sec = upgrade_sec(unit, cur, max_l, is_building)
        if sec <= 0:
            return
        bid[0] += 1
        tasks.append({
            "id": bid[0], "name": name_of(item["data"], idm), "curLvl": cur,
            "maxLvl": max_l, "sec": sec, "isBuilding": is_building,
            "cat": cat_of(item["data"], idm), "world": world, "upgrading": upgrading,
        })

    for it in v.get("units", []):          push(it, False, "home")
    for it in v.get("siege_machines", []): push(it, False, "home")
    for it in v.get("spells", []):         push(it, False, "home")
    for it in v.get("heroes", []):         push(it, False, "home", bool(it.get("timer")))
    for it in v.get("pets", []):           push(it, False, "home")
    for it in v.get("buildings", []):      push(it, True,  "home", bool(it.get("timer")))
    for it in v.get("traps", []):          push(it, True,  "home")
    for it in v.get("units2", []):         push(it, False, "bb")
    for it in v.get("heroes2", []):        push(it, False, "bb")
    for it in v.get("buildings2", []):     push(it, True,  "bb", bool(it.get("timer")))
    for it in v.get("traps2", []):         push(it, True,  "bb")
    return tasks


# ===== 报告输出 =====
def print_section(title):
    print()
    print("=" * 56)
    print(title)
    print("=" * 56)


def print_cat(emoji, title, items, idm, is_equipment=False, is_helper=False):
    if not items:
        print(f"  {emoji} {title}：无")
        return
    print(f"  {emoji} {title}（{len(items)} 项）：")
    for it in items:
        if is_equipment:
            info = EQUIP_MAP.get(it["data"], (f"ID{it['data']}", "?"))
            tag = " 满级" if it["lvl"] >= 18 else ""
            print(f"     · {info[0]}（{info[1]}）{it['lvl']}级{tag}")
        elif is_helper:
            nm = HELPER_MAP.get(it["data"], f"ID{it['data']}")
            cd = f" 冷却{fmt_dur(it['helper_cooldown'])}" if it.get("helper_cooldown") else ""
            print(f"     · {nm} {it['lvl']}级{cd}")
        else:
            nm = name_of(it["data"], idm)
            tags = []
            if it.get("gear_up"): tags.append("改造")
            if "weapon" in it: tags.append(f"武器{it['weapon']}")
            if it.get("extra"): tags.append("超级兵")
            if it.get("timer"): tags.append(f"升级中{fmt_dur(it['timer'])}")
            cnt = f" ×{it['cnt']}" if it.get("cnt") and it["cnt"] > 1 else ""
            tagstr = f"  [{','.join(tags)}]" if tags else ""
            print(f"     · {nm}{cnt} {it['lvl']}级{tagstr}")


def report(v, idm, th, bh, tasks):
    print_section("【村庄概况】")
    ts = v.get("timestamp", 0)
    dt = datetime.datetime.fromtimestamp(ts) if ts else None
    print(f"  玩家标签：{v.get('tag', '-')}")
    print(f"  采集时间：{dt.strftime('%Y-%m-%d %H:%M:%S') if dt else '-'}")
    print(f"  家乡大本营：{th} 本")
    print(f"  夜世界大本营：{bh if bh else '未建'}{(' 本') if bh else ''}")
    print(f"  家乡建筑工人：{builder_count(v, idm)} 个")
    print(f"  夜世界建筑工人：{bb_builder_count(v, idm)} 个")
    print(f"  待升级任务：{len(tasks)} 项")

    print_section("【家乡 · Home Village】")
    print_cat("👑", "英雄", v.get("heroes", []), idm)
    print_cat("⚔️", "兵种", v.get("units", []), idm)
    print_cat("🛒", "攻城机器", v.get("siege_machines", []), idm)
    print_cat("✨", "法术", v.get("spells", []), idm)
    print_cat("🐾", "战宠", v.get("pets", []), idm)
    print_cat("🛡️", "英雄装备", v.get("equipment", []), idm, is_equipment=True)
    print_cat("🏰", "建筑", v.get("buildings", []), idm)
    print_cat("🪤", "陷阱", v.get("traps", []), idm)
    print_cat("🧰", "帮手", v.get("helpers", []), idm, is_helper=True)

    print_section("【夜世界 · Builder Base】")
    print_cat("👑", "英雄", v.get("heroes2", []), idm)
    print_cat("⚔️", "兵种", v.get("units2", []), idm)
    print_cat("🏰", "建筑", v.get("buildings2", []), idm)
    print_cat("🪤", "陷阱", v.get("traps2", []), idm)

    print_section("【剩余升级时间（到达当前大本营满级）】")
    groups = {
        "home_builder": ("家乡·建筑工人", 0, 0), "home_lab": ("家乡·实验室", 0, 0),
        "home_hero": ("家乡·英雄殿堂", 0, 0), "home_pet": ("家乡·战宠小屋", 0, 0),
        "bb_builder": ("夜世界·建筑工人", 0, 0), "bb_lab": ("夜世界·实验室", 0, 0),
        "bb_hero": ("夜世界·英雄", 0, 0),
    }
    g = {k: list(v) for k, v in groups.items()}
    total = 0
    for t in tasks:
        k = lane_of(t["cat"], t["world"])
        if k in g:
            g[k][1] += t["sec"]; g[k][2] += 1
        total += t["sec"]
    print(f"  剩余升级总时长（串行）：{fmt_dur(total)}")
    print(f"  待升级任务数：{len(tasks)} 项")
    print()
    print(f"  {'资源类别':<18}{'任务数':<8}{'剩余时长':<14}")
    print(f"  {'-'*18}{'-'*8}{'-'*14}")
    for k in ["home_builder", "home_lab", "home_hero", "home_pet", "bb_builder", "bb_lab", "bb_hero"]:
        label, sec, n = g[k]
        if n:
            print(f"  {label:<18}{n:<8}{fmt_dur(sec):<14}")

    print()
    print("（已满级或当前大本营尚未解锁的单位不计入；城墙升级无时间成本，不计入）")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    village_path = sys.argv[1]
    # 游戏数据默认路径：同目录 ../data/all_game_data_zh.json
    default_data = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "all_game_data_zh.json")
    data_path = sys.argv[2] if len(sys.argv) > 2 else default_data

    if not os.path.exists(village_path):
        print(f"错误：找不到村庄文件 {village_path}")
        sys.exit(1)
    if not os.path.exists(data_path):
        print(f"错误：找不到游戏数据文件 {data_path}")
        print("请从天择网「数据开源」下载 all_game_data_zh.json，或作为第二个参数传入。")
        sys.exit(1)

    with open(village_path, encoding="utf-8") as f:
        v = json.load(f)
    g = load_game(data_path)
    idm = build_idmap(g["units"])

    th = detect_th(v, idm)
    bh = detect_bh(v, idm)
    tasks = compute_tasks(v, idm, th, bh)
    report(v, idm, th, bh, tasks)


if __name__ == "__main__":
    main()
