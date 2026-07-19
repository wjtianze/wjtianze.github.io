/* ===== 天择网 · COC 伤害计算器 · app.js ===== */
/* 仅适用于家乡。雷电固定伤害 + 地震百分比递减伤害 + 英雄装备技能伤害。 */
(function () {
  "use strict";

  /* 装备 ID → 中文名/所属英雄（与村庄存档分析一致，90000000 系列） */
  var EQUIP_MAP = {
    90000000:{zh:"野蛮人木偶",hero:"蛮王"},90000001:{zh:"狂暴药水瓶",hero:"蛮王"},90000002:{zh:"弓箭手木偶",hero:"女王"},90000003:{zh:"隐形药水瓶",hero:"女王"},90000004:{zh:"永恒书卷",hero:"永王"},90000005:{zh:"生命宝石",hero:"永王"},90000006:{zh:"寻踪飞盾",hero:"闰土"},90000007:{zh:"皇家宝石",hero:"闰土"},90000008:{zh:"地震金靴",hero:"蛮王"},90000009:{zh:"野猪骑士木偶",hero:"闰土"},90000010:{zh:"巨型手套",hero:"蛮王"},90000011:{zh:"治疗胡须",hero:"蛮王"},90000012:{zh:"急速药水瓶",hero:"闰土"},90000013:{zh:"火箭飞矛",hero:"闰土"},90000014:{zh:"尖刺足球",hero:"蛮王"},90000015:{zh:"冰封箭矢",hero:"女王"},90000016:{zh:"擎天箭矢",hero:"女王"},90000017:{zh:"巨型箭矢",hero:"女王"},90000019:{zh:"英雄火炬",hero:"永王"},90000020:{zh:"天使木偶",hero:"女王"},90000022:{zh:"巨大火球",hero:"永王"},90000024:{zh:"狂暴宝石",hero:"永王"},90000032:{zh:"灵蛇手镯",hero:"蛮王"},90000034:{zh:"治疗书卷",hero:"永王"},90000035:{zh:"暗黑皇冠",hero:"王子"},90000039:{zh:"克隆魔镜",hero:"女王"},90000040:{zh:"雷电战靴",hero:"闰土"},90000041:{zh:"熔岩气球玩偶",hero:"永王"},90000042:{zh:"护卫玩偶",hero:"王子"},90000043:{zh:"暗黑魔球",hero:"王子"},90000044:{zh:"铁甲短裤",hero:"王子"},90000047:{zh:"贵族哑铃",hero:"王子"},90000048:{zh:"动作人偶",hero:"女王"},90000049:{zh:"陨石法杖",hero:"王子"},90000050:{zh:"冷冽冰晶",hero:"闰土"},90000051:{zh:"木棍马驹",hero:"蛮王"},90000052:{zh:"烈焰之心",hero:"龙王"},90000053:{zh:"火箭背包",hero:"龙王"},90000056:{zh:"爆震器",hero:"龙王"},90000057:{zh:"助燃器",hero:"龙王"},90000059:{zh:"雷电獠牙",hero:"龙王"}
  };
  var HERO_ORDER = ["蛮王","女王","永王","王子","闰土","龙王"];
  var BUILD_CATS = [
    {key:"防御建筑", emoji:"🛡️"},
    {key:"资源建筑", emoji:"💰"},
    {key:"科技建筑", emoji:"🔬"},
    {key:"守卫", emoji:"👤"},
    {key:"陷阱", emoji:"🪤"},
    {key:"其它建筑", emoji:"🏠"}
  ];
  /* 法术 globalID */
  var LIGHT_GID = "26000000", QUAKE_GID = "26000010";
  var WALL_NAMES = ["城墙","Wall"];
  var TH_MIN = 3, TH_MAX = 18;
  var QUAKE_SEARCH_CAP = 80; /* 地震遍历上限 */
  /* 法术免疫（游戏机制）：资源储罐对全部法术免疫；部落城堡/大本营对雷电免疫但不免疫地震 */
  var IMMUNE_ALL_NAMES = ["储金罐","圣水瓶","暗黑重油罐"];
  var IMMUNE_LIGHT_NAMES = ["部落城堡","大本营"];
  function immuneAll(unit){ return !!(unit && IMMUNE_ALL_NAMES.indexOf(unit.chineseName)>=0); }
  function immuneLight(unit){ return !!(unit && IMMUNE_LIGHT_NAMES.indexOf(unit.chineseName)>=0); }

  var G = null;             /* 游戏数据 */
  var IDMAP = {};           /* globalID → unit */
  var NAMEMAP = {};         /* chineseName → unit */
  var dmgEquips = [];       /* 伤害型装备列表 [{id, info, unit, hero, maxLvl, hasSkillDmg}] */
  var buildList = [];       /* 家乡建筑列表 [{unit, gid, cat, maxLvl}] */
  var lightningUnit = null, quakeUnit = null;
  var thUnit = null, builderHutUnit = null; /* 大本营 / 建筑工人小屋 unit */
  var STATE = { eq:{}, eqOn:{}, spell:{l:0,q:0}, build:{}, th:0, target:"", builders:{count:0,levels:[]} }; /* eqOn=是否计入伤害；builders=参与回血的小屋 */

  var LS_KEY = "tz_coc_dmgcalc_v1";

  function $(id){ return document.getElementById(id); }
  function num(v){ v=parseFloat(v); return isNaN(v)?0:v; }
  function intv(v){ v=parseInt(v,10); return isNaN(v)?0:v; }
  function fmt(n){ n=Math.round(n); return n.toLocaleString("zh-CN"); }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }

  function thOf(r){ if(!r) return 99; var v=r.requiredTownHallLevel!=null?r.requiredTownHallLevel:(r.RequiredTownHallLevel!=null?r.RequiredTownHallLevel:(r.TownHallLevel!=null?r.TownHallLevel:99)); return intv(v); }
  function lvlData(unit, lvl){ if(!unit||!unit.levels)return null; for(var i=0;i<unit.levels.length;i++){ if(intv(unit.levels[i].level)===lvl)return unit.levels[i]; } return null; }
  function maxLevel(unit){ if(!unit||!unit.levels)return 0; var m=0; unit.levels.forEach(function(r){ var lv=intv(r.level); if(lv>m)m=lv; }); return m; }
  function maxLevelForTH(unit, th){ if(!unit||!unit.levels||!unit.levels.length)return 0; var m=0; unit.levels.forEach(function(r){ if(thOf(r)<=th && intv(r.level)>m)m=intv(r.level); }); return m; }
  function isWall(unit){ if(!unit)return false; if(WALL_NAMES.indexOf(unit.chineseName)>=0)return true; if(WALL_NAMES.indexOf(unit.englishName)>=0)return true; return false; }

  /* 雷电该等级伤害 */
  function lightDmg(lvl){ var r=lvlData(lightningUnit,lvl); return r?num(r.Damage):0; }
  /* 地震该等级全额百分比（小数）：普通建筑按 BuildingDamagePermil×5/1000 逐次递减。 */
  function quakePctRaw(lvl){ var r=lvlData(quakeUnit,lvl); if(!r)return 0; return num(r.BuildingDamagePermil)/1000*5; }
  function quakePct(lvl){ return quakePctRaw(lvl); }
  function quakeSum(b){ var s=0; for(var i=1;i<=b;i++){ s += 1/(2*i-1); } return s; }
  /* 单次/累计地震伤害。
   * 城墙固定游戏规则（与等级无关）：
   *   - 3 瓶地震无论如何（任何城墙等级、任何地震等级）都不能单独摧毁城墙；
   *   - 4 瓶地震无论如何都必定摧毁城墙。
   * 实现方式：前 3 瓶按真实递减公式累加；第 4 瓶补足剩余 HP（quakeHitDmg(4) 直接返回 H - quakeDmg(3)），
   * 于是累计正好等于 H；5 瓶及以上时 quakeHitDmg 全部返回 0，quakeDmg 末尾的 wall&&count>=4 分支直接返回 H。
   * 而 count<4 时通过 min(d, H-0.0001) 严格把上限压在「未摧毁」一侧。 */
  function quakeHitDmg(index, H, lvl, wall){
    if(index<=0 || H<=0 || lvl<=0)return 0;
    if(wall && index===4)return Math.max(0, H-quakeDmg(3,H,lvl,true));
    if(wall && index>4)return 0;
    return H*quakePct(lvl)/(2*index-1);
  }
  function quakeDmg(count, H, lvl, wall){
    var d=0;
    for(var i=1;i<=count;i++)d+=quakeHitDmg(i,H,lvl,wall);
    if(wall && count<4)d=Math.min(d, Math.max(0,H-0.0001));
    return wall && count>=4 ? H : d;
  }
  /* 建筑该等级 HP */
  function buildHP(unit, lvl){ var r=lvlData(unit,lvl); if(!r)return 0; return num(r.Hitpoints); }

  /* 装备技能伤害（SkillDamage，来自装备主动技能的直接伤害值，非 DPS） */
  function equipSkillDmg(unit, lvl){ var r=lvlData(unit,lvl); if(!r)return 0; return num(r.SkillDamage); }

  function loadGame(cb){
    fetch("../data/all_game_data_zh.json?v=20260718a").then(function(r){return r.json();}).then(function(d){
      G=d;
      d.units.forEach(function(u){
        var g=String(u.globalID||"").trim();
        if(g)IDMAP[g]=u;
        if(u.chineseName)NAMEMAP[u.chineseName]=u;
      });
      lightningUnit=IDMAP[LIGHT_GID];
      quakeUnit=IDMAP[QUAKE_GID];
      thUnit=NAMEMAP["大本营"]||null;
      builderHutUnit=NAMEMAP["建筑工人小屋"]||null;
      /* 收集伤害型装备（EQUIP_MAP 中能在数据里按中文名匹配到、且含 SkillDamage 字段的） */
      dmgEquips=[];
      Object.keys(EQUIP_MAP).forEach(function(id){
        var info=EQUIP_MAP[id];
        var u=NAMEMAP[info.zh];
        if(!u)return;
        var hasSkillDmg=false;
        if(u.levels){ u.levels.forEach(function(r){ if(r.SkillDamage!=null)hasSkillDmg=true; }); }
        dmgEquips.push({id:id, info:info, unit:u, hero:info.hero, maxLvl:maxLevel(u), hasSkillDmg:hasSkillDmg});
      });
      /* 收集家乡建筑 */
      buildList=[];
      d.units.forEach(function(u){
        if(BUILD_CATS.some(function(c){return c.key===u.category;})){
          var g=String(u.globalID||"").trim();
          if(g){ buildList.push({unit:u, gid:g, cat:u.category, maxLvl:maxLevel(u)}); }
        }
      });
      cb();
    }).catch(function(e){ showError("游戏数据加载失败："+e.message+"（请通过 http 访问本页）"); });
  }

  /* ===== 渲染 ===== */
  function renderSpellLevels(){
    var ls=$("dmLightLvl"), qs=$("dmQuakeLvl");
    function fill(sel, unit, cur){
      var h='<option value="0">未设定</option>';
      if(unit&&unit.levels){
        var lvls=unit.levels.slice().sort(function(a,b){return intv(a.level)-intv(b.level);});
        lvls.forEach(function(r){
          var lv=intv(r.level); h+='<option value="'+lv+'"'+(lv===cur?' selected':'')+'>Lv '+lv+'</option>';
        });
      }
      sel.innerHTML=h;
    }
    fill(ls, lightningUnit, STATE.spell.l);
    fill(qs, quakeUnit, STATE.spell.q);
  }

  function renderTHLevels(){
    var sel=$("dmTHLvl");
    var h='<option value="0">— 选择 —</option>';
    for(var th=TH_MIN; th<=TH_MAX; th++){ h+='<option value="'+th+'"'+(th===STATE.th?' selected':'')+'>TH '+th+' 本</option>'; }
    sel.innerHTML=h;
  }

  function renderEquipGroups(){
    var wrap=$("dmEquipGroups");
    var byHero={};
    HERO_ORDER.forEach(function(h){ byHero[h]=[]; });
    dmgEquips.forEach(function(e){ if(byHero[e.hero])byHero[e.hero].push(e); });
    var h="";
    HERO_ORDER.forEach(function(hero){
      var list=(byHero[hero]||[]).filter(function(e){return e.hasSkillDmg;});
      if(!list.length)return;
      h+='<div class="dm-eq-group"><h4>👑 '+hero+'装备</h4>';
      list.forEach(function(e){
        var cur=STATE.eq[e.id]||0;
        var on=!!STATE.eqOn[e.id];
        h+='<div class="dm-eq-row'+(on?' dm-eq-on':'')+'"><label class="dm-eq-check"><input type="checkbox" data-eqon="'+e.id+'" '+(on?'checked':'')+' aria-label="勾选将'+esc(e.info.zh)+'的伤害计入"/></label>';
        h+='<span class="dm-eq-name" title="'+esc(e.info.zh)+'">'+esc(e.info.zh)+'</span>';
        if(cur>0){ h+='<span class="dm-eq-dmg">伤害 '+fmt(equipSkillDmg(e.unit,cur))+'</span>'; }
        h+='<select class="dm-lvl-select" data-eqid="'+e.id+'">';
        h+='<option value="0"'+(cur===0?' selected':'')+'>未设</option>';
        for(var lv=1; lv<=e.maxLvl; lv++){ h+='<option value="'+lv+'"'+(lv===cur?' selected':'')+'>Lv '+lv+'</option>'; }
        h+='</select></div>';
      });
      h+='</div>';
    });
    wrap.innerHTML=h;
    /* 绑定勾选框 */
    wrap.querySelectorAll("input[data-eqon]").forEach(function(cb){
      cb.addEventListener("change", function(){
        var id=cb.getAttribute("data-eqon");
        STATE.eqOn[id]=cb.checked;
        renderEquipGroups(); updateEquipTotal(); renderTargetInfo(); save();
      });
    });
    /* 绑定等级下拉 */
    wrap.querySelectorAll("select[data-eqid]").forEach(function(sel){
      sel.addEventListener("change", function(){
        var id=sel.getAttribute("data-eqid");
        STATE.eq[id]=intv(sel.value);
        renderEquipGroups(); updateEquipTotal(); renderTargetInfo(); save();
      });
    });
    updateEquipTotal();
  }

  function totalEquipDmg(){
    var t=0;
    dmgEquips.forEach(function(e){ var lv=STATE.eq[e.id]||0; if(lv>0&&e.hasSkillDmg&&STATE.eqOn[e.id])t+=equipSkillDmg(e.unit,lv); });
    return t;
  }
  function updateEquipTotal(){
    var t=totalEquipDmg();
    var onCnt=0, setCnt=0;
    dmgEquips.forEach(function(e){ if((STATE.eq[e.id]||0)>0)setCnt++; if(STATE.eqOn[e.id]&&e.hasSkillDmg&&(STATE.eq[e.id]||0)>0)onCnt++; });
    $("dmEquipTotal").innerHTML = "装备总伤害：<b>"+fmt(t)+"</b>"+(onCnt?"（已勾选 "+onCnt+" 件装备计入）":"（未勾选任何装备，默认不计入装备伤害）")+(setCnt>onCnt?"，另有 "+(setCnt-onCnt)+" 件已设等级未勾选":"");
  }

  function builderRepairRate(hutLevel){
    var r=lvlData(builderHutUnit,hutLevel);
    return r?num(r.BuilderRepairPerSecond):0;
  }
  function totalBuilderRepair(){
    var total=0, count=Math.max(0,Math.min(6,intv(STATE.builders.count)));
    for(var i=0;i<count;i++)total+=builderRepairRate(intv(STATE.builders.levels[i]));
    return total;
  }
  /* 当前法术方案对目标建筑可造成的最大伤害（用于实时显示回血容错时间）。
   复用 calcMax 的搜索逻辑：给定法术空间上限 S = 11（雷电法术+地震法术的标准满空间），
   找让目标建筑 H 受损最大的 (雷电数, 地震数) 组合。返回 {dmg, H, wall, overflow, toleranceSec}。 */
  function estimateMaxDmgForTarget(S, targetGid){
    var b=findBuild(targetGid);
    if(!b)return null;
    var cur=STATE.build[targetGid]||0;
    if(cur<=0)return null;
    var H=buildHP(b.unit,cur);
    var wall=isWall(b.unit);
    var ql=STATE.spell.q, ll=STATE.spell.l;
    var Dl=lightDmg(ll), pct=quakePct(ql);
    var D_eq=totalEquipDmg();
    var immA=immuneAll(b.unit), immL=immuneLight(b.unit);
    if(immA){ Dl=0; pct=0; }
    else if(immL){ Dl=0; }
    if(ql<=0 && ll<=0) return {dmg:D_eq, H:H, wall:wall, overflow:Math.max(0,D_eq-H), toleranceSec:null};
    var best={a:0,b:0,dmg:D_eq};
    for(var btry=0; btry<=S; btry++){
      var atry=S-btry;
      var d=D_eq + atry*Dl + (pct>0?quakeDmg(btry,H,ql,wall):0);
      if(d>best.dmg)best={a:atry,b:btry,dmg:d};
    }
    var repair=totalBuilderRepair();
    var overflow=Math.max(0, best.dmg-H);
    return {
      dmg: best.dmg, H: H, wall: wall, overflow: overflow,
      toleranceSec: (repair>0 && overflow>0) ? (overflow/repair) : null
    };
  }

  function renderBuilders(){
    var count=Math.max(0,Math.min(6,intv(STATE.builders.count)));
    STATE.builders.count=count;
    while(STATE.builders.levels.length<count)STATE.builders.levels.push(1);
    STATE.builders.levels=STATE.builders.levels.slice(0,count);
    $("dmBuilderCount").value=count;
    var wrap=$("dmBuilderLevels"), h="";
    for(var i=0;i<count;i++){
      var cur=intv(STATE.builders.levels[i])||1;
      h+='<div class="dm-builder-row"><span>小屋 '+(i+1)+'</span><select class="dm-lvl-select" data-builder="'+i+'">';
      for(var lv=1;lv<=maxLevel(builderHutUnit);lv++)h+='<option value="'+lv+'"'+(lv===cur?' selected':'')+'>Lv '+lv+' · '+fmt(builderRepairRate(lv))+'/秒</option>';
      h+='</select></div>';
    }
    if(!count)h='<div class="dm-builder-empty">未设置参与回血的建筑工人小屋</div>';
    wrap.innerHTML=h;
    wrap.querySelectorAll("select[data-builder]").forEach(function(sel){
      sel.addEventListener("change",function(){ STATE.builders.levels[intv(sel.getAttribute("data-builder"))]=intv(sel.value); renderBuilders(); save(); });
    });
    var totalRepair=totalBuilderRepair();
    var html='总回复量：<b>'+fmt(totalRepair)+'</b> 生命值/秒';
    /* 实时容错时间（基于默认 11 格法术 + 当前目标建筑）—— 让用户调整小屋时立即看到反馈 */
    var est=estimateMaxDmgForTarget(11, STATE.target);
    if(est){
      html+='<div class="dm-builder-tol" style="margin-top:6px;font-size:12px;color:var(--coc-blue);font-family:ui-monospace,Menlo,Consolas,monospace">';
      if(est.toleranceSec==null){
        if(totalRepair<=0) html+='容错时间：<span style="color:var(--ink-faint)">未设置回血小屋，无法覆盖溢出</span>';
        else html+='容错时间：<span style="color:var(--ink-faint)">'+esc(findBuild(STATE.target).unit.chineseName)+' 生命值未被溢出，无需容错</span>';
      } else {
        html+='对 '+esc(findBuild(STATE.target).unit.chineseName)+'（'+fmt(est.H)+' HP）11格法术溢出 '+fmt(est.overflow)+' ÷ '+fmt(totalRepair)+'/秒 = <b>'+est.toleranceSec.toFixed(2)+' 秒</b>';
      }
      html+='</div>';
    }
    $("dmBuilderTotal").innerHTML=html;
  }

  function renderBuildGroups(){
    var wrap=$("dmBuildGroups");
    var h="";
    BUILD_CATS.forEach(function(c){
      var list=buildList.filter(function(b){return b.cat===c.key;});
      if(!list.length)return;
      h+='<div class="section-head" style="margin:18px 0 6px;"><h3 style="font-size:13.5px; font-weight:600; color:var(--ink-dim);">'+c.emoji+' '+c.key+' <span style="color:var(--ink-faint); font-weight:400;">('+list.length+')</span></h3></div>';
      h+='<div class="dm-build-grid">';
      list.forEach(function(b){
        var gid=b.gid, cur=STATE.build[gid]||0;
        var hp=cur>0?buildHP(b.unit,cur):0;
        h+='<div class="dm-build-row"><span class="dm-bn" title="'+esc(b.unit.chineseName)+'">'+esc(b.unit.chineseName)+'</span>';
        if(cur>0){ h+='<span class="dm-bhp">HP '+fmt(hp)+'</span>'; }
        h+='<select class="dm-lvl-select" data-bgid="'+gid+'">';
        h+='<option value="0"'+(cur===0?' selected':'')+'>未设</option>';
        for(var lv=1; lv<=b.maxLvl; lv++){ h+='<option value="'+lv+'"'+(lv===cur?' selected':'')+'>Lv '+lv+'</option>'; }
        h+='</select></div>';
      });
      h+='</div>';
    });
    wrap.innerHTML=h;
    wrap.querySelectorAll("select[data-bgid]").forEach(function(sel){
      sel.addEventListener("change", function(){
        var gid=sel.getAttribute("data-bgid");
        STATE.build[gid]=intv(sel.value);
        renderBuildGroups(); renderTargetOptions(); renderTargetInfo(); save();
      });
    });
  }

  function renderTargetOptions(){
    var sel=$("dmTargetBuild");
    var h="";
    var sorted=buildList.slice().sort(function(a,b){ return a.unit.chineseName.localeCompare(b.unit.chineseName,"zh"); });
    sorted.forEach(function(b){
      var gid=b.gid, cur=STATE.build[gid]||0;
      var name=b.unit.chineseName;
      if(immuneAll(b.unit))name+=" 🛡全免疫";
      else if(immuneLight(b.unit))name+=" 🛡免疫雷电";
      var tag = cur>0 ? (" Lv"+cur+" · HP "+fmt(buildHP(b.unit,cur))) : "（未设等级）";
      h+='<option value="'+gid+'"'+(gid===STATE.target?' selected':'')+'>'+esc(name)+tag+'</option>';
    });
    sel.innerHTML=h;
  }

  function renderTargetInfo(){
    var b=findBuild(STATE.target);
    var info=$("dmTargetInfo");
    if(!b){ info.textContent="—"; renderBuilders(); return; }
    var cur=STATE.build[STATE.target]||0;
    if(cur<=0){ info.innerHTML=esc(b.unit.chineseName)+"：<span style='color:var(--ink-faint)'>未设置等级，请先在上方设定等级</span>"; renderBuilders(); return; }
    var hp=buildHP(b.unit,cur);
    var ql=STATE.spell.q, qpRaw=quakePctRaw(ql);
    var immHtml="";
    if(immuneAll(b.unit))immHtml=' · <span style="color:#fbbf24">🛡 对所有法术免疫（仅装备伤害有效）</span>';
    else if(immuneLight(b.unit))immHtml=' · <span style="color:#fbbf24">🛡 对雷电法术免疫（地震有效）</span>';
    info.innerHTML = esc(b.unit.chineseName)+" · Lv"+cur+" · 最大生命值 <b>"+fmt(hp)+"</b>"+(ql>0?(' · 地震全额 '+(qpRaw*100).toFixed(1)+'%'):'')+immHtml;
    /* 目标变化时同步刷新"建筑工人小屋回血"区的实时容错时间 */
    renderBuilders();
  }

  function findBuild(gid){ for(var i=0;i<buildList.length;i++){ if(buildList[i].gid===gid)return buildList[i]; } return null; }

  /* ===== 从村庄存档分析导入等级（读取 localStorage，由 village/app.js 写入） ===== */
  function importVillage(){
    clearImportError();
    var raw=null;
    try{ raw=localStorage.getItem("tz_coc_village"); }catch(e){}
    if(!raw){ showImportError("未找到村庄存档数据。请先前往「村庄存档分析」页粘贴并解析村庄 JSON，再回到此处点击导入。"); return; }
    var parsed;
    try{ parsed=JSON.parse(raw); }catch(e){ showImportError("村庄存档数据解析失败："+e.message); return; }
    var V=parsed.village;
    if(!V){ showImportError("村庄存档数据格式异常（无 village 字段）。请重新到村庄存档分析页解析。"); return; }
    var eqCnt=0, spCnt=0, bCnt=0;
    var importedHuts=[];
    /* 装备 */
    (V.equipment||[]).forEach(function(e){
      var info=EQUIP_MAP[e.data];
      if(info){ STATE.eq[e.data]=intv(e.lvl); eqCnt++; }
    });
    /* 法术 */
    (V.spells||[]).forEach(function(s){
      var gid=String(s.data);
      if(gid===LIGHT_GID){ STATE.spell.l=intv(s.lvl); spCnt++; }
      else if(gid===QUAKE_GID){ STATE.spell.q=intv(s.lvl); spCnt++; }
    });
    /* 建筑：同 data 取最高 lvl */
    var bmax={};
    (V.buildings||[]).forEach(function(b){
      var gid=String(b.data);
      var lv=intv(b.lvl);
      if(gid==="1000015")importedHuts.push(lv);
      if(bmax[gid]==null||lv>bmax[gid])bmax[gid]=lv;
    });
    Object.keys(bmax).forEach(function(gid){
      if(IDMAP[gid] && BUILD_CATS.some(function(c){return c.key===IDMAP[gid].category;})){
        STATE.build[gid]=bmax[gid]; bCnt++;
      }
    });
    /* 大本营等级 */
    var th=0;
    (V.buildings||[]).forEach(function(b){ if(b.weapon!=null)th=intv(b.lvl); });
    if(!th)(V.buildings||[]).forEach(function(b){ if(b.data===1000001||/大本营/.test(b.data&&IDMAP[String(b.data)]?IDMAP[String(b.data)].chineseName:""))th=intv(b.lvl); });
    if(th)STATE.th=th;
    if(importedHuts.length){
      importedHuts.sort(function(a,b){return b-a;});
      STATE.builders.count=Math.min(6,importedHuts.length);
      STATE.builders.levels=importedHuts.slice(0,STATE.builders.count);
    }
    renderAll();
    var msg="已从村庄存档分析导入：装备 "+eqCnt+" 件、法术 "+spCnt+" 项（雷电/地震）、建筑 "+bCnt+" 类";
    if(importedHuts.length)msg+="、建筑工人小屋 "+Math.min(6,importedHuts.length)+" 座";
    if(th)msg+="，大本营 "+th+" 本";
    flashImportOk(msg);
  }

  function fillTHLevels(){
    var th=intv($("dmTHLvl").value);
    if(th<=0){ alert("请先选择大本营等级。"); return; }
    buildList.forEach(function(b){
      /* 大本营特殊：其等级即大本营本数（原始数据 requiredTownHallLevel=下一级所需，直接取 th 本身） */
      if(b.gid==="1000001"){ STATE.build[b.gid]=Math.min(th, b.maxLvl); return; }
      var m=maxLevelForTH(b.unit, th);
      if(m>0)STATE.build[b.gid]=m;
    });
    renderAll();
  }

  function clearAllLevels(){
    STATE.eq={}; STATE.eqOn={}; STATE.spell={l:0,q:0}; STATE.build={}; STATE.th=0; STATE.builders={count:0,levels:[]};
    renderAll(); save();
  }

  /* ===== 计算 ===== */
  /* 总伤害（不含装备，仅法术）：给定雷电数 a、地震数 b、目标HP H、是否城墙 */
  function spellDmg(a, b, H, ql, ll, wall){
    return a*lightDmg(ll)+quakeDmg(b,H,ql,wall);
  }
  function toleranceData(total,H){
    var overflow=Math.max(0,total-H), repair=totalBuilderRepair();
    return {overflow:overflow,repair:repair,seconds:repair>0?overflow/repair:null};
  }
  function toleranceHtml(total,H){
    var t=toleranceData(total,H);
    if(t.repair<=0)return '<div class="dm-tolerance"><b>回血容错：</b>未设置有效建筑工人小屋，总回复量为 0/秒。</div>';
    return '<div class="dm-tolerance"><b>回血容错：</b>溢出伤害 '+fmt(t.overflow)+' ÷ '+fmt(t.repair)+'/秒 = <strong>'+t.seconds.toFixed(2)+' 秒</strong></div>';
  }

  function calcMax(){
    var b=findBuild(STATE.target);
    if(!b){ renderMaxResult(null,"请先选择目标建筑。"); return; }
    var cur=STATE.build[STATE.target]||0;
    if(cur<=0){ renderMaxResult(null,"目标建筑未设置等级，请先在上方设定。"); return; }
    var H=buildHP(b.unit,cur), wall=isWall(b.unit);
    var S=intv($("dmSpaceMax").value); if(S<0)S=0; if(S>200)S=200;
    var ql=STATE.spell.q, ll=STATE.spell.l;
    var Dl=lightDmg(ll), pct=quakePct(ql);
    var D_eq=totalEquipDmg();
    /* 法术免疫：全免疫 → 雷电与地震均无效；免疫雷电 → 仅地震有效 */
    var immA=immuneAll(b.unit), immL=immuneLight(b.unit);
    if(immA){ Dl=0; pct=0; }
    else if(immL){ Dl=0; }

    var best={a:0,b:0,dmg:D_eq};
    if(ql<=0 && ll<=0){
      /* 无法术伤害，只有装备 */
      best={a:0,b:0,dmg:D_eq};
    }else{
      for(var btry=0; btry<=S; btry++){
        var atry=S-btry;
        var d=D_eq + atry*Dl + (pct>0?quakeDmg(btry,H,ql,wall):0);
        if(d>best.dmg)best={a:atry,b:btry,dmg:d};
      }
    }
    renderMaxResult({best:best, H:H, wall:wall, S:S, ql:ql, ll:ll, Dl:Dl, pct:pct, D_eq:D_eq, immA:immA, immL:immL}, null);
  }

  function calcMin(){
    var b=findBuild(STATE.target);
    if(!b){ renderMinResult(null,"请先选择目标建筑。"); return; }
    var cur=STATE.build[STATE.target]||0;
    if(cur<=0){ renderMinResult(null,"目标建筑未设置等级，请先在上方设定。"); return; }
    var H=buildHP(b.unit,cur), wall=isWall(b.unit);
    var ql=STATE.spell.q, ll=STATE.spell.l;
    var Dl=lightDmg(ll), pct=quakePct(ql);
    var D_eq=totalEquipDmg();
    /* 法术免疫 */
    var immA=immuneAll(b.unit), immL=immuneLight(b.unit);
    if(immA){ Dl=0; pct=0; }
    else if(immL){ Dl=0; }

    if(H<=0){ renderMinResult(null,"目标建筑生命值为 0，无需法术。"); return; }
    if(immA && D_eq<H){
      renderMinResult(null,"「"+b.unit.chineseName+"」对所有法术免疫，只有英雄装备伤害有效。当前装备总伤害 "+fmt(D_eq)+" < HP "+fmt(H)+"，无法摧毁。");
      return;
    }
    if(D_eq>=H){
      /* 装备单独即可摧毁 */
      renderMinResult({best:{a:0,b:0,space:0}, H:H, wall:wall, ql:ql, ll:ll, Dl:Dl, pct:pct, D_eq:D_eq, destroyed:true, eqSolo:true, immA:immA, immL:immL}, null);
      return;
    }
    var best=null;
    var cap = QUAKE_SEARCH_CAP;
    for(var btry=0; btry<=cap; btry++){
      var eqDmg = (btry>0 && pct>0) ? quakeDmg(btry,H,ql,wall) : 0;
      var remain = H - D_eq - eqDmg;
      var atry=0;
      if(remain>0){
        if(Dl<=0) continue; /* 此 b 下雷电无效（未设定或目标免疫雷电）且地震未够，跳过 */
        atry=Math.ceil(remain/Dl);
      }
      var space=btry+atry;
      if(best==null || space<best.space){ best={a:atry,b:btry,space:space,eqDmg:eqDmg,liDmg:atry*Dl}; }
    }
    if(best==null){
      if(immL){
        renderMinResult(null,"「"+b.unit.chineseName+"」对雷电法术免疫，只能靠地震；在 "+cap+" 个地震范围内伤害不足以摧毁（装备 "+fmt(D_eq)+" + 地震不足 "+fmt(H-D_eq)+"）。请提升地震等级或装备。");
      }else{
        renderMinResult(null,"在 "+cap+" 个地震范围内无法摧毁（雷电未设定且地震不足以覆盖）。请提升法术等级。");
      }
      return;
    }
    renderMinResult({best:best, H:H, wall:wall, ql:ql, ll:ll, Dl:Dl, pct:pct, D_eq:D_eq, destroyed:true, immA:immA, immL:immL}, null);
  }

  /* ===== 结果渲染 ===== */
  function fmtPct(p){ return (p*100).toFixed(2).replace(/\.?0+$/,"")+"%"; }

  function renderMaxResult(r, err){
    var box=$("dmResultMax");
    if(err){ box.innerHTML='<div class="dm-warn">'+esc(err)+'</div>'; box.classList.add("show"); return; }
    if(!r){ box.classList.remove("show"); return; }
    var b=r.best;
    var eqDmg=r.D_eq, liDmg=b.a*r.Dl, qDmg=b.b>0?quakeDmg(b.b,r.H,r.ql,r.wall):0;
    var html='<div class="dm-result-headline">';
    html+='<div class="dm-rh-label">最高伤害（法术空间上限 '+r.S+'）</div>';
    html+='<div class="dm-rh-value"><span class="dm-grad">'+fmt(b.dmg)+'</span></div>';
    html+='<div class="dm-rh-sub">对 '+esc(findBuild(STATE.target).unit.chineseName)+'（Lv'+(STATE.build[STATE.target]||0)+'，HP '+fmt(r.H)+(r.wall?'，城墙':'')+'）</div>';
    html+='<div class="dm-config">';
    if(r.D_eq>0)html+='<span class="dm-chip dm-chip-eq">🛡️ 装备伤害 <b>'+fmt(eqDmg)+'</b></span>';
    if(b.a>0)html+='<span class="dm-chip dm-chip-l">⚡ 雷电 ×'+b.a+' <b>'+fmt(liDmg)+'</b></span>';
    if(b.b>0)html+='<span class="dm-chip dm-chip-q">🌍 地震 ×'+b.b+' <b>'+fmt(qDmg)+'</b></span>';
    if(r.S>0 && b.a===0 && b.b===0 && r.D_eq===0)html+='<span class="dm-chip">⚠️ 未设定法术等级，仅装备伤害</span>';
    html+='</div></div>';
    html+=breakdownTable(r, b, eqDmg, liDmg, qDmg);
    html+=toleranceHtml(b.dmg,r.H);
    if(r.immA){ html+='<div class="dm-warn">🛡 该建筑对所有法术免疫，雷电与地震均无效，仅英雄装备伤害生效。</div>'; }
    else if(r.immL){ html+='<div class="dm-warn">🛡 该建筑对雷电法术免疫（雷电伤害按 0 计），地震法术仍然有效。</div>'; }
    if(r.ql<=0 && r.ll<=0){ html+='<div class="dm-warn">未设定雷电/地震法术等级，无法术伤害贡献。请先设定法术等级。</div>'; }
    box.innerHTML=html; box.classList.add("show");
  }

  function breakdownTable(r, b, eqDmg, liDmg, qDmg){
    var H=r.H, ql=r.ql, ll=r.ll;
    var html='<div class="dm-breakdown"><table><thead><tr><th>伤害来源</th><th>数量</th><th>单次伤害</th><th style="text-align:right">小计</th></tr></thead><tbody>';
    if(eqDmg>0)html+='<tr><td>🛡️ 英雄装备（技能伤害累计）</td><td>—</td><td>—</td><td class="dm-num">'+fmt(eqDmg)+'</td></tr>';
    if(b.a>0){
      html+='<tr><td>⚡ 雷电法术 Lv'+ll+'</td><td>'+b.a+'</td><td class="dm-num">'+fmt(lightDmg(ll))+'</td><td class="dm-num">'+fmt(liDmg)+'</td></tr>';
    }
    if(b.b>0){
      html+='<tr><td>🌍 地震法术 Lv'+ql+'（'+fmtPct(quakePct(ql))+' 全额'+(r.wall?'，城墙四震必毁':'，逐次递减')+'）</td><td>'+b.b+'</td><td class="dm-num">'+(r.wall&&b.b>=4?'第4瓶补足':'按递减')+'</td><td class="dm-num">'+fmt(qDmg)+'</td></tr>';
      /* 逐次明细 */
      for(var i=1;i<=b.b;i++){
        var once=quakeHitDmg(i,H,ql,r.wall);
        var note=r.wall&&i===4?'补足剩余生命值':(r.wall&&i>4?'目标已摧毁':'系数 1/'+(2*i-1));
        html+='<tr><td style="padding-left:30px; color:var(--ink-faint);">└ 第 '+i+' 次（'+note+'）</td><td>1</td><td class="dm-num">'+fmt(once)+'</td><td class="dm-num">'+fmt(once)+'</td></tr>';
      }
    }
    html+='<tr class="dm-total"><td>合计</td><td>'+((b.a||0)+(b.b||0))+' 法术</td><td></td><td class="dm-num">'+fmt(b.dmg!=null?b.dmg:(eqDmg+liDmg+qDmg))+'</td></tr>';
    if(H>0){
      var pctOfHp=(eqDmg+liDmg+qDmg)/H;
      html+='<tr><td style="color:var(--ink-faint);">占建筑最大生命值比例</td><td colspan="3" class="dm-num">'+(pctOfHp*100).toFixed(1)+'%'+(pctOfHp>=1?' ✓ 已可摧毁':'')+'</td></tr>';
    }
    html+='</tbody></table></div>';
    return html;
  }

  function renderMinResult(r, err){
    var box=$("dmResultMin");
    if(err){ box.innerHTML='<div class="dm-warn">'+esc(err)+'</div>'; box.classList.add("show"); return; }
    if(!r){ box.classList.remove("show"); return; }
    var b=r.best;
    var eqDmg=r.D_eq, liDmg=b.liDmg!=null?b.liDmg:(b.a*r.Dl), qDmg=b.eqDmg!=null?b.eqDmg:(b.b>0?quakeDmg(b.b,r.H,r.ql,r.wall):0);
    var total=eqDmg+liDmg+qDmg;
    var html='<div class="dm-result-headline dm-ok">';
    html+='<div class="dm-rh-label">摧毁所需最少法术空间</div>';
    html+='<div class="dm-rh-value"><span class="dm-grad">'+b.space+'</span> <span style="font-size:16px; color:var(--ink-dim); font-weight:600;">格</span></div>';
    if(r.eqSolo){
      html+='<div class="dm-rh-sub">⚡ 装备伤害已可单独摧毁 '+esc(findBuild(STATE.target).unit.chineseName)+'（HP '+fmt(r.H)+'），无需法术！</div>';
    }else{
      html+='<div class="dm-rh-sub">摧毁 '+esc(findBuild(STATE.target).unit.chineseName)+'（Lv'+(STATE.build[STATE.target]||0)+'，HP '+fmt(r.H)+(r.wall?'，城墙':'')+'），总伤害 '+fmt(total)+' / '+fmt(r.H)+'</div>';
    }
    html+='<div class="dm-config">';
    if(r.D_eq>0)html+='<span class="dm-chip dm-chip-eq">🛡️ 装备 <b>'+fmt(eqDmg)+'</b></span>';
    if(b.a>0)html+='<span class="dm-chip dm-chip-l">⚡ 雷电 ×'+b.a+' <b>'+fmt(liDmg)+'</b></span>';
    if(b.b>0)html+='<span class="dm-chip dm-chip-q">🌍 地震 ×'+b.b+' <b>'+fmt(qDmg)+'</b></span>';
    if(b.a===0&&b.b===0&&r.D_eq>0)html+='<span class="dm-chip">✓ 仅靠装备即可</span>';
    html+='</div></div>';
    if(!r.eqSolo){
      html+=minBreakdownTable(r, b, eqDmg, liDmg, qDmg, total);
    }
    html+=toleranceHtml(total,r.H);
    if(r.immA){ html+='<div class="dm-warn">🛡 该建筑对所有法术免疫，仅英雄装备伤害生效。</div>'; }
    else if(r.immL){ html+='<div class="dm-warn">🛡 该建筑对雷电法术免疫（雷电伤害按 0 计），地震法术仍然有效。</div>'; }
    box.innerHTML=html; box.classList.add("show");
  }

  function minBreakdownTable(r, b, eqDmg, liDmg, qDmg, total){
    var H=r.H, ql=r.ql, ll=r.ll;
    var html='<div class="dm-breakdown"><table><thead><tr><th>伤害来源</th><th>数量 / 占法术空间</th><th>单次伤害</th><th style="text-align:right">小计</th></tr></thead><tbody>';
    if(eqDmg>0)html+='<tr><td>🛡️ 英雄装备（技能伤害累计）</td><td>—（不占法术空间）</td><td>—</td><td class="dm-num">'+fmt(eqDmg)+'</td></tr>';
    if(b.b>0){
      html+='<tr><td>🌍 地震法术 Lv'+ql+'（'+fmtPct(quakePct(ql))+' 全额'+(r.wall?'，城墙四震必毁':'，逐次递减')+'）</td><td>'+b.b+' 格</td><td class="dm-num">'+(r.wall&&b.b>=4?'第4瓶补足':'按递减')+'</td><td class="dm-num">'+fmt(qDmg)+'</td></tr>';
      for(var i=1;i<=b.b;i++){
        var once=quakeHitDmg(i,H,ql,r.wall);
        var note=r.wall&&i===4?'补足剩余生命值':(r.wall&&i>4?'目标已摧毁':'系数 1/'+(2*i-1));
        html+='<tr><td style="padding-left:30px; color:var(--ink-faint);">└ 第 '+i+' 次（'+note+'）</td><td>1 格</td><td class="dm-num">'+fmt(once)+'</td><td class="dm-num">'+fmt(once)+'</td></tr>';
      }
    }
    if(b.a>0){
      html+='<tr><td>⚡ 雷电法术 Lv'+ll+'</td><td>'+b.a+' 格</td><td class="dm-num">'+fmt(lightDmg(ll))+'</td><td class="dm-num">'+fmt(liDmg)+'</td></tr>';
    }
    html+='<tr class="dm-total"><td>合计伤害 / 建筑生命值</td><td>'+(b.a+b.b)+' 格法术</td><td></td><td class="dm-num">'+fmt(total)+' / '+fmt(H)+'</td></tr>';
    html+='</tbody></table></div>';
    return html;
  }

  /* ===== 通知 ===== */
  function showImportError(msg){ var e=$("dmImportError"); e.textContent=msg; e.classList.add("show"); }
  function clearImportError(){ var e=$("dmImportError"); e.textContent=""; e.classList.remove("show"); }
  function flashImportOk(msg){
    var e=$("dmImportError");
    e.textContent="✓ "+msg;
    e.style.background="rgba(16,185,129,.12)"; e.style.color="#a7f3d0"; e.style.borderColor="rgba(16,185,129,.34)";
    e.classList.add("show");
    setTimeout(function(){ e.classList.remove("show"); e.style.background=""; e.style.color=""; e.style.borderColor=""; }, 4000);
  }
  function showError(msg){ var e=$("dmImportError"); e.textContent=msg; e.classList.add("show"); }

  /* ===== 持久化 ===== */
  function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }catch(e){} }
  function load(){
    try{
      var s=localStorage.getItem(LS_KEY);
      if(s){
        var o=JSON.parse(s);
        if(o&&o.eq){
          STATE=o;
          if(!STATE.eqOn)STATE.eqOn={};
          if(!STATE.builders)STATE.builders={count:0,levels:[]};
          if(!Array.isArray(STATE.builders.levels))STATE.builders.levels=[];
        }
      }
    }catch(e){}
  }

  function renderAll(){
    renderSpellLevels(); renderTHLevels(); renderEquipGroups(); renderBuilders(); renderBuildGroups(); renderTargetOptions(); renderTargetInfo(); save();
  }

  function init(){
    load();
    loadGame(function(){
      renderAll();
      /* 法术等级变化 */
      $("dmLightLvl").addEventListener("change", function(){ STATE.spell.l=intv(this.value); renderTargetInfo(); save(); });
      $("dmQuakeLvl").addEventListener("change", function(){ STATE.spell.q=intv(this.value); renderTargetInfo(); save(); });
      /* 大本营 / 参与回血的建筑工人小屋 */
      $("dmTHLvl").addEventListener("change", function(){ STATE.th=intv(this.value); save(); });
      $("dmFillTHBtn").addEventListener("click", fillTHLevels);
      $("dmBuilderCount").addEventListener("change",function(){ STATE.builders.count=Math.max(0,Math.min(6,intv(this.value))); renderBuilders(); save(); });
      /* 目标建筑 */
      $("dmTargetBuild").addEventListener("change", function(){ STATE.target=this.value; renderTargetInfo(); save(); });
      /* 导入 */
      $("dmImportBtn").addEventListener("click", importVillage);
      $("dmClearLvlsBtn").addEventListener("click", function(){ if(confirm("确定清空所有装备、法术、建筑等级设置？"))clearAllLevels(); });
      /* 计算按钮 */
      $("dmCalcMaxBtn").addEventListener("click", calcMax);
      $("dmCalcMinBtn").addEventListener("click", calcMin);
      /* 标签切换 */
      document.querySelectorAll(".dm-tab").forEach(function(t){
        t.addEventListener("click", function(){
          var tab=t.getAttribute("data-tab");
          document.querySelectorAll(".dm-tab").forEach(function(x){ x.classList.toggle("active", x===t); });
          document.querySelectorAll(".dm-tab-pane").forEach(function(p){ p.classList.toggle("active", p.id==="dmPane"+(tab==="max"?"Max":"Min")); });
        });
      });
      /* 默认目标 */
      if(!STATE.target && buildList.length){
        var wall=buildList.find(function(b){return isWall(b.unit);});
        if(wall)STATE.target=wall.gid;
      }
      renderTargetOptions(); renderTargetInfo();
    });
  }

  init();
})();
