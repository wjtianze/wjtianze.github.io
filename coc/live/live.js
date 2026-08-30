/* 天择网 COC 实时查询：40 项云端只读动作的图形工作台。 */
(function (root) {
  "use strict";

  var CLOUD_ROOT = "https://tianze-coc-query.xia-xilin-sgy.workers.dev";
  var COC_TAG_CHARACTERS = "0289PYLQGRJCUV";
  var LEGEND_LEAGUE_ID = 29000022;
  var TRANSIENT_STATUS = [408, 425, 429, 502, 503, 504];
  var MAX_RENDER_ITEMS = 100;
  var STALE_QUERY = {};
  var LOCAL_GAME_NAMES = Object.create(null);
  var LOCAL_GAME_UNITS_BY_NAME = Object.create(null);
  var LOCAL_GAME_UNITS = [];
  var localGameNamesTask = null;

  var ROLE_NAMES = {
    leader: "首领",
    coLeader: "副首领",
    admin: "长老",
    member: "成员"
  };
  var WAR_PREFERENCE_NAMES = {
    in: "参战",
    out: "不参战"
  };
  var CLAN_TYPE_NAMES = {
    open: "任何人都能加入",
    inviteOnly: "只有被批准才能加入",
    closed: "不可加入"
  };
  var WAR_FREQUENCY_NAMES = {
    unknown: "未设置",
    always: "始终",
    moreThanOncePerWeek: "一周两次",
    oncePerWeek: "一周一次",
    lessThanOncePerWeek: "很少",
    never: "从不"
  };
  var VILLAGE_NAMES = {
    home: "家乡村庄",
    builderBase: "建筑大师基地"
  };
  var WAR_STATE_NAMES = {
    notInWar: "当前没有进行中的部落对战",
    matchmaking: "正在匹配",
    preparation: "准备日",
    inWar: "战斗日",
    warEnded: "对战已结束",
    ended: "已结束",
    groupNotFound: "未找到部落对战联赛小组"
  };
  var RAID_STATE_NAMES = {
    ongoing: "进行中",
    ended: "已结束"
  };
  var BATTLE_MODIFIER_NAMES = {
    none: "无",
    hardMode: "锦标赛模式"
  };
  var CLAN_LABEL_NAMES = {
    "Clan Games": "部落竞赛",
    "Clan Wars": "部落对战",
    "Clan War League": "部落对战联赛",
    Farming: "打资源",
    "Trophy Pushing": "冲杯",
    "Friendly Wars": "部落友谊战",
    Competitive: "实力强劲",
    Friendly: "友好",
    Talkative: "发言踊跃",
    Relaxed: "休闲",
    "Newbie Friendly": "欢迎新手",
    International: "国际化",
    Donations: "捐兵",
    Underdog: "潜力股",
    "Base Designing": "阵型设计",
    "Builder Base": "建筑大师基地",
    "Active Donator": "捐兵活跃",
    "Active Daily": "日常活跃",
    "Amateur Attacker": "不擅进攻",
    "Hungry Learner": "求教学",
    Teacher: "老带新",
    Veteran: "多年玩家",
    Newbie: "新手",
    "Clan Capital": "部落都城"
  };
  var ACHIEVEMENT_NAMES = {
    "Champion Builder": "冠军建筑大师",
    "Hidden Treasures": "隐藏的宝藏",
    "High Gear": "改装专家",
    "Master Engineering": "精英工程师",
    "Next Generation Model": "全面进化",
    "Un-Build It": "奇袭大本营",
    "Aggressive Capitalism": "都城大发展",
    "Most Valuable Clanmate": "最有价值部落成员",
    "Anti-Artillery": "火炮破坏者",
    "Bigger & Better": "更大，更好",
    "Bigger Coffers": "储金罐达人",
    "Bust This!": "爆裂出击",
    "Clan War Wealth": "部落对战大富翁",
    Conqueror: "常胜将军",
    Counterspell: "法术反制",
    "Crafter’s Nightmare": "精工噩梦",
    "Crafter's Nightmare": "精工噩梦",
    "Crafting Connoisseur": "精工行家",
    "Discover New Troops": "新兵集结",
    "Dragon Slayer": "屠龙勇士",
    "Elixir Escapade": "圣水大亨",
    "Empire Builder": "强国缔造者",
    Firefighter: "灭火英雄",
    "Firespitter Finisher": "火焰喷射器毁灭者",
    "Friend in Need": "患难之交",
    "Games Champion": "竞赛冠军",
    "Get even more Goblins!": "消灭超多哥布林！",
    "Get those Goblins!": "消灭哥布林！",
    "Get those other Goblins!": "消灭更多哥布林！",
    "Gold Grab": "抓金手",
    "Heroic Heist": "暗黑重油大亨",
    Humiliator: "攻城拔寨",
    "Keep Your Account Safe!": "村庄守护者",
    "League All-Star": "联赛明星",
    "League Enthusiast": "联赛爱好者",
    "League Fanatic": "联赛狂人",
    "League Follower": "联赛参与者",
    "League Master": "联赛大师",
    "League Superfan": "联赛铁粉",
    "Monolith Masher": "擎天巨柱粉碎机",
    "Mortar Mauler": "迫击炮破坏达人",
    "Multi-Archer Tower Terminator": "多人箭塔终结者",
    "Multi-Gear Tower Trampler": "复合机械塔破坏者",
    "Nice and Tidy": "清爽整洁",
    "Not So Easy This Time": "迎难而上",
    "Ricochet Cannon Crusher": "跳弹加农炮破碎机",
    "Sharing is caring": "分享即关爱",
    "Shattered and Scattered": "碎石金刚",
    "Siege Sharer": "攻城增援",
    "Superb Work": "超能出击",
    Supercharger: "超级充能达人",
    "Sweet Victory!": "战无不胜！",
    Unbreakable: "固若金汤",
    "Ungrateful Child": "叛逆小孩",
    "Union Buster": "工棚破坏者",
    "Wall Buster": "拆墙达人",
    "War Hero": "战争英雄",
    "War League Legend": "叱咤部落对战联赛",
    "Well Seasoned": "月度挑战达人",
    "X-Bow Exterminator": "连弩终结者"
  };
  var CUP_LEAGUE_STEMS = {
    Bronze: "铜杯",
    Silver: "银杯",
    Gold: "金杯",
    Crystal: "水晶杯",
    Master: "大师杯",
    Champion: "冠军杯",
    Titan: "泰坦杯",
    Legend: "传奇杯"
  };
  var RANKED_LEAGUE_STEMS = {
    Skeleton: "骷髅兵",
    Barbarian: "野蛮人",
    Archer: "弓箭手",
    Wizard: "法师",
    Valkyrie: "瓦基丽武神",
    Witch: "女巫",
    Golem: "戈仑石人",
    "P.E.K.K.A": "皮卡超人",
    Titan: "泰坦",
    Dragon: "飞龙",
    Electro: "雷龙"
  };
  var BUILDER_LEAGUE_STEMS = {
    Wood: "木头",
    Clay: "黏土",
    Stone: "石头",
    Copper: "红铜",
    Brass: "黄铜",
    Iron: "精铁",
    Steel: "坚钢",
    Titanium: "钛金",
    Platinum: "铂金",
    Emerald: "绿宝石",
    Ruby: "红宝石",
    Diamond: "钻石"
  };

  function field(name, label, type, options) {
    return Object.assign({ name: name, label: label, type: type || "text", required: false, advanced: false }, options || {});
  }
  function tagField(name, label, required) {
    return field(name, label, "tag", { required: Boolean(required), placeholder: "#2PP", hint: "可省略 #；字母 O 会自动改为数字 0。" });
  }
  function tagsField(name, label, required) {
    return field(name, label, "tags", { required: Boolean(required), wide: true, placeholder: "#2PP\n#QGR", hint: "每行或用逗号分隔一个标签，最多 100 个。" });
  }
  function cursorFields(withPage) {
    var items = [];
    if (withPage) items.push(field("page", "启用逐页读取", "checkbox", { advanced: true, hint: "云端查询服务会依次读取各页，网页再把结果整理为一个列表。" }));
    items.push(
      field("limit", "返回数量", "integer", { advanced: true, min: 0, max: 1000, placeholder: "20", hint: "留空使用官方默认数量，最大 1000。" }),
      field("before", "向前翻页游标", "cursor", { advanced: true, wide: true, placeholder: "留空", hint: "与向后翻页游标只能填写一个。" }),
      field("after", "向后翻页游标", "cursor", { advanced: true, wide: true, placeholder: "留空", hint: "仅在你已经取得官方分页游标时填写。" })
    );
    return items;
  }
  function action(name, category, title, description, renderer, fields, related) {
    return {
      action: name,
      category: category,
      title: title,
      description: description,
      renderer: renderer,
      fields: fields || [],
      related: related || []
    };
  }

  var CATEGORIES = [
    { id: "player", title: "玩家", note: "单个与批量" },
    { id: "clan", title: "部落", note: "搜索与成员" },
    { id: "war", title: "部落对战", note: "当前对战与日志" },
    { id: "cwl", title: "部落对战联赛", note: "小组与轮次" },
    { id: "raid", title: "突袭周末", note: "记录与成员" },
    { id: "ranking", title: "地区排名", note: "地区与榜单" },
    { id: "league", title: "联赛目录", note: "四类联赛" },
    { id: "meta", title: "其他资料", note: "赛季、标签与黄金令牌" }
  ];

  var ACTION_CATALOG = [
    action("get_player", "player", "玩家资料", "输入玩家标签，查看等级、奖杯、联赛、部落、英雄、部队与成就。", "player",
      [tagField("player_tag", "玩家标签", true)], ["get_players"]),
    action("get_players", "player", "批量玩家资料", "一次查询多个玩家，并在表格中比较等级、村庄与奖杯。", "player-list",
      [tagsField("player_tags", "玩家标签列表", true)], ["get_player"]),

    action("search_clans", "clan", "搜索部落", "按名称、所在地、成员数、积分或等级筛选部落。至少填写一项筛选条件。", "clan-list", [
      field("name", "部落名称", "text", { placeholder: "至少 3 个字符", hint: "按名称搜索时至少输入 3 个字符。" }),
      field("war_frequency", "对战频率", "select", { options: [["", "不限"], ["always", "始终"], ["moreThanOncePerWeek", "一周两次"], ["oncePerWeek", "一周一次"], ["lessThanOncePerWeek", "很少"], ["never", "从不"], ["unknown", "未设置"]] }),
      field("location_id", "地区编号", "integer", { min: 0, placeholder: "例如 32000006" }),
      field("min_members", "最少成员", "integer", { min: 0, max: 50, placeholder: "0–50" }),
      field("max_members", "最多成员", "integer", { min: 0, max: 50, placeholder: "0–50" }),
      field("min_clan_points", "最低部落积分", "integer", { min: 0, placeholder: "例如 30000" }),
      field("min_clan_level", "最低部落等级", "integer", { min: 0, placeholder: "例如 10" }),
      field("label_ids", "标签编号", "integer-list", { wide: true, placeholder: "56000000, 56000001", hint: "可填写多个正整数；搜索部落时还需要填写其他条件。" })
    ].concat(cursorFields(false)), ["get_clan", "get_clan_labels", "search_locations"]),
    action("get_clan", "clan", "部落资料", "查看部落等级、积分、战绩、都城、标签和成员，并继续查看部落对战或突袭周末。", "clan",
      [tagField("tag", "部落标签", true)], ["get_members", "get_current_war", "get_war_log", "get_league_group", "get_raid_log"]),
    action("get_clans", "clan", "批量部落资料", "一次读取多个已知部落，并在表格中比较等级、成员和积分。", "clan-list",
      [tagsField("tags", "部落标签列表", true)], ["get_clan"]),
    action("get_members", "clan", "部落成员", "读取部落成员列表；每个玩家都能继续打开玩家资料。", "members",
      [tagField("clan_tag", "部落标签", true)].concat(cursorFields(false)), ["get_clan", "get_current_war"]),

    action("get_war_log", "war", "部落对战日志", "查看部落最近的对战结果、胜利之星、摧毁率与对手。私密部落对战日志可能无法读取。", "war-log",
      [tagField("clan_tag", "部落标签", true)].concat(cursorFields(true)), ["get_current_war", "get_clan"]),
    action("get_clan_war", "war", "当前部落对战", "直接读取一个部落当前进行的部落对战与双方成员资料。", "war",
      [tagField("clan_tag", "部落标签", true)], ["get_current_war", "get_war_log"]),
    action("get_clan_wars", "war", "批量部落对战", "一次读取多个部落的对战资料，适合并排检查。", "war-list",
      [tagsField("clan_tags", "部落标签列表", true)], ["get_clan_war", "get_current_wars"]),
    action("get_current_war", "war", "当前部落对战", "查看当前常规部落对战或指定部落对战联赛轮次的状态、计分和成员。", "war", [
      tagField("clan_tag", "部落标签", true),
      field("cwl_round", "联赛轮次", "select", { options: [["", "自动判断"], ["previous_war", "上一轮"], ["current_war", "当前轮"], ["current_preparation", "当前准备日轮次"]] })
    ], ["get_war_log", "get_league_group", "get_clan"]),
    action("get_current_wars", "war", "批量当前部落对战", "一次读取多个部落的当前对战状态。", "war-list",
      [tagsField("clan_tags", "部落标签列表", true)], ["get_current_war"]),

    action("get_league_group", "cwl", "部落对战联赛小组", "查看部落当前联赛小组、参赛部落、轮次和联赛对战标签。", "cwl-group",
      [tagField("clan_tag", "部落标签", true)], ["get_league_war", "get_current_war"]),
    action("get_league_war", "cwl", "单场部落对战联赛", "用联赛对战标签读取一场联赛对战的完整计分与成员资料。", "war",
      [tagField("war_tag", "联赛对战标签", true)], ["get_league_group", "get_league_wars"]),
    action("get_league_wars", "cwl", "批量部落对战联赛", "一次读取多个联赛对战标签，可选指定观察方部落。", "war-list", [
      tagsField("war_tags", "联赛对战标签列表", true),
      tagField("clan_tag", "观察方部落标签", false)
    ], ["get_league_war", "get_league_group"]),

    action("get_raid_log", "raid", "突袭周末记录", "查看突袭周末的都城战利品、进攻次数、成员贡献和攻防记录。", "raid-log",
      [tagField("clan_tag", "部落标签", true)].concat(cursorFields(true)), ["get_clan", "get_members"]),

    action("search_locations", "ranking", "地区目录", "浏览官方地区编号；选择地区后可继续查看五类排行榜。", "location-list",
      cursorFields(false), ["get_location", "get_location_named"]),
    action("get_location", "ranking", "按编号查地区", "用官方地区编号查看地区名称、国家属性与相关排行榜入口。", "location",
      [field("location_id", "地区编号", "integer", { required: true, min: 0, placeholder: "例如 32000006" })], ["get_location_named", "get_location_clans", "get_location_players"]),
    action("get_location_named", "ranking", "按名称查地区", "按地区名称查找官方地区，并继续打开排行榜。", "location",
      [field("location_name", "地区名称", "text", { required: true, placeholder: "例如 China" })], ["get_location", "get_location_clans", "get_location_players"]),
    action("get_location_clans", "ranking", "部落积分榜", "查看全球或指定地区的部落积分排名。", "ranking",
      [field("location_id", "地区编号", "integer", { min: 0, placeholder: "留空代表全球" })].concat(cursorFields(false)), ["search_locations", "get_location_players"]),
    action("get_location_clans_capital", "ranking", "都城奖杯榜", "查看全球或指定地区的都城奖杯排名。", "ranking",
      [field("location_id", "地区编号", "integer", { min: 0, placeholder: "留空代表全球" })].concat(cursorFields(false)), ["search_locations", "get_location_clans"]),
    action("get_location_players", "ranking", "玩家奖杯榜", "查看全球或指定地区的玩家奖杯排名。", "ranking",
      [field("location_id", "地区编号", "integer", { min: 0, placeholder: "留空代表全球" })].concat(cursorFields(false)), ["search_locations", "get_location_clans"]),
    action("get_location_clans_builder_base", "ranking", "建筑大师基地部落榜", "查看全球或指定地区的建筑大师基地部落排名。", "ranking",
      [field("location_id", "地区编号", "integer", { min: 0, placeholder: "留空代表全球" })].concat(cursorFields(false)), ["search_locations", "get_location_players_builder_base"]),
    action("get_location_players_builder_base", "ranking", "建筑大师基地玩家榜", "查看全球或指定地区的建筑大师基地玩家排名。", "ranking",
      [field("location_id", "地区编号", "integer", { min: 0, placeholder: "留空代表全球" })].concat(cursorFields(false)), ["search_locations", "get_location_clans_builder_base"]),

    action("search_leagues", "league", "传统奖杯联赛目录", "浏览传统奖杯联赛编号、名称和徽章。新版排位战等级以玩家资料中的排位战联赛为准。", "league-list",
      cursorFields(false), ["get_league", "get_league_named", "get_seasons"]),
    action("get_league", "league", "按编号查传统奖杯联赛", "用联赛编号读取传统奖杯联赛详情。", "league",
      [field("league_id", "联赛编号", "integer", { required: true, min: 0, placeholder: String(LEGEND_LEAGUE_ID) })], ["search_leagues", "get_seasons"]),
    action("get_league_named", "league", "按名称查传统奖杯联赛", "用联赛名称读取传统奖杯联赛详情。", "league",
      [field("league_name", "联赛名称", "text", { required: true, placeholder: "例如 传奇杯联赛" })], ["search_leagues", "get_seasons"]),
    action("search_builder_base_leagues", "league", "建筑大师基地联赛目录", "浏览建筑大师基地联赛编号与名称。", "league-list",
      cursorFields(false), ["get_builder_base_league", "get_builder_base_league_named"]),
    action("get_builder_base_league", "league", "按编号查建筑大师基地联赛", "用联赛编号读取建筑大师基地联赛详情。", "league",
      [field("league_id", "联赛编号", "integer", { required: true, min: 0 })], ["search_builder_base_leagues"]),
    action("get_builder_base_league_named", "league", "按名称查建筑大师基地联赛", "用联赛名称读取建筑大师基地联赛详情。", "league",
      [field("league_name", "联赛名称", "text", { required: true, placeholder: "例如 黄铜1" })], ["search_builder_base_leagues"]),
    action("search_war_leagues", "league", "部落对战联赛目录", "浏览部落对战联赛编号、名称与徽章。", "league-list",
      cursorFields(false), ["get_war_league", "get_war_league_named"]),
    action("get_war_league", "league", "按编号查部落对战联赛", "用联赛编号读取部落对战联赛详情。", "league",
      [field("league_id", "联赛编号", "integer", { required: true, min: 0 })], ["search_war_leagues"]),
    action("get_war_league_named", "league", "按名称查部落对战联赛", "用联赛名称读取部落对战联赛详情。", "league",
      [field("league_name", "联赛名称", "text", { required: true, placeholder: "例如 金杯1" })], ["search_war_leagues"]),
    action("search_capital_leagues", "league", "都城联赛目录", "浏览部落都城联赛编号与名称。", "league-list",
      cursorFields(false), ["get_capital_league", "get_capital_league_named"]),
    action("get_capital_league", "league", "按编号查都城联赛", "用联赛编号读取部落都城联赛详情。", "league",
      [field("league_id", "联赛编号", "integer", { required: true, min: 0 })], ["search_capital_leagues"]),
    action("get_capital_league_named", "league", "按名称查都城联赛", "用联赛名称读取部落都城联赛详情。", "league",
      [field("league_name", "联赛名称", "text", { required: true, placeholder: "例如 金杯1" })], ["search_capital_leagues"]),

    action("get_seasons", "meta", "传奇杯联赛赛季", "列出传奇杯联赛可查询的赛季月份，并直接进入历史榜单。", "season-list",
      [field("league_id", "联赛编号", "integer", { min: 0, defaultValue: LEGEND_LEAGUE_ID, placeholder: String(LEGEND_LEAGUE_ID), hint: "官方目前只为传奇杯联赛提供历史赛季。" })], ["get_season_rankings", "get_league"]),
    action("get_season_rankings", "meta", "传奇杯联赛历史排名", "查看指定传奇杯联赛赛季的最终玩家排名。", "ranking", [
      field("league_id", "联赛编号", "integer", { required: true, min: 0, defaultValue: LEGEND_LEAGUE_ID }),
      field("season_id", "赛季月份", "month", { required: true, placeholder: "2026-07" })
    ], ["get_seasons", "get_player"]),
    action("get_clan_labels", "meta", "部落标签目录", "浏览官方部落兴趣标签及编号，可用于搜索部落。", "label-list",
      cursorFields(false), ["search_clans", "get_player_labels"]),
    action("get_player_labels", "meta", "玩家标签目录", "浏览官方玩家偏好标签及编号。", "label-list",
      cursorFields(false), ["get_clan_labels"]),
    action("get_current_goldpass_season", "meta", "黄金令牌赛季", "查看当前黄金令牌赛季的官方开始与结束时间。", "goldpass",
      [], ["get_seasons"])
  ];

  var ACTION_MAP = {};
  ACTION_CATALOG.forEach(function (item) { ACTION_MAP[item.action] = item; });
  var CATEGORY_MAP = {};
  CATEGORIES.forEach(function (item) { CATEGORY_MAP[item.id] = item; });

  function specList(spec, camelName, legacyName) {
    var value = spec && spec[camelName];
    if (!Array.isArray(value)) value = spec && spec[legacyName];
    return Array.isArray(value) ? value : [];
  }
  function safeActions(documentValue) {
    var actions = documentValue && Array.isArray(documentValue.readOnlyActions) ? documentValue.readOnlyActions : [];
    return actions.filter(function (item) {
      var secrets = specList(item, "secretParams", "secret_params");
      return item && /^[a-z][a-z0-9_]{1,80}$/.test(String(item.action || "")) &&
        item.action !== "verify_player_token" && item.status !== "unsupported" &&
        secrets.length === 0 && Boolean(ACTION_MAP[item.action]);
    });
  }
  function defaultParamsForSpec(spec) {
    var params = {};
    specList(spec, "requiredParams", "required_params").forEach(function (key) {
      if (/tags$/.test(key)) params[key] = ["#"];
      else if (/tag$/.test(key)) params[key] = "#";
      else if (/^(?:location|league)_id$/.test(key)) params[key] = 0;
      else params[key] = "";
    });
    return params;
  }
  function normalizeCocTag(value, noun) {
    var label = noun || "标签";
    var raw = String(value == null ? "" : value).toUpperCase().replace(/\s+/g, "").replace(/O/g, "0");
    if (!raw) throw new Error("请输入" + label);
    var body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
    if (body.length < 3 || body.length > 15) throw new Error(label + "应为 3 至 15 个字符");
    if (body.indexOf("#") >= 0 || !new RegExp("^[" + COC_TAG_CHARACTERS + "]+$").test(body)) {
      throw new Error(label + "只能包含 " + COC_TAG_CHARACTERS + "；字母 O 会自动改为数字 0");
    }
    return "#" + body;
  }
  function normalizedLinkedTag(value, noun) {
    if (typeof value !== "string") return "";
    try { return normalizeCocTag(value, noun); } catch (_error) { return ""; }
  }
  function parseTagList(value, noun) {
    var pieces = String(value == null ? "" : value).split(/[\s,，;；]+/).filter(Boolean);
    if (!pieces.length) throw new Error("请输入" + (noun || "标签列表"));
    if (pieces.length > 100) throw new Error((noun || "标签列表") + "最多填写 100 个");
    var seen = {};
    return pieces.map(function (item) { return normalizeCocTag(item, noun || "标签"); }).filter(function (item) {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }
  function parseIntegerList(value, noun) {
    var pieces = String(value == null ? "" : value).split(/[\s,，;；]+/).filter(Boolean);
    if (!pieces.length) return [];
    if (pieces.length > 100) throw new Error((noun || "编号列表") + "最多填写 100 个");
    return pieces.map(function (item) {
      var number = Number(item);
      if (!Number.isInteger(number) || number <= 0) throw new Error((noun || "编号列表") + "只能填写正整数");
      return number;
    });
  }
  function normalizeParams(actionName, rawParams) {
    var spec = ACTION_MAP[actionName];
    if (!spec) throw new Error("不支持这个查询动作");
    var raw = rawParams && typeof rawParams === "object" ? rawParams : {};
    var params = {};
    spec.fields.forEach(function (item) {
      var value = raw[item.name];
      var empty = value == null || (typeof value === "string" && !value.trim());
      if (item.type === "checkbox") {
        if (value === true || value === "1" || value === "true" || value === "on") params[item.name] = true;
        return;
      }
      if (empty) {
        if (item.required) throw new Error("请填写" + item.label);
        return;
      }
      if (item.type === "tag") params[item.name] = normalizeCocTag(value, item.label);
      else if (item.type === "tags") params[item.name] = Array.isArray(value)
        ? parseTagList(value.join(","), item.label) : parseTagList(value, item.label);
      else if (item.type === "integer-list") {
        var integerList = Array.isArray(value) ? value.map(Number) : parseIntegerList(value, item.label);
        if (integerList.length) params[item.name] = integerList;
      } else if (item.type === "integer") {
        var number = typeof value === "number" ? value : Number(String(value).trim());
        if (!Number.isInteger(number)) throw new Error(item.label + "必须是整数");
        if (item.min != null && number < item.min) throw new Error(item.label + "不能小于 " + item.min);
        if (item.max != null && number > item.max) throw new Error(item.label + "不能大于 " + item.max);
        params[item.name] = number;
      } else if (item.type === "month") {
        var season = String(value).trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(season)) throw new Error(item.label + "应为 YYYY-MM");
        params[item.name] = season;
      } else {
        var text = String(value).trim();
        if (text.length > (item.type === "cursor" ? 512 : 4096)) throw new Error(item.label + "过长");
        params[item.name] = text;
      }
    });
    if (params.before && params.after) throw new Error("向前和向后翻页游标只能填写一个");
    if (params.league_name && /_league_named$/.test(actionName)) {
      params.league_name = apiLeagueName(params.league_name, leagueKind(actionName));
    }
    if (actionName === "search_clans") {
      if (params.name && params.name.length < 3) throw new Error("部落名称至少输入 3 个字符");
      if (!["name", "war_frequency", "location_id", "min_members", "max_members", "min_clan_points", "min_clan_level"].some(function (key) { return params[key] != null && params[key] !== ""; })) {
        throw new Error("搜索部落至少填写名称、对战频率、地区、成员数、积分或等级中的一项");
      }
      if (params.min_members != null && params.max_members != null && params.min_members > params.max_members) {
        throw new Error("最少成员不能大于最多成员");
      }
    }
    return params;
  }
  function serializeParam(value) {
    if (Array.isArray(value)) return value.join(",");
    if (value === true) return "1";
    return String(value);
  }
  function buildShareUrl(actionName, params, baseUrl, shouldRun) {
    var spec = ACTION_MAP[actionName] || ACTION_MAP.get_player;
    var fallback = "https://wjtianze.github.io/coc/live/index.html";
    var url = new URL(baseUrl || (root.location && root.location.href) || fallback, fallback);
    url.search = "";
    url.hash = "";
    url.searchParams.set("category", spec.category);
    url.searchParams.set("action", spec.action);
    spec.fields.forEach(function (item) {
      var value = params && params[item.name];
      if (value == null || value === "" || value === false || (Array.isArray(value) && !value.length)) return;
      url.searchParams.set(item.name, serializeParam(value));
    });
    if (shouldRun) url.searchParams.set("run", "1");
    return url.toString();
  }
  function parseUrlState(urlValue) {
    var fallback = "https://wjtianze.github.io/coc/live/index.html";
    var url;
    try { url = new URL(urlValue || (root.location && root.location.href) || fallback, fallback); }
    catch (_error) { url = new URL(fallback); }
    var actionName = url.searchParams.get("action");
    var spec = ACTION_MAP[actionName] || ACTION_MAP.get_player;
    var params = {};
    spec.fields.forEach(function (item) {
      if (!url.searchParams.has(item.name)) return;
      var value = url.searchParams.get(item.name);
      params[item.name] = item.type === "checkbox" ? value === "1" || value === "true" : value;
    });
    return { action: spec.action, category: spec.category, params: params, run: url.searchParams.get("run") === "1" };
  }
  function safeHttpsUrl(value) {
    if (typeof value !== "string" || !value) return "";
    try {
      var url = new URL(value);
      if (url.protocol !== "https:" || url.hostname !== "api-assets.clashofclans.com" || url.port) return "";
      return url.href;
    } catch (_error) { return ""; }
  }
  function formatNumber(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback == null ? "—" : String(fallback);
    try { return new Intl.NumberFormat("zh-CN").format(number); }
    catch (_error) { return String(number); }
  }
  function parseCocDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    var text = String(value).trim();
    var compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(text);
    if (compact) text = compact[1] + "-" + compact[2] + "-" + compact[3] + "T" + compact[4] + ":" + compact[5] + ":" + compact[6] + "Z";
    var date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatCocDate(value) {
    var date = parseCocDate(value);
    if (!date) return value ? String(value) : "—";
    try {
      return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    } catch (_error) { return date.toISOString(); }
  }
  function errorText(error) {
    var message = String(error && error.message || error || "请求失败").trim();
    if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
      return "无法连接云端查询服务，请检查网络或人机验证后重试。";
    }
    if (/abort(?:ed|error)?|timed?\s*out|timeout/i.test(message)) {
      return "连接云端查询服务超时，请稍后重试。";
    }
    return message || "请求失败";
  }
  function cloudErrorRetryable(status, code) {
    return !String(code || "").trim() && TRANSIENT_STATUS.indexOf(Number(status)) >= 0;
  }
  function envelope(value) {
    if (!value || typeof value !== "object") throw new Error("查询服务返回了无效响应");
    if (value.ok === false) throw new Error(value.error && (value.error.message || value.error.code) || "请求失败");
    return Object.prototype.hasOwnProperty.call(value, "result") ? value.result : value;
  }
  function rendererKind(actionName) {
    return ACTION_MAP[actionName] ? ACTION_MAP[actionName].renderer : "structured";
  }
  function getItems(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.memberList)) return value.memberList;
    if (Array.isArray(value.members)) return value.members;
    return [];
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function append(parent, child) {
    if (child == null || child === "") return parent;
    parent.appendChild(child && child.nodeType ? child : document.createTextNode(String(child)));
    return parent;
  }
  function firstValue(object, names, fallback) {
    if (!object || typeof object !== "object") return fallback;
    for (var index = 0; index < names.length; index += 1) {
      var value = object[names[index]];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return fallback;
  }
  function displayValue(value, fallback) {
    if (value === true) return "是";
    if (value === false) return "否";
    if (value === undefined || value === null || value === "") return fallback == null ? "—" : String(fallback);
    return String(value);
  }
  function containsHan(value) {
    return /[\u3400-\u9fff]/.test(String(value == null ? "" : value));
  }
  function normalizedNameKey(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/[’]/g, "'").replace(/\./g, "");
  }
  function enumName(map, value, fallback) {
    if (value === undefined || value === null || value === "") return fallback == null ? "—" : String(fallback);
    var text = String(value).trim();
    if (containsHan(text)) return text;
    if (map[text]) return map[text];
    var compact = text.replace(/[\s_-]+/g, "").toLowerCase();
    var key = Object.keys(map).find(function (item) {
      return item.replace(/[\s_-]+/g, "").toLowerCase() === compact;
    });
    return key ? map[key] : (fallback == null ? "未收录" : String(fallback));
  }
  function officialRoleName(value) {
    return enumName(ROLE_NAMES, value, "未标明");
  }
  function officialWarPreferenceName(value) {
    return enumName(WAR_PREFERENCE_NAMES, value, "未标明");
  }
  function officialClanTypeName(value) {
    return enumName(CLAN_TYPE_NAMES, value, "未设置");
  }
  function officialWarFrequencyName(value) {
    return enumName(WAR_FREQUENCY_NAMES, value, "未设置");
  }
  function officialVillageName(value) {
    return enumName(VILLAGE_NAMES, value, "未标明");
  }
  function officialWarStateName(value) {
    return enumName(WAR_STATE_NAMES, value, "状态未收录");
  }
  function officialRaidStateName(value) {
    return enumName(RAID_STATE_NAMES, value, "状态未收录");
  }
  function officialBattleModifierName(value) {
    return enumName(BATTLE_MODIFIER_NAMES, value, "未收录模式");
  }
  function officialLabelName(value) {
    var name = value && typeof value === "object" ? firstValue(value, ["name", "id"], "未命名标签") : value;
    if (name === undefined || name === null || name === "") return "未命名标签";
    var text = String(name).trim();
    if (containsHan(text)) return text;
    return CLAN_LABEL_NAMES[text] || "未收录标签";
  }
  function romanNumber(value) {
    return ({ I: 1, II: 2, III: 3, IV: 4, V: 5 })[String(value || "").toUpperCase()] || 0;
  }
  function officialLeagueName(value, options) {
    options = options || {};
    if (value === undefined || value === null || value === "") return "未进入联赛";
    var text = String(value).trim();
    if (!text) return "未进入联赛";
    if (containsHan(text)) {
      if (/^传奇[123]$/.test(text)) return text.replace(/^传奇/, "传奇杯");
      text = text.replace(/^(骷髅兵|野蛮人|弓箭手|法师|瓦基丽武神|女巫|戈仑石人|皮卡超人|泰坦|飞龙|雷龙|木头|黏土|石头|红铜|黄铜|精铁|坚钢|钛金|铂金|绿宝石|红宝石|钻石|铜杯|银杯|金杯|水晶杯|大师杯|冠军杯|泰坦杯|传奇杯)联赛(\d+)$/, "$1$2");
      if (options.kind === "builder") text = text.replace(/^(木头|黏土|石头|红铜|黄铜|精铁|坚钢|钛金|铂金|绿宝石|红宝石|钻石)联赛$/, "$1");
      return text;
    }
    if (/^(?:Unranked|None)$/i.test(text)) return "未进入联赛";
    var legendRank = /^Legend\s+(I|II|III)$/i.exec(text);
    if (legendRank) return "传奇杯" + romanNumber(legendRank[1]);
    if (/^Legend League$/i.test(text)) return "传奇杯联赛";
    var ranked = /^(.+?) League (\d+)$/.exec(text);
    if (ranked && RANKED_LEAGUE_STEMS[ranked[1]]) {
      return RANKED_LEAGUE_STEMS[ranked[1]] + ranked[2];
    }
    var divided = /^(.+?) League (I|II|III|IV|V)$/i.exec(text);
    if (divided) {
      var stem = options.kind === "builder" ? BUILDER_LEAGUE_STEMS[divided[1]] : CUP_LEAGUE_STEMS[divided[1]];
      if (!stem && BUILDER_LEAGUE_STEMS[divided[1]]) stem = BUILDER_LEAGUE_STEMS[divided[1]];
      if (stem) return stem + romanNumber(divided[2]);
    }
    var undivided = /^(.+?) League$/i.exec(text);
    if (undivided) {
      var plainStem = options.kind === "builder" ? BUILDER_LEAGUE_STEMS[undivided[1]] : CUP_LEAGUE_STEMS[undivided[1]];
      if (!plainStem && BUILDER_LEAGUE_STEMS[undivided[1]]) plainStem = BUILDER_LEAGUE_STEMS[undivided[1]];
      if (plainStem) return plainStem + (options.kind === "builder" || options.short ? "" : "联赛");
    }
    return "未收录联赛";
  }
  function apiLeagueName(value, kind) {
    if (value === undefined || value === null || value === "") return "";
    var text = String(value).trim();
    if (!text || !containsHan(text)) return text;
    if (text === "未进入联赛") return "Unranked";
    if (text === "传奇杯联赛" || text === "传奇杯") return "Legend League";
    var legendTier = /^传奇(?:杯(?:联赛)?)?([123])$/.exec(text);
    if (legendTier) return "Legend " + ({ 1: "I", 2: "II", 3: "III" })[Number(legendTier[1])];
    if (kind === "ranked") {
      var rankedEnglish = Object.keys(RANKED_LEAGUE_STEMS).find(function (key) {
        return text.indexOf(RANKED_LEAGUE_STEMS[key]) === 0;
      });
      if (rankedEnglish) {
        var rankedSuffix = text.slice(RANKED_LEAGUE_STEMS[rankedEnglish].length).replace(/^联赛/, "");
        if (/^\d+$/.test(rankedSuffix)) return rankedEnglish + " League " + rankedSuffix;
      }
    }
    var stems = kind === "builder" ? BUILDER_LEAGUE_STEMS : CUP_LEAGUE_STEMS;
    var english = Object.keys(stems).find(function (key) { return text.indexOf(stems[key]) === 0; });
    if (!english) return text;
    var suffix = text.slice(stems[english].length).replace(/^联赛/, "");
    if (!suffix) return english + " League";
    var number = Number(suffix);
    var roman = ({ 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" })[number];
    return roman ? english + " League " + roman : text;
  }
  function indexLocalGameNames(documentValue) {
    var units = documentValue && Array.isArray(documentValue.units) ? documentValue.units : [];
    LOCAL_GAME_UNITS = units.slice();
    units.forEach(function (unit) {
      var english = unit && unit.englishName;
      var chinese = unit && unit.chineseName;
      if (!english || !chinese || !containsHan(chinese)) return;
      LOCAL_GAME_NAMES[normalizedNameKey(english)] = String(chinese).trim();
      LOCAL_GAME_UNITS_BY_NAME[normalizedNameKey(english)] = unit;
      if (/^BB\s+/i.test(english)) LOCAL_GAME_NAMES[normalizedNameKey(String(english).replace(/^BB\s+/i, ""))] = String(chinese).trim();
      if (/^BB\s+/i.test(english)) LOCAL_GAME_UNITS_BY_NAME[normalizedNameKey(String(english).replace(/^BB\s+/i, ""))] = unit;
      if (english === "Piercing Arrow") LOCAL_GAME_NAMES[normalizedNameKey("Giant Arrow")] = String(chinese).trim();
      if (/法术/.test(String(unit.category || "")) && !/spell$/i.test(english)) {
        LOCAL_GAME_NAMES[normalizedNameKey(english + " Spell")] = String(chinese).trim();
        LOCAL_GAME_UNITS_BY_NAME[normalizedNameKey(english + " Spell")] = unit;
      }
    });
    return units.length;
  }
  function loadLocalGameNames() {
    if (localGameNamesTask) return localGameNamesTask;
    if (typeof root.fetch !== "function") return Promise.resolve(0);
    var assetsReady = root.CocGameAssets ? root.CocGameAssets.ready() : Promise.resolve();
    localGameNamesTask = Promise.all([root.fetch("../data/all_game_data_zh.json?v=20260830a", { credentials: "same-origin", cache: "force-cache" }).then(function (response) {
      if (!response || !response.ok) throw new Error("本地中文名称表不可用");
      return response.json();
    }), assetsReady]).then(function (values) { return indexLocalGameNames(values[0]); }).catch(function () {
      localGameNamesTask = null;
      return 0;
    });
    return localGameNamesTask;
  }
  function officialGameName(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback == null ? "—" : String(fallback);
    var text = String(value).trim();
    if (containsHan(text)) return text;
    return LOCAL_GAME_NAMES[normalizedNameKey(text)] || (fallback == null ? text : String(fallback));
  }
  function officialAchievementName(value) {
    if (value === undefined || value === null || value === "") return "未命名成就";
    var text = String(value).trim();
    if (containsHan(text)) return text;
    return ACHIEVEMENT_NAMES[text] || ACHIEVEMENT_NAMES[text.replace(/[’]/g, "'")] || "未收录成就";
  }
  function officialAchievementInfo(value) {
    if (value === undefined || value === null || value === "") return "—";
    return containsHan(value) ? String(value) : "—";
  }
  var STRUCTURED_FIELD_NAMES = {
    name: "名称", tag: "标签", state: "状态", role: "身份", type: "加入方式", village: "村庄",
    warPreference: "部落对战偏好", war_preference: "部落对战偏好",
    warFrequency: "对战频率", war_frequency: "对战频率", battleModifier: "对战模式", battle_modifier: "对战模式",
    league: "联赛", leagueTier: "排位战联赛", builderBaseLeague: "建筑大师基地联赛",
    warLeague: "部落对战联赛", capitalLeague: "都城联赛", items: "项目", members: "成员"
  };
  function officialStructuredFieldName(key) {
    return STRUCTURED_FIELD_NAMES[key] || key;
  }
  function officialStructuredValue(key, value) {
    if (key === "role") return officialRoleName(value);
    if (key === "warPreference" || key === "war_preference") return officialWarPreferenceName(value);
    if (key === "type") return officialClanTypeName(value);
    if (key === "warFrequency" || key === "war_frequency") return officialWarFrequencyName(value);
    if (key === "village") return officialVillageName(value);
    if (key === "state") return enumName(Object.assign({}, WAR_STATE_NAMES, RAID_STATE_NAMES), value, "状态未收录");
    if (key === "battleModifier" || key === "battle_modifier") return officialBattleModifierName(value);
    return displayValue(value);
  }
  function percent(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + "%" : "—";
  }
  function pickImageUrl(value) {
    if (!value || typeof value !== "object") return "";
    var containers = [value.iconUrls, value.badgeUrls, value.imageUrls, value];
    var keys = ["large", "medium", "small", "tiny", "url"];
    for (var i = 0; i < containers.length; i += 1) {
      var container = containers[i];
      if (!container || typeof container !== "object") continue;
      for (var j = 0; j < keys.length; j += 1) {
        var safe = safeHttpsUrl(container[keys[j]]);
        if (safe) return safe;
      }
    }
    return "";
  }
  function imageNode(value, alt, size) {
    var url = pickImageUrl(value);
    if (!url) return null;
    var image = element("img", "live-avatar");
    image.src = url;
    image.alt = alt || "";
    image.width = size || 72;
    image.height = size || 72;
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  }
  function queryLink(actionName, params, label, className) {
    var shouldRun = false;
    try { normalizeParams(actionName, params || {}); shouldRun = true; } catch (_error) {}
    var link = element("a", className === undefined ? "live-query-link" : className, label);
    link.href = buildShareUrl(actionName, params || {}, root.location && root.location.href, shouldRun);
    link.setAttribute("data-query-link", actionName);
    link.setAttribute("data-query-params", JSON.stringify(params || {}));
    link.setAttribute("data-query-run", String(shouldRun));
    return link;
  }
  function clanTagsInDescription(value, currentTag) {
    var text = String(value == null ? "" : value);
    var ownTag = normalizedLinkedTag(currentTag, "部落标签");
    var pattern = /[#＃]([0289PYLQGRJCUVO]{3,15})(?![A-Z0-9])/gi;
    var matches = [];
    var match;
    while ((match = pattern.exec(text))) {
      if (match.index > 0 && /[#＃]/.test(text.charAt(match.index - 1))) continue;
      var tag = normalizedLinkedTag("#" + match[1], "部落标签");
      if (!tag || tag === ownTag) continue;
      matches.push({ index: match.index, end: pattern.lastIndex, raw: match[0], tag: tag });
    }
    return matches;
  }
  function clanDescriptionNode(value, currentTag) {
    var text = String(value == null ? "" : value);
    var paragraph = element("p", "live-callout live-clan-description");
    var cursor = 0;
    clanTagsInDescription(text, currentTag).forEach(function (match) {
      if (match.index > cursor) paragraph.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      var link = queryLink("get_clan", { tag: match.tag }, match.raw, "live-description-clan-link");
      link.setAttribute("aria-label", "查看部落 " + match.tag);
      paragraph.appendChild(link);
      cursor = match.end;
    });
    if (cursor < text.length) paragraph.appendChild(document.createTextNode(text.slice(cursor)));
    return paragraph;
  }
  function clanQueryIdentity(team, size) {
    var tag = team && normalizedLinkedTag(team.tag, "部落标签");
    var name = displayValue(team && team.name, tag || "未命名部落");
    if (!tag) return document.createTextNode(name);
    var link = queryLink("get_clan", { tag: tag }, "", "live-query-identity");
    link.setAttribute("aria-label", "查看" + name + "的部落资料");
    var badge = imageNode(team, "", size || 32);
    if (badge) {
      badge.classList.add("live-query-badge");
      link.appendChild(badge);
    }
    link.appendChild(element("span", "", name));
    return link;
  }
  function textOrLink(actionName, params, label) {
    return actionName && ACTION_MAP[actionName] ? queryLink(actionName, params, label, "") : document.createTextNode(displayValue(label));
  }
  function addActionLinks(container, actions) {
    if (!actions || !actions.length) return null;
    var row = element("nav", "live-actions");
    row.setAttribute("aria-label", "继续查询");
    actions.forEach(function (item) {
      if (!item || !ACTION_MAP[item.action]) return;
      row.appendChild(queryLink(item.action, item.params || {}, item.label || ACTION_MAP[item.action].title));
    });
    if (row.childNodes.length) {
      container.appendChild(row);
      return row;
    }
    return null;
  }
  function clanGamesWindow(timestamp) {
    var now = new Date(Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now());
    var year = now.getUTCFullYear();
    var monthIndex = now.getUTCMonth();
    var day = now.getUTCDate();
    var phase = day < 22 ? "upcoming" : day <= 28 ? "usual-window" : "upcoming";
    if (day > 28) {
      monthIndex += 1;
      if (monthIndex > 11) { year += 1; monthIndex = 0; }
    }
    return { year: year, month: monthIndex + 1, startDay: 22, endDay: 28, phase: phase };
  }
  function renderClanGamesPanel(container, clanTag) {
    var oldPanel = container.querySelector && container.querySelector("[data-clan-games-panel]");
    if (oldPanel) oldPanel.remove();
    var schedule = clanGamesWindow(Date.now());
    var panel = section("部落竞赛日程", null);
    panel.classList.add("live-clan-games");
    panel.dataset.clanGamesPanel = "1";
    panel.id = "clan-games";
    panel.tabIndex = -1;
    panel.appendChild(statGrid([
      ["部落", clanTag],
      [schedule.phase === "usual-window" ? "常见进行时段" : "下一常见时段",
        schedule.year + "年" + schedule.month + "月" + schedule.startDay + "日至" + schedule.endDay + "日"]
    ]));
    panel.appendChild(element("p", "live-callout is-warning",
      "官方实时接口不提供部落竞赛的积分、任务或奖励进度，所以这里不会显示伪造的部落数据。部落竞赛通常安排在每月22日至28日，确切时间请以游戏内活动中心和当月官方公告为准。"));
    var links = element("nav", "live-actions");
    links.setAttribute("aria-label", "部落竞赛相关入口");
    links.appendChild(queryLink("get_clan", { tag: clanTag }, "返回部落资料"));
    var official = element("a", "live-query-link", "查看官方部落竞赛说明");
    official.href = "https://support.supercell.com/clash-of-clans/zh_cn/articles/clan-games-rewards.html";
    official.target = "_blank";
    official.rel = "noopener noreferrer";
    links.appendChild(official);
    panel.appendChild(links);
    container.appendChild(panel);
    if (root.history && typeof root.history.replaceState === "function" && root.location) {
      var url = new URL(root.location.href);
      url.hash = "clan-games";
      root.history.replaceState(root.history.state, "", url.toString());
    }
    panel.focus({ preventScroll: true });
    if (typeof panel.scrollIntoView === "function") {
      var reducedMotion = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
  }
  function appendClanGamesEntry(container, actionRow, clanTag) {
    if (!actionRow || !clanTag) return;
    var button = element("button", "live-query-link", "部落竞赛日程");
    button.type = "button";
    button.setAttribute("data-clan-games-link", clanTag);
    button.addEventListener("click", function () { renderClanGamesPanel(container, clanTag); });
    actionRow.appendChild(button);
  }
  function identityBlock(value, options) {
    options = options || {};
    var block = element("div", "live-identity");
    var image = imageNode(options.image || value, options.alt || "", 72);
    if (image) block.appendChild(image);
    else {
      var placeholder = element("span", "live-avatar");
      placeholder.setAttribute("aria-hidden", "true");
      block.appendChild(placeholder);
    }
    var copy = element("div", "live-identity-copy");
    copy.appendChild(element("h3", "", options.title || "未命名"));
    var line = element("p");
    if (options.tag) {
      var tag = element("span", "live-tag", options.tag);
      line.appendChild(tag);
    }
    if (options.subtitle) {
      if (line.childNodes.length) line.appendChild(document.createTextNode(" · "));
      line.appendChild(document.createTextNode(options.subtitle));
    }
    if (line.childNodes.length) copy.appendChild(line);
    block.appendChild(copy);
    return block;
  }
  function statGrid(items) {
    var list = element("dl", "live-summary-grid");
    items.forEach(function (item) {
      if (!item || item[1] === undefined || item[1] === null || item[1] === "") return;
      var cell = element("div", "live-stat");
      cell.appendChild(element("dt", "", item[0]));
      var description = element("dd");
      append(description, item[1]);
      cell.appendChild(description);
      list.appendChild(cell);
    });
    return list;
  }
  function section(title, count) {
    var wrapper = element("section", "live-section");
    var head = element("header", "live-section-head");
    head.appendChild(element("h3", "", title));
    if (count != null) head.appendChild(element("span", "live-section-count", formatNumber(count) + " 项"));
    wrapper.appendChild(head);
    return wrapper;
  }
  function tableNode(label, columns, rows) {
    var wrapper = element("div", "live-table-wrap");
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", label);
    var table = element("table", "live-table");
    var thead = element("thead");
    var headRow = element("tr");
    columns.forEach(function (column) {
      var th = element("th", column.number ? "is-number" : "", column.label);
      th.scope = "col";
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var body = element("tbody");
    rows.slice(0, MAX_RENDER_ITEMS).forEach(function (row, rowIndex) {
      var tr = element("tr");
      columns.forEach(function (column) {
        var td = element("td", column.number ? "is-number" : "");
        var value = typeof column.render === "function" ? column.render(row, rowIndex) : row[column.key];
        append(td, value == null || value === "" ? "—" : value);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrapper.appendChild(table);
    if (rows.length > MAX_RENDER_ITEMS) {
      wrapper.appendChild(element("p", "live-note", "为保证页面流畅，仅显示前 " + MAX_RENDER_ITEMS + " 项；原始数据保留全部结果。"));
    }
    return wrapper;
  }
  function listSection(title, rows, columns) {
    var wrapper = section(title, rows.length);
    if (!rows.length) wrapper.appendChild(element("p", "live-empty", "没有可显示的项目。"));
    else wrapper.appendChild(tableNode(title, columns, rows));
    return wrapper;
  }
  function pills(values, formatter) {
    var row = element("div", "live-pills");
    (values || []).slice(0, MAX_RENDER_ITEMS).forEach(function (value) {
      var text = typeof formatter === "function" ? formatter(value) : (typeof value === "object" ? firstValue(value, ["name", "id"], "未命名") : value);
      row.appendChild(element("span", "live-pill", text));
    });
    return row;
  }
  function playerLeagueTierName(player) {
    return player && player.leagueTier && typeof player.leagueTier.name === "string" && player.leagueTier.name.trim()
      ? player.leagueTier.name.trim() : "未进入联赛";
  }
  function displayPlayerLeagueTierName(player) {
    return officialLeagueName(playerLeagueTierName(player), { kind: "ranked", short: true });
  }
  function clanCapitalHallLevel(clan) {
    return clan && clan.clanCapital && clan.clanCapital.capitalHallLevel != null
      ? clan.clanCapital.capitalHallLevel : undefined;
  }
  function playerClan(player) {
    var clan = player && player.clan;
    var tag = clan && normalizedLinkedTag(clan.tag, "部落标签");
    if (!tag) return null;
    return { name: typeof clan.name === "string" && clan.name.trim() ? clan.name.trim() : tag, tag: tag };
  }
  function clanMembers(clan) {
    var members = clan && (clan.memberList || clan.member_list || clan.members);
    return Array.isArray(members) ? members.filter(function (member) {
      return member && normalizedLinkedTag(member.tag, "玩家标签");
    }).map(function (member) {
      return Object.assign({}, member, { tag: normalizedLinkedTag(member.tag, "玩家标签") });
    }) : [];
  }
  function importOfficialPlayerSnapshot(raw, collectedAt, controls) {
    var button = controls.button;
    var link = controls.link;
    var status = controls.status;
    button.disabled = true;
    status.hidden = false;
    status.classList.remove("is-error", "is-success");
    status.textContent = "正在准备村庄分析数据…";
    return loadLocalGameNames().then(function () {
      if (!root.TianzeCocSnapshot || typeof root.TianzeCocSnapshot.fromOfficialPlayer !== "function" || typeof root.TianzeCocSnapshot.save !== "function") {
        throw new Error("村庄分析模块没有加载，请刷新页面后重试");
      }
      var staticUnits = LOCAL_GAME_UNITS;
      if (!Array.isArray(staticUnits) || !staticUnits.length) throw new Error("静态游戏资料尚未加载，请稍后重试");
      var incoming = root.TianzeCocSnapshot.fromOfficialPlayer(raw, staticUnits, { collectedAt: collectedAt });
      root.TianzeCocSnapshot.save(incoming);
      var unknownCount = Array.isArray(incoming.unknownEntities) ? incoming.unknownEntities.length : 0;
      button.textContent = "已导入村庄分析";
      link.hidden = false;
      status.classList.add("is-success");
      status.textContent = "已用本次官方玩家资料替换设备上原有的村庄分析数据，数据截取时间为 " + formatCocDate(new Date(collectedAt)) + "。官方接口没有建筑、陷阱和升级计时等资料，这些项目会显示“无”。未识别单位 " + unknownCount + " 个。";
      return incoming;
    }).catch(function (error) {
      button.disabled = false;
      status.classList.add("is-error");
      status.textContent = "导入未完成：" + errorText(error);
      throw error;
    });
  }
  function renderPlayerImportActions(container, raw, collectedAt) {
    var row = element("div", "live-actions");
    row.setAttribute("aria-label", "村庄分析");
    var button = element("button", "live-button live-button--primary", "导入村庄分析");
    button.type = "button";
    button.setAttribute("aria-describedby", "cocPlayerImportStatus");
    var link = element("a", "live-button", "打开村庄分析");
    link.href = "../index.html#vResult";
    link.hidden = true;
    row.appendChild(button);
    row.appendChild(link);
    var status = element("p", "coc-live-message", "导入会替换设备上现有的村庄分析数据；官方接口没有建筑与升级计时资料。");
    status.id = "cocPlayerImportStatus";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    button.addEventListener("click", function () {
      importOfficialPlayerSnapshot(raw, collectedAt, { button: button, link: link, status: status }).catch(function () {});
    });
    container.appendChild(row);
    container.appendChild(status);
  }
  function renderPlayer(container, data, context) {
    if (!data || typeof data !== "object") return renderStructured(container, data, "玩家资料");
    var tag = normalizedLinkedTag(data.tag, "玩家标签");
    var clan = playerClan(data);
    var leagueName = displayPlayerLeagueTierName(data);
    var imageSource = data.leagueTier || data.builderBaseLeague || (clan && data.clan) || data;
    container.appendChild(identityBlock(data, {
      title: displayValue(data.name, "未命名玩家"),
      tag: tag,
      subtitle: "大本营 " + displayValue(data.townHallLevel),
      image: imageSource,
      alt: leagueName + "徽章"
    }));
    if (clan) addActionLinks(container, [
      { action: "get_clan", params: { tag: clan.tag }, label: "部落：" + clan.name },
      { action: "get_members", params: { clan_tag: clan.tag }, label: "查看部落成员" },
      { action: "get_current_war", params: { clan_tag: clan.tag }, label: "查看当前部落对战" }
    ]);
    if (tag && context && Number.isFinite(Number(context.collectedAt))) {
      renderPlayerImportActions(container, data, Number(context.collectedAt));
    }
    container.appendChild(statGrid([
      ["经验等级", formatNumber(data.expLevel)],
      ["奖杯", formatNumber(data.trophies)],
      ["历史最高奖杯", formatNumber(data.bestTrophies)],
      ["排位战联赛", leagueName],
      ["部落身份", officialRoleName(firstValue(data, ["role"]))],
      ["部落对战偏好", officialWarPreferenceName(firstValue(data, ["warPreference", "war_preference"]))],
      ["部落对战胜利之星", formatNumber(data.warStars)],
      ["本季进攻胜场", formatNumber(data.attackWins)],
      ["本季防守胜场", formatNumber(data.defenseWins)],
      ["增援数量", formatNumber(data.donations)],
      ["收到增援数量", formatNumber(data.donationsReceived)],
      ["建筑大师大本营", formatNumber(data.builderHallLevel)],
      ["建筑大师基地奖杯", formatNumber(firstValue(data, ["builderBaseTrophies", "versusTrophies"]))],
      ["建筑大师基地联赛", data.builderBaseLeague ? officialLeagueName(data.builderBaseLeague.name, { kind: "builder", short: true }) : null],
      ["都城金币", formatNumber(data.clanCapitalContributions)]
    ]));
    var unitGroups = [
      ["英雄", data.heroes || [], ["name", "level", "maxLevel", "village"]],
      ["部队", data.troops || [], ["name", "level", "maxLevel", "village"]],
      ["法术", data.spells || [], ["name", "level", "maxLevel", "village"]],
      ["英雄装备", data.heroEquipment || [], ["name", "level", "maxLevel", "village"]]
    ];
    unitGroups.forEach(function (group) {
      var rows = Array.isArray(group[1]) ? group[1] : [];
      if (!rows.length) return;
      container.appendChild(listSection(group[0], rows, [
        { label: "名称", render: function (row) {
          var unit = LOCAL_GAME_UNITS_BY_NAME[normalizedNameKey(row.name)];
          var wrapper = element("span", "live-game-unit");
          var source = unit && root.CocGameAssets ? root.CocGameAssets.url(unit.globalID, row.level) : "";
          if (source) {
            var image = element("img", "live-game-unit-image");
            image.src = source; image.alt = ""; image.width = 36; image.height = 36;
            image.loading = "lazy"; image.decoding = "async";
            image.addEventListener("error", function () { image.hidden = true; });
            wrapper.appendChild(image);
          }
          wrapper.appendChild(element("span", "", officialGameName(row.name)));
          return wrapper;
        } },
        { label: "等级", number: true, render: function (row) { return formatNumber(row.level); } },
        { label: "最高等级", number: true, render: function (row) { return formatNumber(row.maxLevel); } },
        { label: "村庄", render: function (row) { return officialVillageName(row.village); } }
      ]));
    });
    var achievements = Array.isArray(data.achievements) ? data.achievements : [];
    if (achievements.length) container.appendChild(listSection("成就", achievements, [
      { label: "成就", render: function (row) { return officialAchievementName(row.name); } },
      { label: "星级", number: true, render: function (row) { return formatNumber(row.stars); } },
      { label: "当前值", number: true, render: function (row) { return formatNumber(row.value); } },
      { label: "目标", number: true, render: function (row) { return formatNumber(row.target); } },
      { label: "说明", render: function (row) { return officialAchievementInfo(row.info); } }
    ]));
  }
  function renderPlayerList(container, data) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "玩家列表");
    container.appendChild(listSection("玩家", rows, [
      { label: "排名", number: true, render: function (row, index) { return formatNumber(firstValue(row, ["rank"], index + 1)); } },
      { label: "玩家", render: function (row) {
        var tag = normalizedLinkedTag(row.tag, "玩家标签");
        return tag ? queryLink("get_player", { player_tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
      } },
      { label: "标签", render: function (row) { return displayValue(row.tag); } },
      { label: "经验", number: true, render: function (row) { return formatNumber(row.expLevel); } },
      { label: "大本营", number: true, render: function (row) { return formatNumber(row.townHallLevel); } },
      { label: "奖杯", number: true, render: function (row) { return formatNumber(firstValue(row, ["trophies", "builderBaseTrophies", "versusTrophies"])); } },
      { label: "联赛", render: function (row) { return displayPlayerLeagueTierName(row); } },
      { label: "部落", render: function (row) {
        var clan = playerClan(row);
        return clan ? queryLink("get_clan", { tag: clan.tag }, clan.name, "") : "无部落";
      } }
    ]));
  }
  function renderClanList(container, data) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "部落列表");
    container.appendChild(listSection("部落", rows, [
      { label: "排名", number: true, render: function (row, index) { return formatNumber(firstValue(row, ["rank"], index + 1)); } },
      { label: "部落", render: function (row) {
        var tag = normalizedLinkedTag(row.tag, "部落标签");
        return tag ? queryLink("get_clan", { tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
      } },
      { label: "标签", render: function (row) { return displayValue(row.tag); } },
      { label: "等级", number: true, render: function (row) { return formatNumber(row.clanLevel); } },
      { label: "成员", number: true, render: function (row) { return formatNumber(row.members); } },
      { label: "积分", number: true, render: function (row) { return formatNumber(firstValue(row, ["clanPoints", "clanBuilderBasePoints", "clanVersusPoints"])); } },
      { label: "都城奖杯", number: true, render: function (row) { return formatNumber(row.clanCapitalPoints); } },
      { label: "所在地", render: function (row) { return displayValue(row.location && row.location.name); } }
    ]));
  }
  function renderClan(container, data) {
    if (!data || typeof data !== "object") return renderStructured(container, data, "部落资料");
    var tag = normalizedLinkedTag(data.tag, "部落标签");
    container.appendChild(identityBlock(data, {
      title: displayValue(data.name, "未命名部落"),
      tag: tag,
      subtitle: "部落等级 " + displayValue(data.clanLevel),
      image: data,
      alt: displayValue(data.name, "部落") + "徽章"
    }));
    if (tag) {
      var clanActionRow = addActionLinks(container, [
      { action: "get_members", params: { clan_tag: tag }, label: "成员名单" },
      { action: "get_current_war", params: { clan_tag: tag }, label: "当前部落对战" },
      { action: "get_war_log", params: { clan_tag: tag }, label: "部落对战日志" },
      { action: "get_league_group", params: { clan_tag: tag }, label: "部落对战联赛小组" },
      { action: "get_raid_log", params: { clan_tag: tag }, label: "突袭周末记录" }
      ]);
      appendClanGamesEntry(container, clanActionRow, tag);
    }
    container.appendChild(statGrid([
      ["成员", formatNumber(data.members)],
      ["部落积分", formatNumber(data.clanPoints)],
      ["建筑大师基地积分", formatNumber(firstValue(data, ["clanBuilderBasePoints", "clanVersusPoints"]))],
      ["都城奖杯", formatNumber(data.clanCapitalPoints)],
      ["部落对战胜场", formatNumber(data.warWins)],
      ["部落对战连胜", formatNumber(data.warWinStreak)],
      ["对战频率", officialWarFrequencyName(data.warFrequency)],
      ["部落对战日志公开", displayValue(data.isWarLogPublic)],
      ["都城大本营", formatNumber(clanCapitalHallLevel(data))],
      ["所在地", displayValue(data.location && data.location.name)],
      ["加入方式", officialClanTypeName(data.type)],
      ["部落对战联赛", data.warLeague ? officialLeagueName(data.warLeague.name, { kind: "war", short: false }) : null],
      ["入部要求奖杯", formatNumber(data.requiredTrophies)]
    ]));
    if (data.description) container.appendChild(clanDescriptionNode(data.description, tag));
    if (Array.isArray(data.labels) && data.labels.length) {
      var labelSection = section("部落标签", data.labels.length);
      labelSection.appendChild(pills(data.labels, officialLabelName));
      container.appendChild(labelSection);
    }
    var members = clanMembers(data);
    if (members.length) renderMembers(container, members, { clan_tag: tag });
  }
  var MEMBER_SORT_PRIORITY = ["league", "townHall", "role", "donations", "received"];
  var MEMBER_SORT_OPTIONS = [
    { id: "league", label: "联赛与奖杯" },
    { id: "townHall", label: "大本营" },
    { id: "role", label: "职位" },
    { id: "donations", label: "捐兵" },
    { id: "received", label: "收兵" }
  ];
  var MEMBER_ROLE_RANK = { leader: 4, coLeader: 3, admin: 2, member: 1 };
  function memberNumber(value) {
    if (value === null || value === undefined || value === "") return Number.NEGATIVE_INFINITY;
    var number = Number(value);
    return Number.isFinite(number) ? number : Number.NEGATIVE_INFINITY;
  }
  function memberLeagueRank(row) {
    var tier = row && row.leagueTier;
    var id = memberNumber(tier && tier.id);
    if (id !== Number.NEGATIVE_INFINITY) return id;
    var name = playerLeagueTierName(row);
    var numbered = / League (\d+)$/i.exec(name);
    if (numbered) return Number(numbered[1]);
    var legend = /^Legend (I|II|III)$/i.exec(name);
    if (legend) return 34 - romanNumber(legend[1]);
    return Number.NEGATIVE_INFINITY;
  }
  function memberRoleRank(row) {
    return MEMBER_ROLE_RANK[String(row && row.role || "")] || 0;
  }
  function compareMemberCriterion(left, right, criterion) {
    var leftValue;
    var rightValue;
    if (criterion === "league") {
      leftValue = memberLeagueRank(left);
      rightValue = memberLeagueRank(right);
      if (leftValue !== rightValue) return rightValue - leftValue;
      leftValue = memberNumber(left && left.trophies);
      rightValue = memberNumber(right && right.trophies);
    } else if (criterion === "townHall") {
      leftValue = memberNumber(left && left.townHallLevel);
      rightValue = memberNumber(right && right.townHallLevel);
    } else if (criterion === "role") {
      leftValue = memberRoleRank(left);
      rightValue = memberRoleRank(right);
    } else if (criterion === "donations") {
      leftValue = memberNumber(left && left.donations);
      rightValue = memberNumber(right && right.donations);
    } else {
      leftValue = memberNumber(left && left.donationsReceived);
      rightValue = memberNumber(right && right.donationsReceived);
    }
    if (leftValue === rightValue) return 0;
    return rightValue - leftValue;
  }
  function sortClanMembers(rows, primary) {
    var selected = MEMBER_SORT_PRIORITY.indexOf(primary) >= 0 ? primary : "league";
    var order = [selected].concat(MEMBER_SORT_PRIORITY.filter(function (item) { return item !== selected; }));
    return (Array.isArray(rows) ? rows : []).map(function (row, index) {
      return { row: row, index: index };
    }).sort(function (left, right) {
      for (var index = 0; index < order.length; index += 1) {
        var compared = compareMemberCriterion(left.row, right.row, order[index]);
        if (compared) return compared;
      }
      return left.index - right.index;
    }).map(function (item) { return item.row; });
  }
  function renderMembers(container, data) {
    var rows = Array.isArray(data) ? data : getItems(data);
    if (!rows.length) return renderStructured(container, data, "部落成员");
    var columns = [
      { label: "序号", number: true, render: function (_row, index) { return formatNumber(index + 1); } },
      { label: "玩家", render: function (row) {
        var tag = normalizedLinkedTag(row.tag, "玩家标签");
        return tag ? queryLink("get_player", { player_tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
      } },
      { label: "大本营等级", number: true, render: function (row) { return formatNumber(row.townHallLevel); } },
      { label: "职位", render: function (row) { return officialRoleName(row.role); } },
      { label: "经验", number: true, render: function (row) { return formatNumber(row.expLevel); } },
      { label: "奖杯", number: true, render: function (row) { return formatNumber(row.trophies); } },
      { label: "增援数量", number: true, render: function (row) { return formatNumber(row.donations); } },
      { label: "收到增援数量", number: true, render: function (row) { return formatNumber(row.donationsReceived); } },
      { label: "联赛", render: function (row) { return displayPlayerLeagueTierName(row); } }
    ];
    var wrapper = section("成员名单", rows.length);
    var toolbar = element("div", "live-member-sort");
    toolbar.appendChild(element("span", "live-member-sort-label", "排序"));
    var options = element("div", "live-member-sort-options");
    options.setAttribute("role", "group");
    options.setAttribute("aria-label", "成员排序");
    var tableHost = element("div", "live-member-table-host");
    function paint(primary) {
      options.querySelectorAll("[data-member-sort]").forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-member-sort") === primary));
      });
      tableHost.replaceChildren(tableNode("成员名单，按" + MEMBER_SORT_OPTIONS.find(function (item) { return item.id === primary; }).label + "从高到低排序", columns, sortClanMembers(rows, primary)));
    }
    MEMBER_SORT_OPTIONS.forEach(function (item) {
      var button = element("button", "live-member-sort-button", item.label);
      button.type = "button";
      button.setAttribute("data-member-sort", item.id);
      button.setAttribute("aria-pressed", String(item.id === "league"));
      button.addEventListener("click", function () { paint(item.id); });
      options.appendChild(button);
    });
    toolbar.appendChild(options);
    wrapper.appendChild(toolbar);
    wrapper.appendChild(tableHost);
    container.appendChild(wrapper);
    paint("league");
  }
  function translateWarResult(value) {
    return ({ win: "胜利", won: "胜利", lose: "失败", lost: "失败", tie: "平局", draw: "平局" })[String(value || "").toLowerCase()] || "未记录";
  }
  function warTeamLink(team) {
    return clanQueryIdentity(team, 56);
  }
  function warScoreboard(war) {
    var board = element("div", "live-scoreboard");
    [war.clan || {}, war.opponent || {}].forEach(function (team, index) {
      if (index === 1) return;
      var teamNode = element("div", "live-team");
      var name = element("h3");
      append(name, warTeamLink(team));
      teamNode.appendChild(name);
      teamNode.appendChild(element("p", "", percent(team.destructionPercentage) + " 摧毁率"));
      board.appendChild(teamNode);
    });
    var score = element("div", "live-score", formatNumber(war.clan && war.clan.stars, "0") + " : " + formatNumber(war.opponent && war.opponent.stars, "0"));
    score.appendChild(element("small", "", "胜利之星"));
    board.appendChild(score);
    var opponentNode = element("div", "live-team");
    var opponentBadge = imageNode(war.opponent || {}, displayValue(war.opponent && war.opponent.name, "对手") + "徽章", 56);
    if (opponentBadge) opponentNode.appendChild(opponentBadge);
    var opponentName = element("h3");
    append(opponentName, warTeamLink(war.opponent || {}));
    opponentNode.appendChild(opponentName);
    opponentNode.appendChild(element("p", "", percent(war.opponent && war.opponent.destructionPercentage) + " 摧毁率"));
    board.appendChild(opponentNode);
    return board;
  }
  function warMembersSection(title, team) {
    var rows = sortWarMembersByPosition(team && Array.isArray(team.members) ? team.members : []);
    if (!rows.length) return null;
    return listSection(title, rows, [
      { label: "位次", number: true, render: function (row) { return formatNumber(row.mapPosition); } },
      { label: "玩家", render: function (row) {
        var tag = normalizedLinkedTag(row.tag, "玩家标签");
        return tag ? queryLink("get_player", { player_tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
      } },
      { label: "大本营", number: true, render: function (row) { return formatNumber(row.townhallLevel); } },
      { label: "进攻", number: true, render: function (row) { return formatNumber(Array.isArray(row.attacks) ? row.attacks.length : row.attacks); } },
      { label: "被进攻", number: true, render: function (row) { return formatNumber(row.opponentAttacks); } },
      { label: "最差防守", render: function (row) {
        var attack = row.bestOpponentAttack;
        return attack ? formatNumber(attack.stars) + " 星 / " + percent(attack.destructionPercentage) : "—";
      } }
    ]);
  }
  function renderWar(container, data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return renderWarList(container, data);
    container.appendChild(warScoreboard(data));
    container.appendChild(statGrid([
      ["状态", officialWarStateName(data.state)],
      ["对战规模", formatNumber(data.teamSize)],
      ["每人进攻次数", formatNumber(data.attacksPerMember)],
      ["准备日开始", formatCocDate(data.preparationStartTime)],
      ["对战开始", formatCocDate(data.startTime)],
      ["对战结束", formatCocDate(data.endTime)],
      ["对战模式", data.battleModifier == null ? null : officialBattleModifierName(data.battleModifier)],
      ["联赛对战标签", displayValue(data.tag || data.warTag)]
    ]));
    var actions = [];
    var clanTag = data.clan && normalizedLinkedTag(data.clan.tag, "部落标签");
    var opponentTag = data.opponent && normalizedLinkedTag(data.opponent.tag, "部落标签");
    if (clanTag) actions.push({ action: "get_clan", params: { tag: clanTag }, label: "查看我方部落" });
    if (opponentTag) actions.push({ action: "get_clan", params: { tag: opponentTag }, label: "查看对手部落" });
    addActionLinks(container, actions);
    var ownMembers = warMembersSection("我方成员", data.clan);
    var opponentMembers = warMembersSection("对手成员", data.opponent);
    if (ownMembers) container.appendChild(ownMembers);
    if (opponentMembers) container.appendChild(opponentMembers);
  }
  function renderWarList(container, data) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "部落对战列表");
    container.appendChild(listSection("部落对战", rows, [
      { label: "状态", render: function (row) { return row.state ? officialWarStateName(row.state) : translateWarResult(row.result); } },
      { label: "我方", render: function (row) { return warTeamLink(row.clan || {}); } },
      { label: "我方胜利之星", number: true, render: function (row) { return formatNumber(row.clan && row.clan.stars); } },
      { label: "对手", render: function (row) { return warTeamLink(row.opponent || {}); } },
      { label: "对手胜利之星", number: true, render: function (row) { return formatNumber(row.opponent && row.opponent.stars); } },
      { label: "规模", number: true, render: function (row) { return formatNumber(row.teamSize); } },
      { label: "结束时间", render: function (row) { return formatCocDate(row.endTime); } },
      { label: "联赛对战标签", render: function (row) {
        var tag = normalizedLinkedTag(row.tag || row.warTag, "联赛对战标签");
        return tag ? queryLink("get_league_war", { war_tag: tag }, tag, "") : "—";
      } }
    ]));
  }
  function renderWarLog(container, data) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "部落对战日志");
    container.appendChild(listSection("最近部落对战", rows, [
      { label: "结果", render: function (row) { return translateWarResult(row.result); } },
      { label: "结束时间", render: function (row) { return formatCocDate(row.endTime); } },
      { label: "我方", render: function (row) { return warTeamLink(row.clan || {}); } },
      { label: "我方胜利之星", number: true, render: function (row) { return formatNumber(row.clan && row.clan.stars); } },
      { label: "摧毁率", number: true, render: function (row) { return percent(row.clan && row.clan.destructionPercentage); } },
      { label: "对手", render: function (row) { return warTeamLink(row.opponent || {}); } },
      { label: "对手胜利之星", number: true, render: function (row) { return formatNumber(row.opponent && row.opponent.stars); } },
      { label: "规模", number: true, render: function (row) { return formatNumber(row.teamSize); } }
    ]));
  }
  function renderCwlGroup(container, data) {
    if (!data || typeof data !== "object") return renderStructured(container, data, "部落对战联赛小组");
    container.appendChild(statGrid([
      ["赛季", displayValue(data.season)],
      ["状态", officialWarStateName(data.state)],
      ["参赛部落", formatNumber(Array.isArray(data.clans) ? data.clans.length : undefined)],
      ["轮次", formatNumber(Array.isArray(data.rounds) ? data.rounds.length : undefined)]
    ]));
    var clans = Array.isArray(data.clans) ? data.clans : [];
    if (clans.length) container.appendChild(listSection("参赛部落", clans, [
      { label: "部落", render: function (row) {
        var tag = normalizedLinkedTag(row.tag, "部落标签");
        return tag ? queryLink("get_clan", { tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
      } },
      { label: "标签", render: function (row) { return displayValue(row.tag); } },
      { label: "等级", number: true, render: function (row) { return formatNumber(row.clanLevel); } },
      { label: "成员", number: true, render: function (row) { return formatNumber(Array.isArray(row.members) ? row.members.length : row.members); } }
    ]));
    var rounds = Array.isArray(data.rounds) ? data.rounds : [];
    var roundRows = [];
    rounds.forEach(function (round, roundIndex) {
      var tags = Array.isArray(round.warTags) ? round.warTags : [];
      tags.forEach(function (tag) { roundRows.push({ round: roundIndex + 1, tag: tag }); });
    });
    if (roundRows.length) container.appendChild(listSection("轮次与对战", roundRows, [
      { label: "轮次", number: true, render: function (row) { return formatNumber(row.round); } },
      { label: "联赛对战标签", render: function (row) {
        var tag = normalizedLinkedTag(row.tag, "联赛对战标签");
        return tag ? queryLink("get_league_war", { war_tag: tag }, tag, "") : displayValue(row.tag);
      } }
    ]));
  }
  function sortWarMembersByPosition(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row, index) {
      return { row: row, index: index };
    }).sort(function (left, right) {
      var leftPosition = left.row && left.row.mapPosition;
      var rightPosition = right.row && right.row.mapPosition;
      var leftHasPosition = Number.isInteger(leftPosition) && leftPosition > 0;
      var rightHasPosition = Number.isInteger(rightPosition) && rightPosition > 0;
      if (leftHasPosition !== rightHasPosition) return leftHasPosition ? -1 : 1;
      if (leftHasPosition && leftPosition !== rightPosition) return leftPosition - rightPosition;
      var leftIdentity = String(firstValue(left.row, ["tag", "name"], ""));
      var rightIdentity = String(firstValue(right.row, ["tag", "name"], ""));
      var identityOrder = leftIdentity.localeCompare(rightIdentity, "zh-CN");
      return identityOrder || left.index - right.index;
    }).map(function (item) { return item.row; });
  }
  function officialNonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  function raidTotalMedals(row) {
    var offensive = officialNonNegativeNumber(row && row.offensiveReward);
    var defensive = officialNonNegativeNumber(row && row.defensiveReward);
    if (offensive === undefined || defensive === undefined) return undefined;
    return offensive * 6 + defensive;
  }
  function sortRaidMembersByLoot(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row, index) {
      return { row: row, index: index };
    }).sort(function (left, right) {
      var leftLoot = officialNonNegativeNumber(left.row && left.row.capitalResourcesLooted);
      var rightLoot = officialNonNegativeNumber(right.row && right.row.capitalResourcesLooted);
      var lootOrder = (rightLoot === undefined ? -Infinity : rightLoot) - (leftLoot === undefined ? -Infinity : leftLoot);
      if (lootOrder) return lootOrder;
      var leftAttacks = officialNonNegativeNumber(left.row && left.row.attacks);
      var rightAttacks = officialNonNegativeNumber(right.row && right.row.attacks);
      var attackOrder = (rightAttacks === undefined ? -Infinity : rightAttacks) - (leftAttacks === undefined ? -Infinity : leftAttacks);
      if (attackOrder) return attackOrder;
      var leftIdentity = String(firstValue(left.row, ["tag", "name"], ""));
      var rightIdentity = String(firstValue(right.row, ["tag", "name"], ""));
      var identityOrder = leftIdentity.localeCompare(rightIdentity, "zh-CN");
      return identityOrder || left.index - right.index;
    }).map(function (item) { return item.row; });
  }
  function renderRaidLog(container, data) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "突袭周末记录");
    container.appendChild(listSection("突袭周末", rows, [
      { label: "开始", render: function (row) { return formatCocDate(row.startTime); } },
      { label: "状态", render: function (row) { return officialRaidStateName(row.state); } },
      { label: "获得的都城战利品总数", number: true, render: function (row) { return formatNumber(row.capitalTotalLoot); } },
      { label: "完成的突袭次数", number: true, render: function (row) { return formatNumber(row.raidsCompleted); } },
      { label: "总进攻次数", number: true, render: function (row) { return formatNumber(row.totalAttacks); } },
      { label: "进攻奖励（突袭奖章）", number: true, render: function (row) { return formatNumber(row.offensiveReward); } },
      { label: "防守奖励（突袭奖章）", number: true, render: function (row) { return formatNumber(row.defensiveReward); } },
      { label: "总奖章", number: true, render: function (row) { return formatNumber(raidTotalMedals(row)); } }
    ]));
    var latest = rows[0] || {};
    container.appendChild(statGrid([
      ["本次开始", formatCocDate(latest.startTime)],
      ["本次结束", formatCocDate(latest.endTime)],
      ["每人基础进攻", formatNumber(latest.attackLimit)],
      ["额外进攻上限", formatNumber(latest.bonusAttackLimit)],
      ["参与成员", formatNumber(Array.isArray(latest.members) ? latest.members.length : undefined)],
      ["获得的都城战利品总数", formatNumber(latest.capitalTotalLoot)]
    ]));
    var members = sortRaidMembersByLoot(Array.isArray(latest.members) ? latest.members : []);
    if (members.length) container.appendChild(listSection("成员贡献", members, [
      { label: "玩家", render: function (row) {
        var tag = normalizedLinkedTag(row.tag, "玩家标签");
        return tag ? queryLink("get_player", { player_tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
      } },
      { label: "进攻次数", number: true, render: function (row) { return formatNumber(row.attacks); } },
      { label: "进攻上限", number: true, render: function (row) { return formatNumber(row.attackLimit); } },
      { label: "额外进攻", number: true, render: function (row) { return formatNumber(row.bonusAttackLimit); } },
      { label: "夺取的都城金币", number: true, render: function (row) { return formatNumber(row.capitalResourcesLooted); } }
    ]));
    var attacks = Array.isArray(latest.attackLog) ? latest.attackLog : [];
    var defenses = Array.isArray(latest.defenseLog) ? latest.defenseLog : [];
    [
      ["进攻记录", attacks],
      ["防守记录", defenses]
    ].forEach(function (group) {
      if (!group[1].length) return;
      container.appendChild(listSection(group[0], group[1], [
        { label: "部落", render: function (row) {
          return clanQueryIdentity(row.defender || row.attacker || row, 32);
        } },
        { label: "等级", number: true, render: function (row) { return formatNumber(row.level); } },
        { label: "进攻次数", number: true, render: function (row) { return formatNumber(row.attackCount); } },
        { label: "夺取的都城金币", number: true, render: function (row) { return formatNumber(row.capitalResourcesLooted); } },
        { label: "摧毁的敌方子城", number: true, render: function (row) { return formatNumber(row.districtCount); } }
      ]));
    });
  }
  function locationActions(location) {
    var id = Number(location && location.id);
    if (!Number.isInteger(id) || id < 0) return [];
    return [
      { action: "get_location_clans", params: { location_id: id }, label: "部落积分榜" },
      { action: "get_location_players", params: { location_id: id }, label: "玩家奖杯榜" },
      { action: "get_location_clans_capital", params: { location_id: id }, label: "都城奖杯榜" },
      { action: "get_location_clans_builder_base", params: { location_id: id }, label: "建筑大师基地部落榜" },
      { action: "get_location_players_builder_base", params: { location_id: id }, label: "建筑大师基地玩家榜" }
    ];
  }
  function renderLocationList(container, data) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "地区目录");
    container.appendChild(listSection("地区", rows, [
      { label: "地区", render: function (row) { return queryLink("get_location", { location_id: row.id }, displayValue(row.name, row.id), ""); } },
      { label: "编号", number: true, render: function (row) { return formatNumber(row.id); } },
      { label: "国家", render: function (row) { return displayValue(row.isCountry); } },
      { label: "国家代码", render: function (row) { return displayValue(row.countryCode); } },
      { label: "排行榜", render: function (row) {
        return Number.isInteger(Number(row.id)) ? queryLink("get_location_players", { location_id: Number(row.id) }, "打开玩家榜", "") : "—";
      } }
    ]));
  }
  function renderLocation(container, data) {
    if (!data || typeof data !== "object") return renderStructured(container, data, "地区资料");
    container.appendChild(identityBlock(data, {
      title: displayValue(data.name, "未命名地区"),
      tag: data.id != null ? "地区编号 " + data.id : "",
      subtitle: data.isCountry ? "国家或地区" : "全球分区",
      image: data,
      alt: ""
    }));
    container.appendChild(statGrid([
      ["地区编号", formatNumber(data.id)],
      ["国家或地区", displayValue(data.isCountry)],
      ["国家代码", displayValue(data.countryCode)]
    ]));
    addActionLinks(container, locationActions(data));
  }
  function renderRanking(container, data, context) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "排行榜");
    var actionName = context && context.action || "";
    var players = actionName.indexOf("players") >= 0 || actionName === "get_season_rankings";
    var builderBaseRanking = actionName.indexOf("builder_base") >= 0;
    var capitalRanking = actionName.indexOf("clans_capital") >= 0;
    if (players) {
      container.appendChild(listSection("玩家排名", rows, [
        { label: "排名", number: true, render: function (row, index) { return formatNumber(firstValue(row, ["rank"], index + 1)); } },
        { label: "上期", number: true, render: function (row) { return formatNumber(row.previousRank); } },
        { label: "玩家", render: function (row) {
          var tag = normalizedLinkedTag(row.tag, "玩家标签");
          return tag ? queryLink("get_player", { player_tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
        } },
        { label: builderBaseRanking ? "建筑大师基地奖杯" : "奖杯", number: true, render: function (row) { return formatNumber(firstValue(row, ["trophies", "builderBaseTrophies", "versusTrophies"])); } },
        { label: "大本营", number: true, render: function (row) { return formatNumber(row.townHallLevel); } },
        { label: "部落", render: function (row) {
          var clan = playerClan(row);
          return clan ? queryLink("get_clan", { tag: clan.tag }, clan.name, "") : "无部落";
        } }
      ]));
    } else {
      container.appendChild(listSection("部落排名", rows, [
        { label: "排名", number: true, render: function (row, index) { return formatNumber(firstValue(row, ["rank"], index + 1)); } },
        { label: "上期", number: true, render: function (row) { return formatNumber(row.previousRank); } },
        { label: "部落", render: function (row) {
          var tag = normalizedLinkedTag(row.tag, "部落标签");
          return tag ? queryLink("get_clan", { tag: tag }, displayValue(row.name, tag), "") : displayValue(row.name);
        } },
        { label: "等级", number: true, render: function (row) { return formatNumber(row.clanLevel); } },
        { label: capitalRanking ? "都城奖杯" : builderBaseRanking ? "建筑大师基地积分" : "部落积分", number: true, render: function (row) { return formatNumber(firstValue(row, ["clanPoints", "clanCapitalPoints", "clanBuilderBasePoints", "clanVersusPoints"])); } },
        { label: "成员", number: true, render: function (row) { return formatNumber(row.members); } },
        { label: "所在地", render: function (row) { return displayValue(row.location && row.location.name); } }
      ]));
    }
  }
  function leagueDetailAction(sourceAction) {
    if (/builder_base/.test(sourceAction)) return "get_builder_base_league";
    if (/war_league/.test(sourceAction)) return "get_war_league";
    if (/capital/.test(sourceAction)) return "get_capital_league";
    return "get_league";
  }
  function leagueKind(sourceAction) {
    if (/builder_base/.test(sourceAction)) return "builder";
    if (/war_league/.test(sourceAction)) return "war";
    if (/capital/.test(sourceAction)) return "capital";
    return "traditional";
  }
  function renderLeagueList(container, data, context) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "联赛目录");
    var detailAction = leagueDetailAction(context && context.action || "");
    var kind = leagueKind(context && context.action || "");
    container.appendChild(listSection("联赛", rows, [
      { label: "联赛", render: function (row) {
        var name = officialLeagueName(row.name, { kind: kind, short: false });
        return row.id != null ? queryLink(detailAction, { league_id: Number(row.id) }, name, "") : name;
      } },
      { label: "编号", number: true, render: function (row) { return formatNumber(row.id); } },
      { label: "图标", render: function (row) {
        var image = imageNode(row, "", 40);
        if (image) { image.className = ""; image.width = 40; image.height = 40; }
        return image || "—";
      } }
    ]));
  }
  function renderLeague(container, data, context) {
    if (!data || typeof data !== "object") return renderStructured(container, data, "联赛资料");
    var kind = leagueKind(context && context.action || "");
    var leagueName = officialLeagueName(data.name, { kind: kind, short: false });
    container.appendChild(identityBlock(data, {
      title: leagueName,
      tag: data.id != null ? "联赛编号 " + data.id : "",
      subtitle: "",
      image: data,
      alt: leagueName + "徽章"
    }));
    var tiers = Array.isArray(data.tiers) ? data.tiers : [];
    if (tiers.length) container.appendChild(listSection("分段", tiers, [
      { label: "编号", number: true, render: function (row) { return formatNumber(row.id); } },
      { label: "名称", render: function (row) { return officialLeagueName(row.name, { kind: kind, short: false }); } },
      { label: "图标", render: function (row) {
        var image = imageNode(row, "", 36);
        if (image) { image.className = ""; image.width = 36; image.height = 36; }
        return image || "—";
      } }
    ]));
    if ((context && context.action || "").indexOf("get_league") === 0 && Number(data.id) === LEGEND_LEAGUE_ID) {
      addActionLinks(container, [
        { action: "get_seasons", params: { league_id: LEGEND_LEAGUE_ID }, label: "查看传奇杯联赛赛季" }
      ]);
    }
  }
  function renderSeasonList(container, data, context) {
    var rows = getItems(data);
    if (!rows.length && Array.isArray(data)) rows = data;
    if (!rows.length) return renderStructured(container, data, "赛季目录");
    var leagueId = context && context.params && Number(context.params.league_id) || LEGEND_LEAGUE_ID;
    var normalized = rows.map(function (item) { return typeof item === "object" ? firstValue(item, ["id", "season"], "") : item; }).filter(Boolean);
    container.appendChild(listSection("可查询赛季", normalized, [
      { label: "赛季", render: function (row) { return queryLink("get_season_rankings", { league_id: leagueId, season_id: String(row) }, String(row), ""); } },
      { label: "联赛编号", number: true, render: function () { return formatNumber(leagueId); } }
    ]));
  }
  function renderLabelList(container, data, context) {
    var rows = getItems(data);
    if (!rows.length) return renderStructured(container, data, "标签目录");
    container.appendChild(listSection("官方标签", rows, [
      { label: "名称", render: function (row) {
        var name = officialLabelName(row);
        if (context && context.action === "get_clan_labels" && Number.isInteger(Number(row.id)) && Number(row.id) > 0) {
          return queryLink("search_clans", { label_ids: [Number(row.id)] }, name, "");
        }
        return name;
      } },
      { label: "编号", number: true, render: function (row) { return formatNumber(row.id); } },
      { label: "图标", render: function (row) {
        var image = imageNode(row, "", 40);
        if (image) { image.className = ""; image.width = 40; image.height = 40; }
        return image || "—";
      } }
    ]));
  }
  function renderGoldpass(container, data) {
    if (!data || typeof data !== "object") return renderStructured(container, data, "黄金令牌赛季");
    var start = parseCocDate(firstValue(data, ["startTime", "start_time"]));
    var end = parseCocDate(firstValue(data, ["endTime", "end_time"]));
    var days = start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000)) : null;
    container.appendChild(element("p", "live-callout is-warning", "这里显示的是官方黄金令牌赛季时间，不是玩家购买状态或奖励领取记录。"));
    container.appendChild(statGrid([
      ["开始时间", formatCocDate(start || data.startTime)],
      ["结束时间", formatCocDate(end || data.endTime)],
      ["赛季时长", days == null ? "—" : days + " 天"]
    ]));
  }
  function simpleEntries(object) {
    if (!object || typeof object !== "object" || Array.isArray(object)) return [];
    return Object.keys(object).filter(function (key) {
      var value = object[key];
      return value == null || ["string", "number", "boolean"].indexOf(typeof value) >= 0;
    }).slice(0, 24).map(function (key) { return [key, object[key]]; });
  }
  function renderStructured(container, data, title, depth) {
    depth = Number(depth) || 0;
    if (data == null) {
      container.appendChild(element("p", "live-empty", "接口返回了空结果。"));
      return;
    }
    if (["string", "number", "boolean"].indexOf(typeof data) >= 0) {
      container.appendChild(element("p", "live-callout", displayValue(data)));
      return;
    }
    if (Array.isArray(data)) {
      if (!data.length) {
        container.appendChild(element("p", "live-empty", "没有可显示的项目。"));
        return;
      }
      if (data.every(function (item) { return ["string", "number", "boolean"].indexOf(typeof item) >= 0; })) {
        var primitiveSection = section(title || "结果", data.length);
        primitiveSection.appendChild(pills(data));
        container.appendChild(primitiveSection);
        return;
      }
      var keys = [];
      data.slice(0, 12).forEach(function (item) {
        simpleEntries(item).forEach(function (entry) {
          if (keys.indexOf(entry[0]) < 0 && keys.length < 8) keys.push(entry[0]);
        });
      });
      if (keys.length) {
        container.appendChild(listSection(title || "结果", data, keys.map(function (key) {
          return { label: officialStructuredFieldName(key), render: function (row) { return officialStructuredValue(key, row && row[key]); } };
        })));
      } else {
        container.appendChild(element("p", "live-callout", "结果包含嵌套资料，已在下方按项目展开。"));
      }
      return;
    }
    var entries = simpleEntries(data);
    if (entries.length) {
      var grid = element("dl", "live-object-grid");
      entries.forEach(function (entry) {
        var item = element("div", "live-key-value");
        item.appendChild(element("dt", "", officialStructuredFieldName(entry[0])));
        item.appendChild(element("dd", "", officialStructuredValue(entry[0], entry[1])));
        grid.appendChild(item);
      });
      container.appendChild(grid);
    }
    if (depth >= 2) return;
    Object.keys(data).filter(function (key) {
      return data[key] && typeof data[key] === "object";
    }).slice(0, 12).forEach(function (key) {
      var child = data[key];
      var childTitle = officialStructuredFieldName(key);
      var childSection = section(childTitle, Array.isArray(child) ? child.length : null);
      renderStructured(childSection, child, childTitle, depth + 1);
      container.appendChild(childSection);
    });
  }
  var RENDERERS = {
    player: renderPlayer,
    "player-list": renderPlayerList,
    clan: renderClan,
    "clan-list": renderClanList,
    members: renderMembers,
    war: renderWar,
    "war-list": renderWarList,
    "war-log": renderWarLog,
    "cwl-group": renderCwlGroup,
    "raid-log": renderRaidLog,
    "location-list": renderLocationList,
    location: renderLocation,
    ranking: renderRanking,
    "league-list": renderLeagueList,
    league: renderLeague,
    "season-list": renderSeasonList,
    "label-list": renderLabelList,
    goldpass: renderGoldpass,
    structured: renderStructured
  };
  function renderFriendlyResult(actionName, data, params, container, collectedAt) {
    var renderer = RENDERERS[rendererKind(actionName)] || renderStructured;
    container.replaceChildren();
    renderer(container, data, { action: actionName, params: params || {}, collectedAt: collectedAt });
    if (!container.childNodes.length) container.appendChild(element("p", "live-empty", "接口返回了空结果。"));
  }

  var connected = false;
  var capabilities = null;
  var availableActions = null;
  var connectionPromise = null;
  var connectionGeneration = 0;
  var queryGeneration = 0;
  var currentAction = "get_player";
  var lastAction = "";
  var lastParams = {};
  var lastResult = null;
  var urlTimer = 0;
  var QUERY_HISTORY_LIMIT = 20;
  var queryHistory = [];
  var queryHistoryIndex = -1;

  function byId(id) { return document.getElementById(id); }
  function setStatus(text, tone) {
    var node = byId("cocLiveStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("is-ok", tone === "ok");
    node.classList.toggle("is-error", tone === "error");
    node.classList.toggle("is-checking", tone === "checking");
  }
  function setServiceDetail(text) {
    var node = byId("cocServiceDetail");
    if (node) node.textContent = text;
  }
  function setMessage(text, tone) {
    var node = byId("cocLiveError");
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("is-error", tone === "error");
    node.classList.toggle("is-success", tone === "success");
  }
  function setResultBusy(busy) {
    var container = byId("cocFriendlyResult");
    if (container) container.setAttribute("aria-busy", String(Boolean(busy)));
  }
  function resetResultState(message) {
    lastAction = "";
    lastParams = {};
    lastResult = null;
    var raw = byId("cocResult");
    var friendly = byId("cocFriendlyResult");
    var details = byId("cocRawJsonDetails");
    if (raw) raw.textContent = "";
    if (friendly) {
      friendly.replaceChildren(element("p", "coc-friendly-empty", message || "结果会显示为可继续点击的资料卡和表格。"));
      friendly.setAttribute("aria-busy", "false");
    }
    if (details) details.open = false;
    if (byId("cocResultMeta")) byId("cocResultMeta").textContent = "尚未查询";
    if (byId("cocCopyResult")) byId("cocCopyResult").disabled = true;
    if (byId("cocDownloadResult")) byId("cocDownloadResult").disabled = true;
  }
  function copyQueryParams(params) {
    return JSON.parse(JSON.stringify(params || {}));
  }
  function sameQuerySnapshot(snapshot, actionName, params) {
    return Boolean(snapshot) && snapshot.action === actionName &&
      JSON.stringify(snapshot.params) === JSON.stringify(params || {});
  }
  function updateQueryHistoryButtons(busy) {
    var previous = byId("cocQueryPrevious");
    var next = byId("cocQueryNext");
    var previousEntry = queryHistoryIndex > 0 ? queryHistory[queryHistoryIndex - 1] : null;
    var nextEntry = queryHistoryIndex >= 0 && queryHistoryIndex < queryHistory.length - 1 ? queryHistory[queryHistoryIndex + 1] : null;
    if (previous) {
      previous.disabled = Boolean(busy) || !previousEntry;
      previous.title = previousEntry ? "上一次：" + ACTION_MAP[previousEntry.action].title : "没有更早的查询";
    }
    if (next) {
      next.disabled = Boolean(busy) || !nextEntry;
      next.title = nextEntry ? "下一次：" + ACTION_MAP[nextEntry.action].title : "没有更晚的查询";
    }
  }
  function recordQuerySnapshot(actionName, params, result, collectedAt) {
    var normalized = copyQueryParams(params);
    if (queryHistoryIndex < queryHistory.length - 1) queryHistory = queryHistory.slice(0, queryHistoryIndex + 1);
    var snapshot = { action: actionName, params: normalized, result: result, collectedAt: collectedAt };
    if (sameQuerySnapshot(queryHistory[queryHistoryIndex], actionName, normalized)) {
      queryHistory[queryHistoryIndex] = snapshot;
      return;
    }
    queryHistory.push(snapshot);
    if (queryHistory.length > QUERY_HISTORY_LIMIT) queryHistory.shift();
    queryHistoryIndex = queryHistory.length - 1;
  }
  function restoreQuerySnapshot(offset) {
    var targetIndex = queryHistoryIndex + Number(offset || 0);
    if (targetIndex < 0 || targetIndex >= queryHistory.length || targetIndex === queryHistoryIndex) return;
    var snapshot = queryHistory[targetIndex];
    queryHistoryIndex = targetIndex;
    queryGeneration += 1;
    setResultBusy(false);
    selectAction(snapshot.action, snapshot.params, { keepResult: true });
    applyNormalizedParams(snapshot.params);
    lastAction = snapshot.action;
    lastParams = copyQueryParams(snapshot.params);
    lastResult = snapshot.result;
    renderFriendlyResult(snapshot.action, snapshot.result, snapshot.params, byId("cocFriendlyResult"), snapshot.collectedAt);
    byId("cocResult").textContent = JSON.stringify(snapshot.result, null, 2);
    byId("cocCopyResult").disabled = false;
    byId("cocDownloadResult").disabled = false;
    byId("cocResultMeta").textContent = successfulMeta(snapshot.action, snapshot.collectedAt);
    setMessage(offset < 0 ? "已回到上一次查询。" : "已前往下一次查询。", "success");
    writeUrl(snapshot.params, true);
    updateQueryHistoryButtons(false);
  }
  function setButtonsBusy(busy) {
    ["cocFriendlyRun", "cocRun", "cocConnect"].forEach(function (id) {
      var button = byId(id);
      if (button) button.disabled = Boolean(busy);
    });
  }
  function desktopBridge(method) {
    try {
      if (root.tzDesktop && typeof root.tzDesktop[method] === "function") return root.tzDesktop;
      if (root.top && root.top !== root && root.top.tzDesktop && typeof root.top.tzDesktop[method] === "function") return root.top.tzDesktop;
    } catch (_error) {}
    return null;
  }
  function cloudSecurity() {
    try {
      if (root.TZCloudSecurity && typeof root.TZCloudSecurity.getToken === "function") return root.TZCloudSecurity;
      if (root.top && root.top !== root && root.top.TZCloudSecurity && typeof root.top.TZCloudSecurity.getToken === "function") return root.top.TZCloudSecurity;
    } catch (_error) {}
    return null;
  }
  function turnstileToken() {
    var security = cloudSecurity();
    if (!security) return Promise.reject(new Error("云端安全验证尚未配置，请刷新页面后重试"));
    return Promise.resolve(security.getToken("coc_query")).then(function (token) {
      token = String(token || "").trim();
      if (!token || token.length > 2048) throw new Error("云端安全验证失败，请重试");
      return token;
    });
  }
  function delay(ms) {
    return new Promise(function (resolve) { root.setTimeout(resolve, ms); });
  }
  function acceptCloudResponse(status, ok, body) {
    if (!ok) {
      var code = body && body.error && body.error.code || "";
      var error = new Error(body && body.error && (body.error.message || code) || ("云端查询 HTTP " + status));
      error.code = String(code || "");
      error.status = Number(status) || 0;
      error.retryable = cloudErrorRetryable(status, code);
      throw error;
    }
    return envelope(body);
  }
  function cloudRequest(path, options, requireToken) {
    options = options || {};
    var attempts = 3;
    function run(attempt) {
      var tokenTask = requireToken ? turnstileToken() : Promise.resolve("");
      return tokenTask.then(function (token) {
        var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
        if (token) headers["X-Turnstile-Token"] = token;
        if (options.body != null) headers["Content-Type"] = "application/json";
        var bridge = desktopBridge("cocCloudRequest");
        if (bridge) {
          return Promise.resolve(bridge.cocCloudRequest({
            path: path,
            method: options.method || "GET",
            token: token,
            body: options.body
          })).then(function (response) {
            if (!response || typeof response !== "object") throw new Error("桌面云端代理返回了无效响应");
            var body = response.body;
            if (typeof body === "string") {
              try { body = JSON.parse(body); } catch (_error) { body = null; }
            }
            return acceptCloudResponse(Number(response.status) || 0, response.ok === true, body);
          }).catch(function (error) {
            if (!error.status && !error.code) error.retryable = true;
            throw error;
          });
        }
        var requestOptions = Object.assign({
          method: "GET",
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
          headers: headers
        }, options);
        var timer = 0;
        var controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
        if (controller) {
          requestOptions.signal = controller.signal;
          timer = root.setTimeout(function () { controller.abort(); }, 25000);
        }
        return root.fetch(CLOUD_ROOT + path, requestOptions).then(function (response) {
          return response.json().catch(function () { return null; }).then(function (body) {
            return acceptCloudResponse(response.status, response.ok, body);
          });
        }).finally(function () {
          if (timer) root.clearTimeout(timer);
        });
      }).catch(function (error) {
        var retryable = error && error.retryable === true || error instanceof TypeError;
        if (!retryable || attempt + 1 >= attempts) throw error;
        return delay(350 * Math.pow(2, attempt)).then(function () { return run(attempt + 1); });
      });
    }
    return run(0);
  }
  function actionAvailable(actionName) {
    return availableActions === null || availableActions.has(actionName);
  }
  function renderCapabilityState() {
    var count = availableActions === null ? ACTION_CATALOG.length : availableActions.size;
    var countNode = byId("cocCapabilityCount");
    if (countNode) countNode.textContent = count + " / " + ACTION_CATALOG.length + " 项";
    var note = byId("cocCapabilityNote");
    if (note) {
      note.textContent = availableActions === null
        ? "暂时无法确认可用查询；所有项目仍可浏览，使用时会自动重试。"
        : count === ACTION_CATALOG.length
          ? "已确认：全部 " + ACTION_CATALOG.length + " 项公开资料查询均可使用。"
          : "云端查询服务当前可用 " + count + " 项查询；其余项目暂时无法使用。";
    }
    renderNavigation();
    renderDeveloperActions();
  }
  function connect(force) {
    if (connected && !force) return Promise.resolve(capabilities);
    if (connectionPromise && !force) return connectionPromise;
    var generation = ++connectionGeneration;
    connected = false;
    setStatus("正在检查", "checking");
    setServiceDetail("正在检查云端查询服务和可用查询。");
    var button = byId("cocConnect");
    if (button) { button.disabled = true; button.textContent = "正在连接…"; }
    var pending = cloudRequest("/api/health", { method: "GET" }, false)
      .then(function () { return cloudRequest("/api/coc/capabilities", { method: "GET" }, true); })
      .then(function (documentValue) {
        if (generation !== connectionGeneration) throw STALE_QUERY;
        var filtered = safeActions(documentValue);
        capabilities = documentValue;
        availableActions = new Set(filtered.map(function (item) { return item.action; }));
        connected = true;
        setStatus("服务在线", "ok");
        setServiceDetail("云端查询服务已连接，" + availableActions.size + " 项公开资料查询可用；完成首次查询后会再次确认。");
        renderCapabilityState();
        return documentValue;
      }).catch(function (error) {
        if (error === STALE_QUERY) throw error;
        if (generation !== connectionGeneration) throw STALE_QUERY;
        connected = false;
        availableActions = null;
        setStatus("暂时不可用", "error");
        setServiceDetail(errorText(error));
        renderCapabilityState();
        throw error;
      }).finally(function () {
        if (button && generation === connectionGeneration) {
          button.disabled = false;
          button.textContent = "检查并重试连接";
        }
        if (connectionPromise === pending) connectionPromise = null;
      });
    connectionPromise = pending;
    return pending;
  }
  function fieldDefault(item) {
    return item.defaultValue == null ? "" : item.defaultValue;
  }
  function defaultParamsForAction(actionName) {
    var spec = ACTION_MAP[actionName];
    var params = {};
    if (!spec) return params;
    spec.fields.forEach(function (item) {
      if (item.defaultValue != null) params[item.name] = item.defaultValue;
    });
    return params;
  }
  function developerDefaults(actionName) {
    if (actionName === "search_clans") return { name: "Darwin", limit: 20 };
    var spec = ACTION_MAP[actionName];
    var params = defaultParamsForAction(actionName);
    if (!spec) return params;
    spec.fields.forEach(function (item) {
      if (!item.required || params[item.name] != null) return;
      if (item.type === "tag") params[item.name] = "#2PP";
      else if (item.type === "tags") params[item.name] = ["#2PP"];
      else if (item.type === "integer") params[item.name] = item.name === "league_id" ? LEGEND_LEAGUE_ID : 0;
      else if (item.type === "month") params[item.name] = new Date().toISOString().slice(0, 7);
      else params[item.name] = "";
    });
    return params;
  }
  function actionHref(actionName, params, run) {
    return buildShareUrl(actionName, params || {}, root.location && root.location.href, Boolean(run));
  }
  function renderNavigation() {
    var categoryNav = byId("cocCategoryNav");
    var toolNav = byId("cocToolNav");
    if (!categoryNav || !toolNav) return;
    categoryNav.replaceChildren();
    CATEGORIES.forEach(function (category) {
      var firstAction = ACTION_CATALOG.find(function (item) { return item.category === category.id; });
      var link = element("a");
      link.href = actionHref(firstAction.action, {}, false);
      link.setAttribute("data-query-link", firstAction.action);
      link.setAttribute("data-query-params", "{}");
      link.setAttribute("data-query-run", "false");
      if (ACTION_MAP[currentAction].category === category.id) link.setAttribute("aria-current", "true");
      link.appendChild(element("b", "", category.title));
      var count = ACTION_CATALOG.filter(function (item) { return item.category === category.id; }).length;
      link.appendChild(element("small", "", category.note + " · " + count));
      categoryNav.appendChild(link);
    });
    toolNav.replaceChildren();
    var currentCategory = ACTION_MAP[currentAction].category;
    ACTION_CATALOG.filter(function (item) { return item.category === currentCategory; }).forEach(function (item) {
      var link = element("a", actionAvailable(item.action) ? "" : "is-unavailable", item.title);
      link.href = actionHref(item.action, defaultParamsForAction(item.action), false);
      link.setAttribute("data-query-link", item.action);
      link.setAttribute("data-query-params", JSON.stringify(defaultParamsForAction(item.action)));
      link.setAttribute("data-query-run", "false");
      if (item.action === currentAction) link.setAttribute("aria-current", "page");
      if (!actionAvailable(item.action)) link.setAttribute("aria-disabled", "true");
      toolNav.appendChild(link);
    });
  }
  function createFieldControl(item, value) {
    var id = "cocField_" + item.name;
    var wrapper = element("div", "coc-live-field" + (item.wide ? " is-wide" : ""));
    if (item.type === "checkbox") {
      var checkLabel = element("label", "coc-live-check");
      checkLabel.htmlFor = id;
      var checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.name = item.name;
      checkbox.checked = value === true || value === "1" || value === "true";
      checkbox.defaultChecked = checkbox.checked;
      checkbox.setAttribute("data-friendly-field", item.name);
      checkLabel.appendChild(checkbox);
      checkLabel.appendChild(element("span", "", item.label));
      wrapper.appendChild(checkLabel);
      if (item.hint) {
        var checkHint = element("p", "coc-live-hint", item.hint);
        checkHint.id = id + "_hint";
        checkbox.setAttribute("aria-describedby", checkHint.id);
        wrapper.appendChild(checkHint);
      }
      return wrapper;
    }
    var label = element("label", "", item.label);
    label.htmlFor = id;
    if (item.required) label.appendChild(element("span", "coc-live-required", "必填"));
    wrapper.appendChild(label);
    var control;
    if (item.type === "select") {
      control = element("select");
      (item.options || []).forEach(function (choice) {
        var option = element("option", "", choice[1]);
        option.value = choice[0];
        control.appendChild(option);
      });
      control.value = value == null ? "" : String(value);
    } else if (item.type === "tags" || item.type === "integer-list") {
      control = element("textarea");
      control.rows = 4;
      control.value = Array.isArray(value) ? value.join("\n") : displayValue(value, "");
    } else {
      control = element("input");
      control.type = item.type === "month" ? "month" : item.type === "integer" ? "number" : "text";
      control.value = value == null ? "" : String(value);
      if (item.type === "integer") {
        control.inputMode = "numeric";
        control.step = "1";
        if (item.min != null) control.min = String(item.min);
        if (item.max != null) control.max = String(item.max);
      }
    }
    control.id = id;
    control.name = item.name;
    control.defaultValue = control.value;
    control.setAttribute("data-friendly-field", item.name);
    control.autocomplete = "off";
    if (item.required) {
      control.required = true;
      control.setAttribute("aria-required", "true");
    }
    if (item.placeholder && "placeholder" in control) control.placeholder = item.placeholder;
    if (item.type === "tag" || item.type === "tags" || item.type === "cursor") control.spellcheck = false;
    if (item.hint) {
      var hint = element("p", "coc-live-hint", item.hint);
      hint.id = id + "_hint";
      control.setAttribute("aria-describedby", hint.id);
      wrapper.appendChild(control);
      wrapper.appendChild(hint);
    } else wrapper.appendChild(control);
    return wrapper;
  }
  function renderFriendlyFields(params) {
    var spec = ACTION_MAP[currentAction];
    var host = byId("cocFriendlyFields");
    host.replaceChildren();
    var mainFields = spec.fields.filter(function (item) { return !item.advanced; });
    var advancedFields = spec.fields.filter(function (item) { return item.advanced; });
    if (!mainFields.length && !advancedFields.length) {
      host.appendChild(element("p", "live-callout", "这个查询不需要参数，直接执行即可。"));
    }
    mainFields.forEach(function (item) {
      var value = Object.prototype.hasOwnProperty.call(params || {}, item.name) ? params[item.name] : fieldDefault(item);
      if (item.name === "league_name" && value) value = officialLeagueName(value, { kind: leagueKind(spec.action), short: false });
      host.appendChild(createFieldControl(item, value));
    });
    if (advancedFields.length) {
      var details = element("details", "coc-live-advanced");
      details.appendChild(element("summary", "", "分页与高级条件"));
      var grid = element("div", "coc-live-advanced-fields");
      advancedFields.forEach(function (item) {
        var value = Object.prototype.hasOwnProperty.call(params || {}, item.name) ? params[item.name] : fieldDefault(item);
        if (item.name === "league_name" && value) value = officialLeagueName(value, { kind: leagueKind(spec.action), short: false });
        grid.appendChild(createFieldControl(item, value));
        if (value !== "" && value != null && value !== false) details.open = true;
      });
      details.appendChild(grid);
      host.appendChild(details);
    }
    host.querySelectorAll("[data-friendly-field]").forEach(function (control) {
      control.addEventListener("input", function () {
        control.removeAttribute("aria-invalid");
        setMessage("已更新查询条件。提交后会把状态写入网址。");
        scheduleUrlUpdate();
      });
      if (spec.fields.find(function (item) { return item.name === control.name; }).type === "tag") {
        control.addEventListener("blur", function () {
          if (!control.value.trim()) return;
          try { control.value = normalizeCocTag(control.value, spec.fields.find(function (item) { return item.name === control.name; }).label); }
          catch (_error) {}
        });
      }
    });
  }
  function renderRelatedActions(spec) {
    var host = byId("cocActionLinks");
    host.replaceChildren();
    if (!spec.related.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    spec.related.forEach(function (actionName) {
      if (!ACTION_MAP[actionName]) return;
      var link = element("a", "", ACTION_MAP[actionName].title);
      link.href = actionHref(actionName, defaultParamsForAction(actionName), false);
      link.setAttribute("data-query-link", actionName);
      link.setAttribute("data-query-params", JSON.stringify(defaultParamsForAction(actionName)));
      link.setAttribute("data-query-run", "false");
      host.appendChild(link);
    });
  }
  function collectRawParams() {
    var params = {};
    var spec = ACTION_MAP[currentAction];
    spec.fields.forEach(function (item) {
      var control = byId("cocField_" + item.name);
      if (!control) return;
      params[item.name] = item.type === "checkbox" ? control.checked : control.value;
    });
    return params;
  }
  function applyNormalizedParams(params) {
    var spec = ACTION_MAP[currentAction];
    spec.fields.forEach(function (item) {
      var control = byId("cocField_" + item.name);
      if (!control || !Object.prototype.hasOwnProperty.call(params, item.name)) return;
      if (item.type === "checkbox") control.checked = Boolean(params[item.name]);
      else if (Array.isArray(params[item.name])) control.value = params[item.name].join("\n");
      else if (item.name === "league_name") control.value = officialLeagueName(params[item.name], { kind: leagueKind(spec.action), short: false });
      else control.value = String(params[item.name]);
    });
  }
  function focusInvalid(message) {
    var spec = ACTION_MAP[currentAction];
    var target = null;
    spec.fields.some(function (item) {
      var control = byId("cocField_" + item.name);
      if (!control) return false;
      var emptyRequired = item.required && !String(item.type === "checkbox" ? control.checked : control.value || "").trim();
      if (emptyRequired || String(message).indexOf(item.label) >= 0) {
        target = control;
        return true;
      }
      return false;
    });
    if (!target && currentAction === "search_clans") target = byId("cocField_name");
    if (!target && /游标/.test(String(message))) target = byId("cocField_before");
    if (target) {
      target.setAttribute("aria-invalid", "true");
      var advanced = target.closest("details");
      if (advanced) advanced.open = true;
      target.focus();
    }
  }
  function currentShareParams() {
    try { return normalizeParams(currentAction, collectRawParams()); }
    catch (_error) { return collectRawParams(); }
  }
  function writeUrl(params, shouldRun, mode) {
    if (!root.history || typeof root.history.replaceState !== "function") return;
    var url = new URL(buildShareUrl(currentAction, params || {}, root.location.href, shouldRun));
    if ((mode || (byId("cocDeveloperDetails") && byId("cocDeveloperDetails").open)) === "developer") url.searchParams.set("mode", "developer");
    root.history.replaceState({ action: currentAction }, "", url.toString());
  }
  function scheduleUrlUpdate() {
    if (!root.history) return;
    root.clearTimeout(urlTimer);
    urlTimer = root.setTimeout(function () {
      writeUrl(currentShareParams(), false);
    }, 180);
  }
  function selectAction(actionName, params, options) {
    options = options || {};
    var spec = ACTION_MAP[actionName] || ACTION_MAP.get_player;
    currentAction = spec.action;
    var category = CATEGORY_MAP[spec.category];
    byId("cocActionEyebrow").textContent = category.title;
    byId("cocActionTitle").textContent = spec.title;
    byId("cocActionDescription").textContent = spec.description;
    byId("cocFriendlyRun").textContent = "查询" + spec.title;
    document.title = spec.title + " · COC 实时查询 · 天择网";
    renderFriendlyFields(Object.assign({}, defaultParamsForAction(spec.action), params || {}));
    renderRelatedActions(spec);
    renderNavigation();
    if (byId("cocAction") && byId("cocAction").querySelector('option[value="' + spec.action + '"]')) {
      byId("cocAction").value = spec.action;
      developerActionChanged(false);
    }
    if (!options.keepResult) resetResultState();
    setMessage(actionAvailable(spec.action) ? "填写条件后即可查询。" : "这项查询暂时无法使用。", actionAvailable(spec.action) ? "" : "error");
    if (options.push && root.history && typeof root.history.pushState === "function") {
      root.history.pushState({ action: spec.action }, "", buildShareUrl(spec.action, params || {}, root.location.href, false));
    } else if (options.replace) writeUrl(params || {}, Boolean(options.run));
    if (options.focusHeading) {
      var heading = byId("cocActionTitle");
      heading.tabIndex = -1;
      heading.focus();
    }
  }
  function renderDeveloperActions() {
    var select = byId("cocAction");
    if (!select) return;
    var value = select.value || currentAction;
    select.replaceChildren();
    CATEGORIES.forEach(function (category) {
      var group = element("optgroup");
      group.label = category.title;
      ACTION_CATALOG.filter(function (item) { return item.category === category.id; }).forEach(function (item) {
        var option = element("option", "", item.title + " · " + item.action);
        option.value = item.action;
        option.disabled = !actionAvailable(item.action);
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    select.value = ACTION_MAP[value] && actionAvailable(value) ? value : actionAvailable(currentAction) ? currentAction : "";
    developerActionChanged(true);
  }
  function developerActionChanged(resetParams) {
    var select = byId("cocAction");
    var actionName = select && select.value;
    var spec = ACTION_MAP[actionName];
    if (!spec) return;
    if (resetParams) byId("cocParams").value = JSON.stringify(developerDefaults(actionName), null, 2);
    var allowed = spec.fields.map(function (item) { return item.name; });
    var required = spec.fields.filter(function (item) { return item.required; }).map(function (item) { return item.name; });
    byId("cocActionHelp").textContent = spec.title + "。可用参数：" + (allowed.join("、") || "无") + "；必填：" + (required.join("、") || "无") + "。";
  }
  function parseDeveloperParams(actionName) {
    var text = byId("cocParams").value.trim();
    var value = text ? JSON.parse(text) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("参数必须是 JSON 对象");
    var spec = ACTION_MAP[actionName];
    var allowed = spec.fields.map(function (item) { return item.name; });
    var unknown = Object.keys(value).filter(function (key) { return allowed.indexOf(key) < 0; });
    if (unknown.length) throw new Error("不支持参数：" + unknown.join("、"));
    return normalizeParams(actionName, value);
  }
  function successfulMeta(actionName, collectedAt) {
    var time;
    var date = new Date(Number(collectedAt) || Date.now());
    try { time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date); }
    catch (_error) { time = date.toLocaleTimeString(); }
    return ACTION_MAP[actionName].title + " · " + time;
  }
  function invokeQuery(actionName, params, button) {
    var generation = ++queryGeneration;
    var queryCollectedAt = 0;
    if (button) button.disabled = true;
    updateQueryHistoryButtons(true);
    setResultBusy(true);
    setMessage("正在通过云端查询服务读取官方公开资料…");
    byId("cocResultMeta").textContent = "正在查询";
    byId("cocFriendlyResult").replaceChildren(element("p", "coc-friendly-empty", "正在查询，请稍候…"));
    var connection = connected ? Promise.resolve(capabilities) : connect(false);
    return connection.then(function () {
      if (generation !== queryGeneration) throw STALE_QUERY;
      if (!actionAvailable(actionName)) throw new Error("云端当前没有开放这项查询");
      return cloudRequest("/api/coc/query", {
        method: "POST",
        body: JSON.stringify({ action: actionName, params: params })
      }, true);
    }).then(function (result) {
      queryCollectedAt = Date.now();
      return loadLocalGameNames().then(function () { return result; });
    }).then(function (result) {
      if (generation !== queryGeneration) throw STALE_QUERY;
      lastAction = actionName;
      lastParams = Object.assign({}, params);
      lastResult = result;
      renderFriendlyResult(actionName, result, params, byId("cocFriendlyResult"), queryCollectedAt);
      var raw = JSON.stringify(result, null, 2);
      byId("cocResult").textContent = raw;
      byId("cocCopyResult").disabled = false;
      byId("cocDownloadResult").disabled = false;
      byId("cocResultMeta").textContent = successfulMeta(actionName, queryCollectedAt);
      setMessage("查询完成。表格中的玩家、部落、部落对战与赛季可以继续点击。", "success");
      setStatus("真实查询成功", "ok");
      setServiceDetail("云端查询服务与《部落冲突》官方公开接口已完成最近一次真实查询。");
      writeUrl(params, true);
      recordQuerySnapshot(actionName, params, result, queryCollectedAt);
      return result;
    }).catch(function (error) {
      if (error === STALE_QUERY || generation !== queryGeneration) return;
      var message = errorText(error);
      byId("cocFriendlyResult").replaceChildren(element("p", "coc-friendly-empty is-error", message));
      byId("cocResultMeta").textContent = "查询未完成";
      setMessage(message, "error");
      if (!error.status || error instanceof TypeError) {
        setStatus("连接异常", "error");
        setServiceDetail(message + " 可使用上方按钮重试。");
        connected = false;
      } else {
        setStatus("服务在线", "ok");
        setServiceDetail("查询服务已响应，但这次资料查询未完成：" + message);
      }
      throw error;
    }).finally(function () {
      if (generation === queryGeneration) {
        setResultBusy(false);
        updateQueryHistoryButtons(false);
      }
      if (button) button.disabled = false;
    });
  }
  function runFriendly(event) {
    event.preventDefault();
    var params;
    try {
      params = normalizeParams(currentAction, collectRawParams());
      applyNormalizedParams(params);
    } catch (error) {
      setMessage(errorText(error), "error");
      focusInvalid(errorText(error));
      return;
    }
    invokeQuery(currentAction, params, byId("cocFriendlyRun")).catch(function () {});
  }
  function runDeveloper() {
    var actionName = byId("cocAction").value;
    var params;
    try { params = parseDeveloperParams(actionName); }
    catch (error) {
      setMessage(errorText(error), "error");
      byId("cocParams").focus();
      return;
    }
    selectAction(actionName, params, { keepResult: true });
    invokeQuery(actionName, params, byId("cocRun")).catch(function () {});
  }
  function copyText(text, successMessage) {
    if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== "function") {
      return Promise.reject(new Error("当前浏览器不允许直接复制，请手动选择内容"));
    }
    return root.navigator.clipboard.writeText(String(text)).then(function () {
      setMessage(successMessage, "success");
    });
  }
  function copyCurrentLink() {
    var params = currentShareParams();
    var run = lastAction === currentAction && JSON.stringify(lastParams) === JSON.stringify(params);
    var url = buildShareUrl(currentAction, params, root.location.href, run);
    copyText(url, "已复制可分享的查询链接。").catch(function (error) { setMessage(errorText(error), "error"); });
  }
  function copyResult() {
    if (lastResult == null) return;
    copyText(JSON.stringify(lastResult, null, 2), "已复制原始数据。").catch(function (error) { setMessage(errorText(error), "error"); });
  }
  function downloadResult() {
    if (lastResult == null || typeof root.Blob !== "function" || !root.URL || typeof root.URL.createObjectURL !== "function") return;
    var blob = new root.Blob([JSON.stringify(lastResult, null, 2)], { type: "application/json;charset=utf-8" });
    var url = root.URL.createObjectURL(blob);
    var link = element("a");
    link.href = url;
    link.download = "coc-" + (lastAction || "query") + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
    setMessage("已下载原始数据。", "success");
  }
  function handleQueryLink(event) {
    var link = event.target.closest && event.target.closest("[data-query-link]");
    if (!link) return;
    var actionName = link.getAttribute("data-query-link");
    if (!ACTION_MAP[actionName]) return;
    if (link.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      setMessage("这项查询暂时无法使用。", "error");
      return;
    }
    event.preventDefault();
    var params = {};
    try { params = JSON.parse(link.getAttribute("data-query-params") || "{}"); } catch (_error) {}
    var shouldRun = link.getAttribute("data-query-run") === "true";
    selectAction(actionName, params, { push: true, focusHeading: true });
    if (shouldRun) {
      try {
        var normalized = normalizeParams(actionName, params);
        applyNormalizedParams(normalized);
        invokeQuery(actionName, normalized, byId("cocFriendlyRun")).catch(function () {});
      } catch (error) { setMessage(errorText(error), "error"); }
    }
  }
  function restoreUrlState() {
    queryGeneration += 1;
    var state = parseUrlState(root.location.href);
    selectAction(state.action, state.params, { keepResult: false });
    if (new URL(root.location.href).searchParams.get("mode") === "developer") byId("cocDeveloperDetails").open = true;
    if (state.run) {
      try {
        var params = normalizeParams(state.action, Object.assign({}, defaultParamsForAction(state.action), state.params));
        applyNormalizedParams(params);
        invokeQuery(state.action, params, byId("cocFriendlyRun")).catch(function () {});
      } catch (error) {
        setMessage("分享链接中的查询条件无效：" + errorText(error), "error");
        focusInvalid(errorText(error));
      }
    }
  }
  function init() {
    if (!byId("cocFriendlyForm") || !byId("cocCategoryNav")) return;
    loadLocalGameNames();
    var state = parseUrlState(root.location.href);
    selectAction(state.action, state.params, { keepResult: true });
    resetResultState();
    renderCapabilityState();
    if (new URL(root.location.href).searchParams.get("mode") === "developer") byId("cocDeveloperDetails").open = true;
    byId("cocFriendlyForm").addEventListener("submit", runFriendly);
    byId("cocFriendlyForm").addEventListener("reset", function (event) {
      event.preventDefault();
      selectAction(currentAction, defaultParamsForAction(currentAction), { replace: true, focusHeading: false });
    });
    byId("cocConnect").addEventListener("click", function () {
      connect(true).then(function () { setMessage("查询服务已重新连接。", "success"); }).catch(function (error) { setMessage(errorText(error), "error"); });
    });
    byId("cocCopyLink").addEventListener("click", copyCurrentLink);
    byId("cocCopyResult").addEventListener("click", copyResult);
    byId("cocDownloadResult").addEventListener("click", downloadResult);
    byId("cocQueryPrevious").addEventListener("click", function () { restoreQuerySnapshot(-1); });
    byId("cocQueryNext").addEventListener("click", function () { restoreQuerySnapshot(1); });
    byId("cocAction").addEventListener("change", function () { developerActionChanged(true); });
    byId("cocRun").addEventListener("click", runDeveloper);
    byId("cocDeveloperDetails").addEventListener("toggle", function () {
      writeUrl(currentShareParams(), lastAction === currentAction, byId("cocDeveloperDetails").open ? "developer" : "");
    });
    document.addEventListener("click", handleQueryLink);
    root.addEventListener("popstate", restoreUrlState);
    updateQueryHistoryButtons(false);
    var connectionTask = connect(false);
    if (state.run) {
      connectionTask.then(function () {
        var params = normalizeParams(state.action, Object.assign({}, defaultParamsForAction(state.action), state.params));
        applyNormalizedParams(params);
        return invokeQuery(state.action, params, byId("cocFriendlyRun"));
      }).catch(function (error) {
        if (error !== STALE_QUERY) setMessage(errorText(error), "error");
      });
    } else connectionTask.catch(function (error) { setMessage(errorText(error), "error"); });
  }

  root.__cocLiveQueryTest = Object.freeze({
    CLOUD_ROOT: CLOUD_ROOT,
    ACTION_CATALOG: ACTION_CATALOG,
    CATEGORIES: CATEGORIES,
    ACTION_NAMES: ACTION_CATALOG.map(function (item) { return item.action; }),
    RENDERER_NAMES: Object.keys(RENDERERS),
    normalizeCocTag: normalizeCocTag,
    parseTagList: parseTagList,
    normalizeParams: normalizeParams,
    safeActions: safeActions,
    specList: specList,
    defaultParamsForSpec: defaultParamsForSpec,
    cloudErrorRetryable: cloudErrorRetryable,
    errorText: errorText,
    safeHttpsUrl: safeHttpsUrl,
    formatCocDate: formatCocDate,
    buildShareUrl: buildShareUrl,
    parseUrlState: parseUrlState,
    rendererKind: rendererKind,
    playerLeagueTierName: playerLeagueTierName,
    displayPlayerLeagueTierName: displayPlayerLeagueTierName,
    officialLeagueName: officialLeagueName,
    apiLeagueName: apiLeagueName,
    officialRoleName: officialRoleName,
    officialWarPreferenceName: officialWarPreferenceName,
    officialClanTypeName: officialClanTypeName,
    officialWarFrequencyName: officialWarFrequencyName,
    officialVillageName: officialVillageName,
    officialWarStateName: officialWarStateName,
    officialRaidStateName: officialRaidStateName,
    officialBattleModifierName: officialBattleModifierName,
    officialLabelName: officialLabelName,
    officialGameName: officialGameName,
    officialAchievementName: officialAchievementName,
    indexLocalGameNames: indexLocalGameNames,
    importOfficialPlayerSnapshot: importOfficialPlayerSnapshot,
    clanCapitalHallLevel: clanCapitalHallLevel,
    playerClan: playerClan,
    clanMembers: clanMembers,
    clanGamesWindow: clanGamesWindow,
    clanTagsInDescription: clanTagsInDescription,
    memberLeagueRank: memberLeagueRank,
    memberRoleRank: memberRoleRank,
    sortClanMembers: sortClanMembers,
    sortWarMembersByPosition: sortWarMembersByPosition,
    raidTotalMedals: raidTotalMedals,
    sortRaidMembersByLoot: sortRaidMembersByLoot
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(typeof window !== "undefined" ? window : globalThis);
