/* ===== 天择网 · COC 专区首页（含村庄存档分析） · app.js ===== */
(function () {
  "use strict";

  var EQUIP_MAP = {
    90000000:{zh:"野蛮人木偶",hero:"蛮王"},90000001:{zh:"狂暴药水瓶",hero:"蛮王"},90000002:{zh:"弓箭手木偶",hero:"女王"},90000003:{zh:"隐形药水瓶",hero:"女王"},90000004:{zh:"永恒书卷",hero:"永王"},90000005:{zh:"生命宝石",hero:"永王"},90000006:{zh:"寻踪飞盾",hero:"闰土"},90000007:{zh:"皇家宝石",hero:"闰土"},90000008:{zh:"地震金靴",hero:"蛮王"},90000009:{zh:"野猪骑士木偶",hero:"闰土"},90000010:{zh:"巨型手套",hero:"蛮王"},90000011:{zh:"治疗胡须",hero:"蛮王"},90000012:{zh:"急速药水瓶",hero:"闰土"},90000013:{zh:"火箭飞矛",hero:"闰土"},90000014:{zh:"尖刺足球",hero:"蛮王"},90000015:{zh:"冰封箭矢",hero:"女王"},90000016:{zh:"擎天箭矢",hero:"女王"},90000017:{zh:"巨型箭矢",hero:"女王"},90000019:{zh:"英雄火炬",hero:"永王"},90000020:{zh:"天使木偶",hero:"女王"},90000022:{zh:"巨大火球",hero:"永王"},90000024:{zh:"狂暴宝石",hero:"永王"},90000032:{zh:"灵蛇手镯",hero:"蛮王"},90000034:{zh:"治疗书卷",hero:"永王"},90000035:{zh:"暗黑皇冠",hero:"王子"},90000039:{zh:"克隆魔镜",hero:"女王"},90000040:{zh:"雷电战靴",hero:"闰土"},90000041:{zh:"熔岩气球玩偶",hero:"永王"},90000042:{zh:"护卫玩偶",hero:"王子"},90000043:{zh:"暗黑魔球",hero:"王子"},90000044:{zh:"铁甲短裤",hero:"王子"},90000045:{zh:"MP Trap Shield",hero:"王子"},90000046:{zh:"Punch Arrow",hero:"女王"},90000047:{zh:"贵族哑铃",hero:"王子"},90000048:{zh:"动作人偶",hero:"女王"},90000049:{zh:"陨石法杖",hero:"王子"},90000050:{zh:"冷冽冰晶",hero:"闰土"},90000051:{zh:"木棍马驹",hero:"蛮王"},90000052:{zh:"烈焰之心",hero:"龙王"},90000053:{zh:"火箭背包",hero:"龙王"},90000056:{zh:"爆震器",hero:"龙王"},90000057:{zh:"助燃器",hero:"龙王"},90000059:{zh:"雷电獠牙",hero:"龙王"},90000060:{zh:"反击卡组",en:"Revenge Deck",internal:"Draconic Counter",hero:"龙王"}
  };
  var HELPER_MAP = { 93000000:{zh:"建筑工人学徒",type:"建筑"}, 93000001:{zh:"实验助手",type:"研究"}, 93000002:{zh:"炼金术士",type:"炼金"}, 93000003:{zh:"探矿者",type:"探矿"} };

  var G = null, IDMAP = {}, V = null, TH = 0, BH = 0, TASKS = [], SNAPSHOT_COVERAGE = null;
  var GOB_WORKER = 0, GOB_LAB = 0;
  var INPUT_BASELINE = "", INPUT_DIRTY = false;
  var REVISION_READY = false, REVISION_BOUND = false, PENDING_REVISION = null, REVISION_CHANNEL = null;
  var SEEN_REVISIONS = Object.create(null), SEEN_REVISION_ORDER = [];
  var LOCAL_REVISION_KEY = "tz_local_data_revision_v1";
  var LOCAL_REVISION_EVENT = "tz-local-data-revision";
  var VILLAGE_ARRAY_FIELDS = ["helpers","buildings","traps","decos","obstacles","units","siege_machines","heroes","spells","pets","equipment","house_parts","skins","sceneries","buildings2","traps2","units2","heroes2"];
  var VILLAGE_OBJECT_ARRAY_FIELDS = ["helpers","buildings","traps","decos","obstacles","units","siege_machines","heroes","spells","pets","equipment","buildings2","traps2","units2","heroes2"];

  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value==null?"":value).replace(/[&<>"']/g,function(ch){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];}); }
  function uiGlyph(key){ return '<span data-ui-icon="'+key+'" aria-hidden="true"></span>'; }
  function fmtDur(sec){ sec=Math.max(0,Math.round(sec)); var d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60,p=[]; if(d)p.push(d+"天"); if(h)p.push(h+"时"); if(m)p.push(m+"分"); if(!p.length)p.push(s+"秒"); return p.join(""); }
  function num(v){ v=parseInt(v,10); return isNaN(v)?0:v; }
  function safeCount(v){ var n=num(v); return Math.max(1,Math.min(n||1,1000)); }
  function safeId(id){ var value=String(id==null?"":id).trim(); return /^-?\d+$/.test(value)?value:"未知"; }
  function assetImage(id,level,className,size){ return window.CocGameAssets?window.CocGameAssets.image(id,level,{className:className||"",size:size||50,alt:""}):""; }
  function nameOf(id){ var u=IDMAP[String(id)]; if(u&&u.chineseName)return u.chineseName; if(EQUIP_MAP[id])return EQUIP_MAP[id].zh; if(HELPER_MAP[id])return HELPER_MAP[id].zh; return "ID"+safeId(id); }
  function unitOf(id){ return IDMAP[String(id)]||null; }
  function catOf(id){ var u=IDMAP[String(id)]; return u?u.category:""; }
  function isBBcat(c){ return c&&c.indexOf("夜世界")===0; }

  function validLocalRevision(detail){
    return !!detail&&typeof detail==="object"&&!Array.isArray(detail)&&
      detail.schemaVersion===1&&detail.module==="coc"&&
      (detail.resource==="village"||detail.resource==="snapshot")&&
      typeof detail.revision==="string"&&detail.revision.length>0&&detail.revision.length<=160&&
      typeof detail.changedAt==="number"&&isFinite(detail.changedAt)&&detail.changedAt>0;
  }
  function rememberRevision(revision){
    if(SEEN_REVISIONS[revision])return false;
    SEEN_REVISIONS[revision]=true; SEEN_REVISION_ORDER.push(revision);
    if(SEEN_REVISION_ORDER.length>64)delete SEEN_REVISIONS[SEEN_REVISION_ORDER.shift()];
    return true;
  }
  function inputIsDirty(){
    var input=$("vJsonInput");
    INPUT_DIRTY=!!input&&input.value!==INPUT_BASELINE;
    return INPUT_DIRTY;
  }
  function markInputCommitted(text){
    INPUT_BASELINE=String(text==null?"":text);
    INPUT_DIRTY=false;
  }
  function showSyncNotice(message, allowReload){
    var notice=$("vSyncNotice"), text=$("vSyncNoticeText"), button=$("vSyncReload");
    if(!notice||!text||!button)return;
    text.textContent=message;
    if(allowReload)button.removeAttribute("hidden");else button.setAttribute("hidden","");
    notice.removeAttribute("hidden");
  }
  function clearSyncNotice(){
    var notice=$("vSyncNotice"), button=$("vSyncReload");
    if(notice)notice.setAttribute("hidden","");
    if(button)button.setAttribute("hidden","");
  }

  function buildTimeSec(r){ if(!r)return 0; return num(r.BuildTimeD)*86400+num(r.BuildTimeH)*3600+num(r.BuildTimeM)*60+num(r.BuildTimeS); }
  function upgradeTimeSec(r){ if(!r)return 0; return num(r.UpgradeTimeH)*3600+num(r.UpgradeTimeM)*60; }
  function thOf(r){ if(!r)return 99; var v=r.requiredTownHallLevel!=null?r.requiredTownHallLevel:(r.RequiredTownHallLevel!=null?r.RequiredTownHallLevel:(r.TownHallLevel!=null?r.TownHallLevel:99)); return num(v); }
  function maxLevelForTH(unit,th){ if(!unit||!unit.levels||!unit.levels.length)return 0; var m=0; unit.levels.forEach(function(r){ var t=thOf(r); if(t<=th&&num(r.level)>m)m=num(r.level); }); return m; }
  function upgradeSec(unit,cur,tgt,isBuilding){ if(!unit||!unit.levels)return 0; var lmap={}; unit.levels.forEach(function(r){ var lv=num(r.level); if(lv)lmap[lv]=r; }); var t=0; if(isBuilding){ for(var L=cur+1;L<=tgt;L++){ var r=lmap[L]; if(!r)break; t+=buildTimeSec(r); } } else { for(var L2=cur;L2<tgt;L2++){ var r2=lmap[L2]; if(!r2)break; t+=upgradeTimeSec(r2); } } return t; }
  // timer 是当前这一级升级的剩余秒数：替换首级完整时长，后续级别仍按表累加。
  function remainingUpgradeSec(unit,cur,tgt,isBuilding,timer){
    var left=num(timer);
    if(left>0&&cur<tgt)return left+upgradeSec(unit,cur+1,tgt,isBuilding);
    return upgradeSec(unit,cur,tgt,isBuilding);
  }
  function superchargeLevelOf(item){
    var keys=["mini_level","mini_lvl","miniLevel","supercharge_level","superchargeLevel","supercharge"];
    for(var i=0;i<keys.length;i++){
      var value=item&&item[keys[i]];
      if(value!=null&&typeof value!=="object")return Math.max(0,num(value));
    }
    return 0;
  }
  function superchargeTimeSec(row){ return buildTimeSec(row); }
  function superchargeUpgradeSec(unit,cur,tgt,timer){
    if(!unit||!unit.supercharge||!unit.supercharge.levels)return 0;
    var lmap={}; unit.supercharge.levels.forEach(function(row){lmap[num(row.level)]=row;});
    var total=0;
    for(var level=cur+1;level<=tgt;level++)total+=superchargeTimeSec(lmap[level]);
    if(num(timer)>0&&cur<tgt){
      total-=superchargeTimeSec(lmap[cur+1]);
      total+=num(timer);
    }
    return Math.max(0,total);
  }

  /* 新分工：研究员=兵种/法术/攻城机器，战宠研究员=战宠，建筑工人=英雄/建筑/陷阱/其他 */
  function laneOf(cat, world){
    var bb = isBBcat(cat);
    if(/兵|法术|攻城机器/.test(cat)) return bb?"bb_lab":"home_lab";
    if(/战宠/.test(cat)) return "home_pet";
    return bb?"bb_builder":"home_builder";
  }

  function loadGame(cb){
    var assetsReady=window.CocGameAssets?window.CocGameAssets.ready():Promise.resolve();
    Promise.all([fetch("data/all_game_data_zh.json?v=20260830a").then(function(r){return r.json();}),assetsReady]).then(function(values){
      var d=values[0]; G=d; d.units.forEach(function(u){ var g=String(u.globalID||"").trim(); if(g)IDMAP[g]=u; }); cb();
    }).catch(function(e){ showError("游戏数据加载失败："+e.message+"（请通过 http 访问本页）"); });
  }
  function parseVillage(text){
    try{
      if(typeof text!=="string"||text.length>10*1024*1024)throw new Error("文件超过 10 MB 安全上限");
      var value=JSON.parse(text);
      if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("顶层必须是对象");
      var expandedEntities=0;
      VILLAGE_ARRAY_FIELDS.forEach(function(key){
        if(value[key]!=null&&!Array.isArray(value[key]))throw new Error("字段 "+key+" 必须是数组");
        if(Array.isArray(value[key])&&VILLAGE_OBJECT_ARRAY_FIELDS.indexOf(key)!==-1){
          if(value[key].length>10000)throw new Error("字段 "+key+" 项目过多");
          value[key].forEach(function(item,index){
            if(!item||typeof item!=="object"||Array.isArray(item))throw new Error("字段 "+key+" 的第 "+(index+1)+" 项必须是对象");
            expandedEntities+=safeCount(item.cnt);
            if(expandedEntities>20000)throw new Error("村庄实体数量超过 20000 项安全上限");
          });
        }
      });
      return value;
    }catch(e){ showError("JSON 格式或结构错误："+e.message); return null; }
  }

  function detectTH(v){ var th=num(v&&v.townHallLevel); (v.buildings||[]).forEach(function(b){ if(b.weapon!=null)th=Math.max(th,num(b.lvl)); }); if(!th)(v.buildings||[]).forEach(function(b){ if(/大本营/.test(nameOf(b.data)))th=num(b.lvl); }); return th; }
  function detectBH(v){ var bh=num(v&&v.builderHallLevel); (v.buildings2||[]).forEach(function(b){ if(/大本营/.test(nameOf(b.data)))bh=Math.max(bh,num(b.lvl)); }); return bh; }
  function builderCount(v){ var n=0; (v.buildings||[]).forEach(function(b){ if(/建筑工人小屋|小博木屋/.test(nameOf(b.data)))n+=safeCount(b.cnt); }); return n; }
  function bbBuilderCount(v){ var n=1; (v.buildings2||[]).forEach(function(b){ if(/奥仔哨站|博仔棚屋/.test(nameOf(b.data)))n+=safeCount(b.cnt); }); return n; }
  function hasPetHouse(v){ return (v.buildings||[]).some(function(b){ return /战宠/.test(nameOf(b.data)); }); }

  /* 工人/研究员数量（含哥布林选项） */
  function workerCounts(){
    return {
      home_builder: builderCount(V) + GOB_WORKER,
      home_lab: 1 + GOB_LAB,
      home_pet: hasPetHouse(V) ? 1 : 0,
      bb_builder: bbBuilderCount(V),
      bb_lab: 1
    };
  }

  function m(l,v,s){ return '<div class="v-metric"><div class="vm-label">'+esc(l)+'</div><div class="vm-value">'+esc(v)+'</div>'+(s?'<div class="vm-sub">'+esc(s)+'</div>':'')+'</div>'; }

  function renderMetrics(){
    var ts=V.timestamp||0, d=ts?new Date(ts*1000):null;
    var wc=workerCounts();
    var html="";
    html+=m("玩家标签",V.tag||"无");
    html+=m("数据截取时间",d?d.toLocaleString("zh-CN"):"无","");
    html+=m("家乡村庄大本营",TH+" 本","");
    html+=m("建筑大师大本营",BH?BH+" 本":"未建","");
    html+=m("家乡村庄建筑工人",wc.home_builder+" 个","含哥布林建筑工人 "+GOB_WORKER+" 名");
    html+=m("待升级任务",TASKS.length+" 项","见下方总览与规划器");
    $("vMetrics").innerHTML=html;
  }

  function renderItem(it){
    var nm=esc(nameOf(it.data)), tags="";
    if(it.gear_up)tags+='<span class="vi-tag v-tag-gear">改造</span>';
    if(it.weapon!=null)tags+='<span class="vi-tag v-tag-gear">武器'+num(it.weapon)+'</span>';
    if(it.extra)tags+='<span class="vi-tag v-tag-extra">超级兵</span>';
    var superchargeLevel=superchargeLevelOf(it);
    if(superchargeLevel)tags+='<span class="vi-tag v-tag-gear">超级充能 '+superchargeLevel+'级</span>';
    if(it.timer)tags+='<span class="vi-tag v-tag-up">升级中 '+fmtDur(it.timer)+'</span>';
    var cnt=num(it.cnt)>0?'<span class="vi-cnt">×'+safeCount(it.cnt)+'</span>':'';
    return '<div class="v-item">'+assetImage(it.data,it.lvl,"vi-image",50)+'<span class="vi-copy"><span class="vi-name">'+nm+cnt+'</span><span class="vi-meta"><span class="vi-lvl">'+num(it.lvl)+'级</span>'+tags+'</span></span></div>';
  }
  function renderCat(title,iconKey,items){
    if(!items||!items.length)return '<div class="v-cat"><div class="v-cat-head"><span class="vc-emoji" data-ui-icon="'+esc(iconKey)+'" aria-hidden="true"></span>'+esc(title)+'</div><div class="v-empty">无</div></div>';
    var h='<div class="v-cat"><div class="v-cat-head"><span class="vc-emoji" data-ui-icon="'+esc(iconKey)+'" aria-hidden="true"></span>'+esc(title)+' <span class="vc-count">'+items.length+' 项</span></div><div class="v-cat-grid">';
    items.forEach(function(it){ h+=renderItem(it); }); h+='</div></div>'; return h;
  }
  function renderHome(){
    var v=V,h="";
    h+=renderCat("英雄","trophy",v.heroes||[]);
    h+=renderCat("兵种","swords",v.units||[]);
    h+=renderCat("攻城机器","cart",v.siege_machines||[]);
    h+=renderCat("法术","sparkle",v.spells||[]);
    h+=renderCat("战宠","heart",v.pets||[]);
    var eqs=v.equipment||[];
    if(eqs.length){
      h+='<div class="v-cat"><div class="v-cat-head"><span class="vc-emoji" data-ui-icon="shield" aria-hidden="true"></span>英雄装备 <span class="vc-count">'+eqs.length+' 件</span></div><div class="v-cat-grid">';
      eqs.forEach(function(e){ var info=EQUIP_MAP[e.data]||{zh:nameOf(e.data),hero:"?"}; var level=num(e.lvl), unit=unitOf(e.data), maximum=maxLevelForTH(unit,99)||18; h+='<div class="v-item">'+assetImage(e.data,level,"vi-image",50)+'<span class="vi-copy"><span class="vi-name">'+esc(info.zh)+' <span class="vi-cnt">'+esc(info.hero)+'</span></span><span class="vi-meta"><span class="vi-lvl">'+level+'级</span>'+(level>=maximum?'<span class="vi-tag v-tag-done">满级</span>':'')+'</span></span></div>'; });
      h+='</div></div>';
    }
    h+=renderCat("建筑","home",v.buildings||[]);
    h+=renderCat("陷阱","warning",v.traps||[]);
    var hs=v.helpers||[];
    if(hs.length){
      h+='<div class="v-cat"><div class="v-cat-head"><span class="vc-emoji" data-ui-icon="settings" aria-hidden="true"></span>帮手 <span class="vc-count">'+hs.length+' 个</span></div><div class="v-cat-grid">';
      hs.forEach(function(it){ var info=HELPER_MAP[it.data]||{zh:nameOf(it.data)}; var cd=it.helper_cooldown?'<span class="vi-tag v-tag-up">冷却 '+fmtDur(it.helper_cooldown)+'</span>':''; h+='<div class="v-item">'+assetImage(it.data,it.lvl,"vi-image",50)+'<span class="vi-copy"><span class="vi-name">'+esc(info.zh)+'</span><span class="vi-meta"><span class="vi-lvl">'+num(it.lvl)+'级</span>'+cd+'</span></span></div>'; });
      h+='</div></div>';
    }
    $("vHome").innerHTML=h;
  }
  function renderBB(){
    var v=V,h="";
    h+=renderCat("英雄","trophy",v.heroes2||[]);
    h+=renderCat("兵种","swords",v.units2||[]);
    h+=renderCat("建筑","home",v.buildings2||[]);
    h+=renderCat("陷阱","warning",v.traps2||[]);
    $("vBB").innerHTML=h;
  }

  function computeTasks(){
    TASKS=[]; var bid=0;
    function push(item, isBuilding, world){
      var unit=unitOf(item.data);
      if(!unit||!unit.levels||!unit.levels.length)return;
      var cur=num(item.lvl);
      var maxL=maxLevelForTH(unit, world==="bb"?BH:TH);
      // 官方存档会把同级实体压成 cnt；时间总览必须按实体展开，timer 只属于其中第一个。
      var cnt=safeCount(item.cnt), timer=num(item.timer);
      if(maxL>0&&cur<maxL){
        for(var inst=0;inst<cnt;inst++){
          var upgrading=timer>0&&inst===0;
          // 城墙等即时升级也属于待升级实体；保留 0 秒任务，数量统计才不会再次漏掉 cnt。
          var sec=Math.max(0,remainingUpgradeSec(unit,cur,maxL,isBuilding,upgrading?timer:0));
          bid++; TASKS.push({id:bid,name:nameOf(item.data),curLvl:cur,maxLvl:maxL,sec:sec,isBuilding:isBuilding,cat:catOf(item.data),world:world,upgrading:upgrading,instance:inst,count:cnt});
        }
      }
      // 超级充能只属于家乡满级建筑，阶段由 APK 的 buildings.MiniLevels 活动关联提供。
      var supercharge=unit.supercharge, superchargeLevel=superchargeLevelOf(item);
      var superchargeMax=supercharge&&supercharge.levels?supercharge.levels.length:0;
      var requiredTH=supercharge?num(supercharge.requiredTownHallLevel):99;
      if(isBuilding&&world==="home"&&cur>=maxL&&TH>=requiredTH&&superchargeLevel<superchargeMax){
        for(var miniInst=0;miniInst<cnt;miniInst++){
          var miniUpgrading=timer>0&&miniInst===0;
          var miniSec=superchargeUpgradeSec(unit,superchargeLevel,superchargeMax,miniUpgrading?timer:0);
          bid++; TASKS.push({id:bid,name:nameOf(item.data)+" · 超级充能",curLvl:superchargeLevel,maxLvl:superchargeMax,sec:miniSec,isBuilding:true,isSupercharge:true,cat:catOf(item.data),world:world,upgrading:miniUpgrading,instance:miniInst,count:cnt});
        }
      }
    }
    (V.units||[]).forEach(function(it){ push(it,false,"home"); });
    (V.siege_machines||[]).forEach(function(it){ push(it,false,"home"); });
    (V.spells||[]).forEach(function(it){ push(it,false,"home"); });
    (V.heroes||[]).forEach(function(it){ push(it,false,"home"); });
    (V.pets||[]).forEach(function(it){ push(it,false,"home"); });
    (V.buildings||[]).forEach(function(it){ push(it,true,"home"); });
    (V.traps||[]).forEach(function(it){ push(it,true,"home"); });
    (V.units2||[]).forEach(function(it){ push(it,false,"bb"); });
    (V.heroes2||[]).forEach(function(it){ push(it,false,"bb"); });
    (V.buildings2||[]).forEach(function(it){ push(it,true,"bb"); });
    (V.traps2||[]).forEach(function(it){ push(it,true,"bb"); });
  }

  /* 升级时间总览：分家乡/夜世界，墙钟时间=串行总时长÷工人数 */
  function renderTimeOverview(){
    var wc=workerCounts();
    var groups = {
      home_builder:{label:"建筑工人",sec:0,n:0}, home_lab:{label:"实验室",sec:0,n:0}, home_pet:{label:"战宠小屋",sec:0,n:0},
      bb_builder:{label:"建筑工人",sec:0,n:0}, bb_lab:{label:"星空实验室",sec:0,n:0}
    };
    TASKS.forEach(function(t){ var k=laneOf(t.cat,t.world); if(groups[k]){groups[k].sec+=t.sec;groups[k].n++;} });

    function block(title, iconKey, keys){
      var maxSec=0; keys.forEach(function(k){ if(groups[k].sec>maxSec)maxSec=groups[k].sec; });
      var h='<div class="v-world-block"><h3>'+uiGlyph(iconKey)+' '+title+'</h3>';
      h+='<table class="v-time-table"><thead><tr><th>负责方</th><th>任务数</th><th>串行总时长</th><th>并行栏位</th><th>墙钟时间</th><th style="width:22%">占比</th></tr></thead><tbody>';
      keys.forEach(function(k){
        var g=groups[k], slots=wc[k]||0, wall = slots>0?g.sec/slots:0;
        var pct = maxSec?Math.round(g.sec/maxSec*100):0;
        var wallStr = slots>0 ? '<span class="v-wallclock">'+fmtDur(wall)+'</span>' : '<span style="color:var(--ink-faint)">无该建筑</span>';
        h+='<tr><td class="vt-cat">'+g.label+'</td><td>'+g.n+'</td><td>'+fmtDur(g.sec)+'</td><td>'+slots+'</td><td>'+wallStr+'</td><td><div class="v-time-bar"><div class="vt-fill" style="width:'+pct+'%"></div></div></td></tr>';
      });
      h+='</tbody></table></div>';
      return h;
    }
    var html = block("家乡村庄","home",["home_builder","home_lab","home_pet"]) + block("建筑大师基地","moon",["bb_builder","bb_lab"]);
    $("vTimeOverview").innerHTML=html;
  }

  function saveToStorage(){
    try{
      var base={ home_builder:builderCount(V), home_lab:1, home_pet:hasPetHouse(V)?1:0, bb_builder:bbBuilderCount(V), bb_lab:1 };
      var legacy={village:V,th:TH,bh:BH,baseWC:base,gobWorker:GOB_WORKER,gobLab:GOB_LAB,tasks:TASKS,ts:Date.now()};
      if(SNAPSHOT_COVERAGE){legacy.coverage=SNAPSHOT_COVERAGE;legacy.missingFields=Object.keys(SNAPSHOT_COVERAGE).filter(function(key){return !SNAPSHOT_COVERAGE[key];});}
      if(window.TianzeCocSnapshot&&!(SNAPSHOT_COVERAGE&&SNAPSHOT_COVERAGE.buildings===false)){
        var snapshot=window.TianzeCocSnapshot.fromFullAccount(V,{townHallLevel:TH,builderHallLevel:BH,provider:"game-account-json"});
        var previous=window.TianzeCocSnapshot.load();
        if(previous&&previous.officialRaw&&String(previous.profile&&previous.profile.tag||"")===String(snapshot.profile.tag||""))snapshot.officialRaw=previous.officialRaw;
        window.TianzeCocSnapshot.save(snapshot);
      }
      // v2 保存器只负责兼容骨架；这里写回真实工人数、任务和用户选择，供规划器直接使用。
      localStorage.setItem("tz_coc_village", JSON.stringify(legacy));
    }catch(e){}
  }

  function render(options){
    options=options||{};
    var result=$("vResult");
    result.classList.add("show");
    renderMetrics(); renderTimeOverview(); renderHome(); renderBB();
    if(options.persist!==false)saveToStorage();
    if(options.reveal!==false){
      result.setAttribute("tabindex","-1");
      result.scrollIntoView({behavior:"smooth",block:"start"});
      result.focus({preventScroll:true});
      result.addEventListener("blur",function removeTemporaryResultTabIndex(){
        result.removeAttribute("tabindex");
      },{once:true});
    }else{
      result.removeAttribute("tabindex");
      if(!location.hash){
        requestAnimationFrame(function(){
          window.scrollTo({top:0,left:0,behavior:"auto"});
        });
      }
    }
  }
  function showError(msg){ var e=$("vError"); e.textContent=msg; e.classList.add("show"); $("vJsonInput").setAttribute("aria-invalid","true"); e.focus(); }
  function clearError(){ var e=$("vError"); e.textContent=""; e.classList.remove("show"); $("vJsonInput").removeAttribute("aria-invalid"); }

  function loadPersistedVillage(options){
    options=options||{};
    var saved;
    try{
      saved=JSON.parse(localStorage.getItem("tz_coc_village")||"null");
    }catch(error){
      showSyncNotice("助手已修改村庄存档，但保存内容无法读取。当前输入没有被覆盖。",false);
      return false;
    }
    if(!saved||!saved.village){
      V=null; TH=0; BH=0; TASKS=[]; SNAPSHOT_COVERAGE=null; GOB_WORKER=0; GOB_LAB=0;
      $("vJsonInput").value="";
      $("vGobWorker").checked=false; $("vGobLab").checked=false;
      $("vResult").classList.remove("show");
      clearError(); markInputCommitted("");
      if(options.notice!==false)showSyncNotice("站内助手已清除本机村庄存档。",false);
      return true;
    }
    var savedText=typeof saved.village==="string"?saved.village:JSON.stringify(saved.village);
    var parsed=parseVillage(savedText);
    if(!parsed){
      showSyncNotice("助手已修改村庄存档，但新内容无法解析。当前输入没有被覆盖。",false);
      return false;
    }
    $("vJsonInput").value=savedText;
    V=parsed; SNAPSHOT_COVERAGE=saved.coverage||null;
    TH=detectTH(V); BH=detectBH(V); GOB_WORKER=saved.gobWorker||0; GOB_LAB=saved.gobLab||0;
    $("vGobWorker").checked=!!GOB_WORKER; $("vGobLab").checked=!!GOB_LAB;
    computeTasks(); render({reveal:false,persist:false}); clearError(); markInputCommitted(savedText);
    if(options.notice!==false)showSyncNotice("站内助手的村庄存档修改已载入。",false);
    return true;
  }

  function applyPendingRevision(explicit){
    if(!PENDING_REVISION||!REVISION_READY)return false;
    if(!explicit&&inputIsDirty()){
      showSyncNotice("站内助手已修改本机村庄存档。文本框里还有未保存内容，因此没有自动覆盖。",true);
      return false;
    }
    if(loadPersistedVillage({notice:true})){
      PENDING_REVISION=null;
      return true;
    }
    return false;
  }

  function receiveLocalRevision(detail){
    if(!validLocalRevision(detail)||!rememberRevision(detail.revision))return false;
    PENDING_REVISION={
      schemaVersion:1,module:"coc",resource:detail.resource,
      revision:detail.revision,changedAt:detail.changedAt
    };
    if(!REVISION_READY)return true;
    applyPendingRevision(false);
    return true;
  }

  function bindLocalRevision(){
    if(REVISION_BOUND||!window.addEventListener)return;
    REVISION_BOUND=true;
    window.addEventListener(LOCAL_REVISION_EVENT,function(event){receiveLocalRevision(event&&event.detail);});
    window.addEventListener("storage",function(event){
      if(!event||event.key!==LOCAL_REVISION_KEY||typeof event.newValue!=="string")return;
      try{receiveLocalRevision(JSON.parse(event.newValue));}catch(_error){}
    });
    if(typeof window.BroadcastChannel==="function"){
      try{
        REVISION_CHANNEL=new window.BroadcastChannel(LOCAL_REVISION_EVENT);
        REVISION_CHANNEL.addEventListener("message",function(event){receiveLocalRevision(event&&event.data);});
      }catch(_error){REVISION_CHANNEL=null;}
    }
    window.addEventListener("pagehide",function(){
      if(REVISION_CHANNEL){try{REVISION_CHANNEL.close();}catch(_error){}REVISION_CHANNEL=null;}
    },{once:true});
  }

  var SAMPLE = '{"tag":"#GU9JCCV8P","timestamp":1783589176,"helpers":[{"data":93000000,"lvl":5,"helper_cooldown":3452},{"data":93000001,"lvl":6,"helper_cooldown":3452},{"data":93000002,"lvl":2,"helper_cooldown":3452},{"data":93000003,"lvl":1,"helper_cooldown":3452}],"buildings":[{"data":1000001,"lvl":13,"weapon":1},{"data":1000008,"lvl":17,"gear_up":1},{"data":1000009,"lvl":17,"gear_up":1},{"data":1000013,"lvl":12,"gear_up":1},{"data":1000012,"lvl":10,"timer":12728},{"data":1000059,"lvl":3,"timer":143120},{"data":1000000,"lvl":11,"cnt":4},{"data":1000002,"lvl":15,"cnt":7},{"data":1000003,"lvl":14,"cnt":4},{"data":1000004,"lvl":15,"cnt":7},{"data":1000005,"lvl":14,"cnt":4},{"data":1000006,"lvl":15,"cnt":1},{"data":1000007,"lvl":11,"cnt":1},{"data":1000008,"lvl":17,"cnt":6},{"data":1000009,"lvl":17,"cnt":7},{"data":1000010,"lvl":13,"cnt":57},{"data":1000010,"lvl":14,"cnt":243},{"data":1000011,"lvl":11,"cnt":5},{"data":1000012,"lvl":10,"cnt":3},{"data":1000013,"lvl":12,"cnt":3},{"data":1000014,"lvl":9,"cnt":1},{"data":1000015,"lvl":1,"cnt":5},{"data":1000019,"lvl":10,"cnt":5},{"data":1000020,"lvl":7,"cnt":1},{"data":1000021,"lvl":7,"cnt":4},{"data":1000023,"lvl":9,"cnt":3},{"data":1000024,"lvl":8,"cnt":1},{"data":1000026,"lvl":10,"cnt":1},{"data":1000027,"lvl":7,"cnt":3},{"data":1000028,"lvl":7,"cnt":2},{"data":1000029,"lvl":6,"cnt":1},{"data":1000031,"lvl":4,"cnt":1},{"data":1000032,"lvl":7,"cnt":2},{"data":1000064,"lvl":1,"cnt":1},{"data":1000067,"lvl":2,"cnt":2},{"data":1000070,"lvl":6,"cnt":1},{"data":1000071,"lvl":7,"cnt":1},{"data":1000093,"lvl":1,"cnt":1}],"traps":[{"data":12000000,"lvl":8,"cnt":7},{"data":12000001,"lvl":5,"cnt":1},{"data":12000001,"lvl":7,"cnt":8},{"data":12000002,"lvl":6,"cnt":6},{"data":12000005,"lvl":6,"cnt":6},{"data":12000006,"lvl":3,"cnt":7},{"data":12000008,"lvl":4,"cnt":3},{"data":12000016,"lvl":3,"cnt":1}],"decos":[{"data":18000001,"cnt":4}],"obstacles":[{"data":8000007,"cnt":1}],"units":[{"data":4000000,"lvl":9},{"data":4000001,"lvl":9},{"data":4000002,"lvl":8},{"data":4000003,"lvl":9},{"data":4000004,"lvl":8},{"data":4000005,"lvl":8},{"data":4000006,"lvl":9},{"data":4000007,"lvl":5},{"data":4000008,"lvl":8},{"data":4000009,"lvl":8},{"data":4000010,"lvl":8},{"data":4000011,"lvl":9},{"data":4000012,"lvl":7},{"data":4000013,"lvl":9},{"data":4000015,"lvl":5},{"data":4000017,"lvl":5},{"data":4000022,"lvl":4},{"data":4000023,"lvl":6},{"data":4000024,"lvl":6},{"data":4000053,"lvl":2},{"data":4000058,"lvl":5},{"data":4000059,"lvl":3},{"data":4000065,"lvl":2},{"data":4000082,"lvl":3},{"data":4000097,"lvl":1,"timer":307029,"extra":true}],"siege_machines":[{"data":4000051,"lvl":3},{"data":4000052,"lvl":3},{"data":4000062,"lvl":3}],"heroes":[{"data":28000000,"lvl":67,"timer":49587},{"data":28000001,"lvl":65,"timer":251139},{"data":28000002,"lvl":40},{"data":28000004,"lvl":2,"timer":6340},{"data":28000006,"lvl":40,"timer":132339}],"spells":[{"data":26000000,"lvl":9},{"data":26000001,"lvl":7},{"data":26000002,"lvl":6},{"data":26000003,"lvl":3},{"data":26000005,"lvl":7},{"data":26000009,"lvl":6},{"data":26000010,"lvl":5},{"data":26000011,"lvl":5},{"data":26000016,"lvl":6},{"data":26000017,"lvl":6},{"data":26000028,"lvl":5},{"data":26000035,"lvl":3,"timer":119666},{"data":26000053,"lvl":1},{"data":26000070,"lvl":2}],"pets":[],"equipment":[{"data":90000000,"lvl":7},{"data":90000001,"lvl":8},{"data":90000002,"lvl":7},{"data":90000003,"lvl":9},{"data":90000004,"lvl":15},{"data":90000005,"lvl":9},{"data":90000006,"lvl":15},{"data":90000007,"lvl":1},{"data":90000008,"lvl":15},{"data":90000010,"lvl":18},{"data":90000011,"lvl":6},{"data":90000013,"lvl":18},{"data":90000014,"lvl":1},{"data":90000015,"lvl":12},{"data":90000016,"lvl":1},{"data":90000017,"lvl":15},{"data":90000019,"lvl":1},{"data":90000020,"lvl":15},{"data":90000022,"lvl":18},{"data":90000024,"lvl":15},{"data":90000032,"lvl":1},{"data":90000034,"lvl":15},{"data":90000035,"lvl":1},{"data":90000039,"lvl":18},{"data":90000040,"lvl":1},{"data":90000041,"lvl":1},{"data":90000042,"lvl":12},{"data":90000043,"lvl":15},{"data":90000044,"lvl":1},{"data":90000047,"lvl":1},{"data":90000048,"lvl":1},{"data":90000049,"lvl":18},{"data":90000050,"lvl":1},{"data":90000051,"lvl":1},{"data":90000052,"lvl":1},{"data":90000053,"lvl":1},{"data":90000057,"lvl":1},{"data":90000060,"lvl":1}],"house_parts":[82000000],"skins":[52000006],"sceneries":[60000082],"buildings2":[{"data":1000036,"lvl":9,"timer":170553},{"data":1000033,"lvl":1,"cnt":46},{"data":1000033,"lvl":6,"cnt":124},{"data":1000033,"lvl":7,"cnt":10},{"data":1000034,"lvl":10,"cnt":1},{"data":1000035,"lvl":9,"cnt":1},{"data":1000035,"lvl":10,"cnt":2},{"data":1000036,"lvl":9,"cnt":1},{"data":1000037,"lvl":1,"cnt":1},{"data":1000037,"lvl":6,"cnt":1},{"data":1000037,"lvl":7,"cnt":1},{"data":1000038,"lvl":8,"cnt":1},{"data":1000038,"lvl":9,"cnt":1},{"data":1000039,"lvl":10,"cnt":1},{"data":1000040,"lvl":10,"cnt":1},{"data":1000041,"lvl":1,"cnt":1},{"data":1000041,"lvl":6,"cnt":2},{"data":1000042,"lvl":1,"cnt":6},{"data":1000043,"lvl":5,"cnt":1},{"data":1000043,"lvl":6,"cnt":2},{"data":1000044,"lvl":5,"cnt":1},{"data":1000044,"lvl":6,"cnt":2},{"data":1000045,"lvl":9,"cnt":1},{"data":1000046,"lvl":10,"cnt":1},{"data":1000047,"lvl":1,"cnt":1},{"data":1000048,"lvl":6,"cnt":3},{"data":1000049,"lvl":1,"cnt":2},{"data":1000050,"lvl":1,"cnt":2},{"data":1000050,"lvl":2,"cnt":1},{"data":1000050,"lvl":6,"cnt":2},{"data":1000051,"lvl":6,"cnt":1},{"data":1000052,"lvl":1,"cnt":1},{"data":1000053,"lvl":1,"cnt":1},{"data":1000054,"lvl":6,"cnt":1},{"data":1000055,"lvl":5,"cnt":1},{"data":1000055,"lvl":6,"cnt":1},{"data":1000056,"lvl":7,"cnt":1},{"data":1000057,"lvl":1,"cnt":1},{"data":1000058,"lvl":10,"cnt":1},{"data":1000063,"lvl":1,"cnt":1},{"data":1000065,"lvl":5,"cnt":1},{"data":1000078,"lvl":6,"cnt":1},{"data":1000080,"lvl":1,"cnt":1},{"data":1000081,"lvl":1,"cnt":1},{"data":1000082,"lvl":5,"cnt":1}],"traps2":[{"data":12000010,"lvl":1,"cnt":3},{"data":12000010,"lvl":3,"cnt":3},{"data":12000011,"lvl":1,"cnt":1},{"data":12000011,"lvl":6,"cnt":4},{"data":12000013,"lvl":1,"cnt":1},{"data":12000013,"lvl":6,"cnt":5},{"data":12000014,"lvl":1,"cnt":2},{"data":12000014,"lvl":6,"cnt":1},{"data":12000014,"lvl":7,"cnt":1}],"units2":[{"data":4000031,"lvl":14},{"data":4000032,"lvl":13},{"data":4000033,"lvl":12},{"data":4000034,"lvl":18},{"data":4000035,"lvl":14},{"data":4000036,"lvl":13},{"data":4000037,"lvl":12},{"data":4000038,"lvl":11},{"data":4000041,"lvl":15},{"data":4000042,"lvl":20}],"heroes2":[{"data":28000003,"lvl":21},{"data":28000005,"lvl":24}],"boosts":{"clocktower_cooldown":3634}}';

  function refreshGob(){
    GOB_WORKER = $("vGobWorker").checked ? 1 : 0;
    GOB_LAB = $("vGobLab").checked ? 1 : 0;
    if(V){ renderMetrics(); renderTimeOverview(); saveToStorage(); }
  }

  function init(){
    bindLocalRevision();
    $("vJsonInput").addEventListener("input",function(){
      inputIsDirty();
      if(!INPUT_DIRTY&&PENDING_REVISION&&REVISION_READY)applyPendingRevision(false);
    });
    $("vSyncReload").addEventListener("click",function(){applyPendingRevision(true);});
    loadGame(function(){
      $("vParseBtn").addEventListener("click", function(){
        clearError();
        var text=$("vJsonInput").value.trim();
        if(!text){ showError("请先粘贴村庄 JSON 数据。"); return; }
        V=parseVillage(text); if(!V)return; SNAPSHOT_COVERAGE=null;
        TH=detectTH(V); BH=detectBH(V);
        computeTasks(); render(); markInputCommitted($("vJsonInput").value); PENDING_REVISION=null; clearSyncNotice();
      });
      $("vSampleBtn").addEventListener("click", function(){ $("vJsonInput").value=SAMPLE; inputIsDirty(); clearError(); });
      $("vClearBtn").addEventListener("click", function(){ $("vJsonInput").value=""; inputIsDirty(); clearError(); $("vResult").classList.remove("show"); });
      $("vGobWorker").addEventListener("change", refreshGob);
      $("vGobLab").addEventListener("change", refreshGob);
      REVISION_READY=true;
      // 若加载游戏数据期间用户已经开始输入，绝不再用旧存档覆盖文本框。
      if(PENDING_REVISION)applyPendingRevision(false);
      else if(!inputIsDirty())loadPersistedVillage({notice:false});
    });
  }
  if(typeof module==="object"&&module&&module.exports){
    module.exports={
      receiveLocalRevision:receiveLocalRevision,
      markInputCommitted:markInputCommitted,
      inputIsDirty:inputIsDirty,
      applyPendingRevision:applyPendingRevision,
      setRevisionReady:function(value){REVISION_READY=!!value;},
      state:function(){return{inputBaseline:INPUT_BASELINE,inputDirty:INPUT_DIRTY,pendingRevision:PENDING_REVISION,seenCount:SEEN_REVISION_ORDER.length};}
    };
  }else init();
})();
