/* ===== 天择网 · COC 升级规划器 · app.js ===== */
/* 单级拆分+前置依赖 · 稳本分层与常用配兵优先 · 缩放自适应日期 · 滑块指针拖动+拖出 */
(function () {
  "use strict";
  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value==null?"":value).replace(/[&<>"']/g,function(ch){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];}); }
  function uiGlyph(key){ return '<span data-ui-icon="'+key+'" aria-hidden="true"></span>'; }
  function fmtDur(sec){ sec=Math.max(0,Math.round(sec)); var d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60,p=[]; if(d)p.push(d+"天"); if(h)p.push(h+"时"); if(m)p.push(m+"分"); if(!p.length)p.push(s+"秒"); return p.join(""); }
  function num(v){ v=parseInt(v,10); return isNaN(v)?0:v; }

  var STORE = null;
  try { STORE = JSON.parse(localStorage.getItem("tz_coc_village")); } catch(e){}
  var PARTIAL = Boolean(STORE&&STORE.coverage&&STORE.coverage.buildings===false);
  var STATE = { mode:"steady", gobWorker:num(STORE&&STORE.gobWorker), gobLab:num(STORE&&STORE.gobLab), zoom:{home:1,bb:1} };
  var PLAN_STORAGE = window.CocPlannerStorage;
  var PRIORITY_ENGINE = window.CocPlannerPriority;
  var ARMY_CONFIG = PRIORITY_ENGINE ? PRIORITY_ENGINE.normalizeConfig(readJsonStorage(PRIORITY_ENGINE.STORAGE_KEY)) : {selectedGids:[]};
  var ARMY_SELECTED = PRIORITY_ENGINE ? PRIORITY_ENGINE.selectedLookup(ARMY_CONFIG) : Object.create(null);
  var PLAN_STATE = null;
  var PLAN_IDENTITY = null;
  var PERSIST_READY = false;
  var persistTimer = null;
  var staleNotice = "";
  var G=null, IDMAP={};
  // 玩家快照使用的稳定编号。APK 的 heroes/pets 表并不总是重复写 GlobalID，
  // 因此只在原始编号缺失时按本包英文名补索引；静态数值仍全部来自本站数据。
  var UNIT_ID_ALIASES={
    "28000007":"Dragon Duke",
    "73000000":"LASSI","73000001":"Mighty Yak","73000002":"Electro Owl","73000003":"Unicorn","73000004":"Phoenix",
    "73000007":"Poison Lizard","73000008":"Diggy","73000009":"Frosty","73000010":"Spirit Fox","73000011":"Angry Jelly","73000016":"Sneezy","73000017":"Crow"
  };
  var T0 = (STORE&&STORE.village&&STORE.village.timestamp) ? STORE.village.timestamp : Math.floor(Date.now()/1000);
  var TH = STORE?STORE.th:0, BH = STORE?STORE.bh:0;

  var HOME_LANES = [
    { key:"home_builder", label:"建筑工人", color:"#7c3aed" },
    { key:"home_lab",     label:"实验室",   color:"#3b82f6" },
    { key:"home_pet",     label:"战宠小屋", color:"#f59e0b" }
  ];
  var BB_LANES = [
    { key:"bb_builder", label:"建筑工人", color:"#8b5cf6" },
    { key:"bb_lab",     label:"星空实验室",   color:"#06b6d4" }
  ];
  var LAB_GID="1000007", TAVERN_GID="1000071", PETHOUSE_GID="1000068";

  function readJsonStorage(key){ try{return JSON.parse(localStorage.getItem(key)||"null");}catch(_error){return null;} }

  function nameOf(id){ var u=IDMAP[String(id)]; return u?u.chineseName:("ID"+id); }
  function unitOf(id){ return IDMAP[String(id)]||null; }
  function catOf(id){ var u=IDMAP[String(id)]; return u?u.category:""; }
  function buildTimeSec(r){ if(!r)return 0; return num(r.BuildTimeD)*86400+num(r.BuildTimeH)*3600+num(r.BuildTimeM)*60+num(r.BuildTimeS); }
  function upgradeTimeSec(r){ if(!r)return 0; return num(r.UpgradeTimeH)*3600+num(r.UpgradeTimeM)*60; }
  function thOf(r){ if(!r)return 99; var ks=["requiredTownHallLevel","RequiredTownHallLevel","TownHallLevel"]; for(var i=0;i<3;i++){ if(r[ks[i]]!=null)return num(r[ks[i]]); } return 99; }
  function maxLevelForTH(unit,th){ if(!unit||!unit.levels||!unit.levels.length)return 0; var m=0; unit.levels.forEach(function(r){ if(thOf(r)<=th&&num(r.level)>m)m=num(r.level); }); return m; }
  function laneKey(t){ return PLAN_STORAGE.laneForTask(t); }
  function isBuilderKey(k){ return k.indexOf("_builder")>0; }
  function workerCounts(){
    var b=(STORE&&STORE.baseWC)||{};
    if(PARTIAL)return {home_builder:1+STATE.gobWorker,home_lab:1+STATE.gobLab,home_pet:1,bb_builder:1,bb_lab:1};
    return { home_builder:(num(b.home_builder)||5)+STATE.gobWorker, home_lab:1+STATE.gobLab, home_pet:num(b.home_pet), bb_builder:(num(b.bb_builder)||5), bb_lab:1 };
  }
  function currentBuildingLvl(gid,world){ var arr=world==="bb"?(STORE.village.buildings2||[]):(STORE.village.buildings||[]); var l=0; arr.forEach(function(b){ if(String(b.data)===gid)l=Math.max(l,b.lvl); }); return l; }
  function superchargeLevelOf(item){
    var keys=["mini_level","mini_lvl","miniLevel","supercharge_level","superchargeLevel","supercharge"];
    for(var i=0;i<keys.length;i++){var value=item&&item[keys[i]];if(value!=null&&typeof value!=="object")return Math.max(0,num(value));}
    return 0;
  }
  function isRushExcluded(cat,name){ if(/防御建筑/.test(cat))return true; if(/陷阱/.test(cat))return true; if(/英雄/.test(cat))return true; if(/金矿|圣水收集器|暗黑重油钻井/.test(name))return true; if(/建筑工人小屋/.test(name))return true; return false; }
  function indexGameDataUnits(gameData){
    var map={},byEnglish={};
    (gameData&&gameData.units||[]).forEach(function(unit){var gid=String(unit&&unit.globalID||"").trim(),name=String(unit&&unit.englishName||"").trim().toLowerCase();if(gid)map[gid]=unit;if(name&&!byEnglish[name])byEnglish[name]=unit;});
    Object.keys(UNIT_ID_ALIASES).forEach(function(gid){if(!map[gid])map[gid]=byEnglish[UNIT_ID_ALIASES[gid].toLowerCase()]||null;});
    return map;
  }

  function buildTasks(){
    var tasks=[],taskMap={},taskByStep={},superchargeByStep={},dependents={},instanceCounts={},v=STORE.village;
    function stepKey(world,gid,inst,fromLvl,toLvl){ return world+"|"+gid+"|"+inst+"|"+fromLvl+"|"+toLvl; }
    function split(item,isBuilding,world){
      var unit=unitOf(item.data); if(!unit||!unit.levels||!unit.levels.length)return;
      var cur=item.lvl, maxL=maxLevelForTH(unit, world==="bb"?BH:TH);
      if(maxL<=0)return;
      var lmap={}; unit.levels.forEach(function(r){ lmap[num(r.level)]=r; });
      var cat=catOf(item.data);
      var cnt=Math.max(1,num(item.cnt)||1), countKey=world+"|"+item.data;
      var firstInst=instanceCounts[countKey]||0;
      instanceCounts[countKey]=firstInst+cnt;
      for(var offset=0;offset<cnt;offset++){
        var inst=firstInst+offset;
        var unitKey=world+"_"+item.data+"_"+inst;
        var taskName=nameOf(item.data)+((cnt>1||firstInst>0)?("#"+(inst+1)):"");
        for(var L=cur;L<maxL;L++){
          // 建筑建造时间记在目标级；兵种/法术/英雄等研究时间记在当前级。
          var toLvl=L+1, targetRow=lmap[toLvl],timeRow=isBuilding?targetRow:lmap[L]; if(!targetRow||!timeRow)continue;
          var locked=false, sec;
          if(num(item.timer)>0&&L===cur&&offset===0){ locked=true; sec=num(item.timer); } else { sec=isBuilding?buildTimeSec(timeRow):upgradeTimeSec(timeRow); }
          if(sec<=0&&!locked)continue;
          var reqLab=null, reqTavern=null;
          if(/兵|法术|攻城机器|战宠/.test(cat)) reqLab=num(targetRow.LaboratoryLevel);
          if(/英雄/.test(cat)) reqTavern=num(targetRow.RequiredHeroTavernLevel);
          var id=unitKey+"_"+L+"_"+toLvl;
          var t={id:id,unitKey:unitKey,gid:String(item.data),instance:inst,name:taskName,fromLvl:L,toLvl:toLvl,sec:sec,cat:cat,world:world,locked:locked,reqLab:reqLab,reqTavern:reqTavern,deps:[]};
          tasks.push(t); taskMap[id]=t; taskByStep[stepKey(world,String(item.data),inst,L,toLvl)]=t;
        }
        var supercharge=unit.supercharge,requiredTH=supercharge?num(supercharge.requiredTownHallLevel):99;
        if(isBuilding&&world==="home"&&supercharge&&Array.isArray(supercharge.levels)&&TH>=requiredTH){
          var miniMap={},miniMax=0,miniCur=superchargeLevelOf(item);
          supercharge.levels.forEach(function(row){var level=num(row&&row.level);if(level>0){miniMap[level]=row;miniMax=Math.max(miniMax,level);}});
          for(var mini=miniCur;mini<miniMax;mini++){
            var miniTo=mini+1,miniRow=miniMap[miniTo];if(!miniRow)continue;
            var miniLocked=num(item.timer)>0&&cur>=maxL&&mini===miniCur&&offset===0;
            var miniSec=miniLocked?num(item.timer):buildTimeSec(miniRow);if(miniSec<=0&&!miniLocked)continue;
            var miniId=unitKey+"_sc_"+mini+"_"+miniTo;
            var miniTask={id:miniId,unitKey:unitKey+"_sc",gid:String(item.data),instance:inst,name:taskName+" · 超级充能",fromLvl:mini,toLvl:miniTo,sec:miniSec,cat:cat,world:world,locked:miniLocked,isSupercharge:true,normalMaxLvl:maxL,reqLab:null,reqTavern:null,deps:[]};
            tasks.push(miniTask);taskMap[miniId]=miniTask;superchargeByStep[stepKey(world,String(item.data),inst,mini,miniTo)]=miniTask;
          }
        }
      }
    }
    (v.units||[]).forEach(function(it){split(it,false,"home");});
    (v.siege_machines||[]).forEach(function(it){split(it,false,"home");});
    (v.spells||[]).forEach(function(it){split(it,false,"home");});
    (v.heroes||[]).forEach(function(it){split(it,false,"home");});
    (v.pets||[]).forEach(function(it){split(it,false,"home");});
    (v.buildings||[]).forEach(function(it){split(it,true,"home");});
    (v.traps||[]).forEach(function(it){split(it,true,"home");});
    (v.units2||[]).forEach(function(it){split(it,false,"bb");});
    (v.heroes2||[]).forEach(function(it){split(it,false,"bb");});
    (v.buildings2||[]).forEach(function(it){split(it,true,"bb");});
    (v.traps2||[]).forEach(function(it){split(it,true,"bb");});
    tasks.forEach(function(t){
      var prev;
      if(t.isSupercharge){
        prev=superchargeByStep[stepKey(t.world,t.gid,t.instance,t.fromLvl-1,t.fromLvl)];
        if(!prev&&t.fromLvl===0&&t.normalMaxLvl>0)prev=taskByStep[stepKey(t.world,t.gid,t.instance,t.normalMaxLvl-1,t.normalMaxLvl)];
      }else prev=taskByStep[stepKey(t.world,t.gid,t.instance,t.fromLvl-1,t.fromLvl)];
      if(prev)t.deps.push(prev.id);
      if(t.reqLab){ var bg=/战宠/.test(t.cat)?PETHOUSE_GID:LAB_GID; var cb=currentBuildingLvl(bg,t.world); if(t.reqLab>cb){ var d=taskByStep[stepKey(t.world,bg,0,t.reqLab-1,t.reqLab)]; if(d)t.deps.push(d.id); } }
      if(t.reqTavern){ var ct=currentBuildingLvl(TAVERN_GID,"home"); if(t.reqTavern>ct){ var d2=taskByStep[stepKey("home",TAVERN_GID,0,t.reqTavern-1,t.reqTavern)]; if(d2)t.deps.push(d2.id); } }
      t.deps.forEach(function(dep){ (dependents[dep]||(dependents[dep]=[])).push(t.id); });
    });
    return {tasks:tasks, taskMap:taskMap, dependents:dependents};
  }
  function heroContention(){
    var heroes=(STORE&&STORE.village&&STORE.village.heroes)||[],seen=Object.create(null),count=0;
    heroes.forEach(function(hero){var gid=String(hero&&hero.data||"");if(gid&&!seen[gid]){seen[gid]=1;count++;}});
    var base=(STORE&&STORE.baseWC)||{},builders=PARTIAL?1:(num(base.home_builder)||5);
    return builders<count;
  }
  function priorityOptions(){return {mode:STATE.mode,laneForTask:laneKey,selected:ARMY_SELECTED,heroContention:heroContention()};}
  function sortCmp(a,b){
    if(PRIORITY_ENGINE)return PRIORITY_ENGINE.compareTasks(a,b,priorityOptions());
    return a.sec-b.sec;
  }
  function strictBuilderPhase(task){
    if(!PRIORITY_ENGINE||STATE.mode!=="steady"||laneKey(task)!=="home_builder")return null;
    return PRIORITY_ENGINE.tupleForTask(task,priorityOptions())[0];
  }
  function taskCmp(a,b){ var c=sortCmp(a,b); if(c)return c; return a.id<b.id?-1:(a.id>b.id?1:0); }
  // Kahn 邻接表 + 最小堆：避免旧实现每弹出一个节点都扫描全部任务并重排整个队列。
  function TaskHeap(cmp){ this.items=[]; this.cmp=cmp; }
  TaskHeap.prototype.push=function(item){ var a=this.items,i=a.length;a.push(item);while(i>0){var p=(i-1)>>1;if(this.cmp(a[p],item)<=0)break;a[i]=a[p];i=p;}a[i]=item; };
  TaskHeap.prototype.pop=function(){ var a=this.items;if(!a.length)return null;var first=a[0],last=a.pop();if(a.length){var i=0;while(true){var l=i*2+1;if(l>=a.length)break;var r=l+1,c=r<a.length&&this.cmp(a[r],a[l])<0?r:l;if(this.cmp(last,a[c])<=0)break;a[i]=a[c];i=c;}a[i]=last;}return first; };
  function topoSort(tasks,dependents){
    var selected={},indegree={},emitted={},heap=new TaskHeap(taskCmp),ordered=[];
    tasks.forEach(function(t){selected[t.id]=1;});
    tasks.forEach(function(t){var n=0;t.deps.forEach(function(dep){if(selected[dep])n++;});indegree[t.id]=n;if(!n)heap.push(t);});
    while(heap.items.length){
      var t=heap.pop();if(emitted[t.id])continue;emitted[t.id]=1;ordered.push(t);
      (dependents[t.id]||[]).forEach(function(id){if(!selected[id]||emitted[id])return;indegree[id]--;if(indegree[id]===0)heap.push(BUILD.taskMap[id]);});
    }
    // 数据异常形成环时仍把剩余任务交给排程器；scheduleWithDeps 自身还有访问集保护。
    if(ordered.length<tasks.length)tasks.filter(function(t){return !emitted[t.id];}).sort(taskCmp).forEach(function(t){ordered.push(t);});
    return ordered;
  }

  function Planner(world,opts){
    this.world=world; this.lanes=opts.lanes;
    this.svgId=opts.svgId; this.wrapId=opts.wrapId; this.pendingGridId=opts.pendingGridId; this.pendingCountId=opts.pendingCountId;
    this.infoId=opts.infoId; this.statsId=opts.statsId; this.zoomLabelId=opts.zoomLabelId;
    this.planned={}; this.planList=[]; this._slotPlans={}; this._slotEnds={}; this._drag=null;
  }
  // 每个资源槽维护有序区间和结束时间；自动排程 O(槽数)，手工插入才扫描该槽自身区间。
  Planner.prototype.slotKey=function(lane,slot){return lane+"|"+slot;};
  Planner.prototype.indexPlan=function(p){
    var key=this.slotKey(p.lane,p.slot),arr=this._slotPlans[key]||(this._slotPlans[key]=[]),lo=0,hi=arr.length;
    while(lo<hi){var mid=(lo+hi)>>1;if(arr[mid].start<=p.start)lo=mid+1;else hi=mid;}arr.splice(lo,0,p);
    this._slotEnds[key]=Math.max(this._slotEnds[key]||0,p.start+p.dur);
  };
  Planner.prototype.addPlan=function(p){if(this.planned[p.id])return this.planned[p.id];this.planned[p.id]=p;this.planList.push(p);this.indexPlan(p);return p;};
  Planner.prototype.rebuildPlanIndex=function(){var self=this;this._slotPlans={};this._slotEnds={};this.planList.forEach(function(p){self.indexPlan(p);});};
  Planner.prototype.resetPlan=function(){this.planned={};this.planList=[];this._slotPlans={};this._slotEnds={};};
  Planner.prototype.loadPlan=function(list){
    this.resetPlan();
    var self=this,cleaned=PLAN_STORAGE.cleanPlan(list,BUILD.taskMap,this.world,this.slots(),function(task){return !(STATE.mode==="rush"&&isRushExcluded(task.cat,task.name));});
    cleaned.forEach(function(entry){self.addPlan(entry);});
    this.redraw();
  };
  Planner.prototype.slots=function(){ var wc=workerCounts(),s={}; this.lanes.forEach(function(l){s[l.key]=wc[l.key]||0;}); return s; };
  Planner.prototype.activeLanes=function(){ var s=this.slots(); return this.lanes.filter(function(l){return (s[l.key]||0)>0;}); };
  Planner.prototype.allTasks=function(){ var all=BUILD.tasks.filter(function(t){return t.world===this.world;},this); if(STATE.mode==="rush")all=all.filter(function(t){return !isRushExcluded(t.cat,t.name);}); return all; };
  Planner.prototype.unplanned=function(){ var self=this; return this.allTasks().filter(function(t){return !self.planned[t.id];}).sort(sortCmp); };
  Planner.prototype.placeInLane=function(lane,earliest,dur){ var slots=this.slots()[lane]||0;if(slots<=0)return null;var best=null;for(var s=0;s<slots;s++){var stasks=this._slotPlans[this.slotKey(lane,s)]||[],t0=earliest;for(var i=0;i<stasks.length;i++){var p=stasks[i];if(t0+dur<=p.start)break;t0=Math.max(t0,p.start+p.dur);}if(best===null||t0<best.start)best={slot:s,start:t0};}return best; };
  Planner.prototype.placeAtLaneEnd=function(lane,earliest){var slots=this.slots()[lane]||0;if(slots<=0)return null;var best=null;for(var s=0;s<slots;s++){var start=Math.max(earliest,this._slotEnds[this.slotKey(lane,s)]||0);if(best===null||start<best.start)best={slot:s,start:start};}return best;};
  Planner.prototype.depEnd=function(t){ var end=0,self=this; t.deps.forEach(function(did){ var p=self.planned[did]; if(p)end=Math.max(end,p.start+p.dur); }); return end; };
  Planner.prototype.scheduleWithDeps=function(t,appendOnly,visiting,notBefore){
    if(this.planned[t.id])return;visiting=visiting||{};if(visiting[t.id])return;visiting[t.id]=1;
    var self=this;t.deps.forEach(function(did){var dt=BUILD.taskMap[did];if(dt&&!self.planned[did]&&dt.world===self.world)self.scheduleWithDeps(dt,appendOnly,visiting);});
    delete visiting[t.id];if(this.planned[t.id])return;
    var lane=laneKey(t),entry;
    if(t.locked){var pl=this.placeInLane(lane,0,t.sec);entry={id:t.id,start:0,dur:t.sec,lane:lane,slot:pl?pl.slot:0,locked:true};}
    else{var earliest=Math.max(this.depEnd(t),Math.max(0,Number(notBefore)||0)),pl2=appendOnly?this.placeAtLaneEnd(lane,earliest):this.placeInLane(lane,earliest,t.sec);entry={id:t.id,start:pl2?pl2.start:earliest,dur:t.sec,lane:lane,slot:pl2?pl2.slot:0,locked:false};}
    this.addPlan(entry);
  };
  Planner.prototype.removeWithDeps=function(tid){
    var stack=[tid],remove={};
    while(stack.length){var id=stack.pop(),entry=this.planned[id];if(!entry||entry.locked||remove[id])continue;remove[id]=1;(BUILD.dependents[id]||[]).forEach(function(next){stack.push(next);});}
    if(!Object.keys(remove).length)return;Object.keys(remove).forEach(function(id){delete this.planned[id];},this);this.planList=this.planList.filter(function(p){return !remove[p.id];});this.rebuildPlanIndex();
  };

  /* 稳本排程：进行中任务先占槽，其余按建筑分层、常用配兵与时长做拓扑贪心。 */
  Planner.prototype.autoFill=function(){
    this.resetPlan();
    var all=this.allTasks(), self=this,phaseEnds={};
    function noteNewPlans(fromIndex){
      for(var i=fromIndex;i<self.planList.length;i++){
        var plan=self.planList[i],task=BUILD.taskMap[plan.id],phase=strictBuilderPhase(task);
        if(phase!=null)phaseEnds[phase]=Math.max(phaseEnds[phase]||0,plan.start+plan.dur);
      }
    }
    function lowerPhaseEnd(phase){var end=0;Object.keys(phaseEnds).forEach(function(key){if(Number(key)<phase)end=Math.max(end,phaseEnds[key]);});return end;}
    // 1. 游戏内正在进行的任务必须保持从零时刻占用对应槽位。
    all.filter(function(t){return t.locked;}).sort(taskCmp).forEach(function(t){
      if(self.planned[t.id])return;
      var before=self.planList.length,pl=self.placeInLane(laneKey(t),0,t.sec),slot=pl?pl.slot:0;
      self.addPlan({id:t.id,start:0,dur:t.sec,lane:laneKey(t),slot:slot,locked:true});
      noteNewPlans(before);
    });
    // 2. 所有未进行任务按固定优先级排队；稳本建筑采用严格阶段门禁，低档不得早于高档全部结束。
    var others=all.filter(function(t){return !self.planned[t.id]&&!t.locked;});
    topoSort(others,BUILD.dependents).forEach(function(t){
      if(self.planned[t.id])return;
      var before=self.planList.length,phase=strictBuilderPhase(t),floor=phase==null?0:lowerPhaseEnd(phase);
      self.scheduleWithDeps(t,true,null,floor);noteNewPlans(before);
    });
    this.redraw();
  };
  Planner.prototype.clearPlan=function(){ var self=this; Object.keys(this.planned).forEach(function(id){ if(!self.planned[id].locked)delete self.planned[id]; }); this.planList=this.planList.filter(function(p){return p.locked;});this.rebuildPlanIndex();this.redraw(); };
  Planner.prototype.redraw=function(){ this.drawGantt(); this.drawPending(); this.updateInfo(); schedulePersist(); };
  Planner.prototype.updateInfo=function(){ var end=this.planList.reduce(function(m,p){return Math.max(m,p.start+p.dur);},0); $(this.infoId).textContent="已规划 "+this.planList.length+" 项 · 总跨度 "+fmtDur(end); var byLane={}; this.planList.forEach(function(p){byLane[p.lane]=(byLane[p.lane]||0)+1;}); var stxt="",self=this,s=this.slots(); this.activeLanes().forEach(function(l){ stxt+='<span class="vps">'+l.label+'('+s[l.key]+'槽)：'+(byLane[l.lane]||byLane[l.key]||0)+'项</span>'; }); stxt+='<span class="vps">总时长：'+fmtDur(end)+'</span>'; $(this.statsId).innerHTML=stxt; };

  Planner.prototype.drawGantt=function(){
    var zoom=STATE.zoom[this.world], svg=$(this.svgId), lanes=this.activeLanes(), rowH=30, labelW=130, padL=labelW+10, padR=20, padT=34;
    var slots=this.slots(), laneRows=[], totalRows=0;
    lanes.forEach(function(l){ var n=Math.max(slots[l.key]||0,1); laneRows.push({lane:l,rows:n}); totalRows+=n; });
    var end=this.planList.reduce(function(m,p){return Math.max(m,p.start+p.dur);},0);
    var span=Math.max(end,86400), daySec=86400, days=Math.ceil(span/daySec)+1;
    var baseW=1000, svgW=baseW*zoom, chartW=svgW-padL-padR, pxPerSec=chartW/(days*daySec);
    var H=padT+totalRows*rowH+20;
    svg.setAttribute("viewBox","0 0 "+svgW+" "+H); svg.setAttribute("width",svgW);
    var laneStartY={},yC=padT;
    lanes.forEach(function(l,i){ laneStartY[l.key]=yC; yC+=laneRows[i].rows*rowH; });
    var s="";
    // 日期间隔随缩放自适应
    var dayPx=chartW/days, step=1;
    if(dayPx<70){ step=Math.ceil(70/dayPx); if(step<=3); else if(step<=6)step=7; else if(step<=13)step=14; else if(step<=29)step=30; else step=60; }
    for(var d=0;d<=days;d+=step){ var x=padL+d*daySec*pxPerSec; if(x>svgW)break; var dt=new Date((T0+d*daySec)*1000); var lbl=(dt.getMonth()+1)+"/"+dt.getDate(); s+='<line class="vg-grid" x1="'+x+'" y1="'+padT+'" x2="'+x+'" y2="'+(padT+totalRows*rowH)+'"/>'; s+='<text class="vg-axis" x="'+x+'" y="'+(padT-10)+'" text-anchor="middle">'+lbl+'</text>'; }
    lanes.forEach(function(l,i){ var n=laneRows[i].rows,y0=laneStartY[l.key]; s+='<rect x="0" y="'+y0+'" width="'+svgW+'" height="'+(n*rowH)+'" fill="'+(i%2?'rgba(255,255,255,0.015)':'transparent')+'"/>'; s+='<text class="vg-lane-label" x="10" y="'+(y0+12)+'" dominant-baseline="central">'+l.label+'('+slots[l.key]+'槽)</text>'; for(var r=0;r<n;r++)s+='<line class="vg-grid" x1="'+padL+'" y1="'+(y0+(r+1)*rowH)+'" x2="'+svgW+'" y2="'+(y0+(r+1)*rowH)+'"/>'; });
    var laneColor={}; lanes.forEach(function(l){laneColor[l.key]=l.color;});
    var self=this;
    this.planList.forEach(function(p){ var t=BUILD.taskMap[p.id]; if(!t)return; var y0=laneStartY[p.lane]; if(y0==null)return; var y=y0+p.slot*rowH+4, x=padL+p.start*pxPerSec, w=Math.max(p.dur*pxPerSec,3); var col=laneColor[p.lane]||"#7c3aed"; if(p.locked)col="#64748b"; var barLabel=t.name+" "+t.fromLvl+"到"+t.toLvl+(p.locked?"，升级进行中":"，拖动或用左右方向键调整，按 Enter 或 Delete 移回待规划区"); s+='<g class="vg-bar" data-tid="'+p.id+'" role="button" tabindex="'+(p.locked?'-1':'0')+'" aria-label="'+barLabel+'"'+(p.locked?' aria-disabled="true"':' aria-keyshortcuts="ArrowLeft ArrowRight Enter Delete"')+'><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+(rowH-8)+'" rx="4" fill="'+col+'"'+(p.locked?' stroke="#fbbf24" stroke-width="1.5"':'')+'/>'; var lbl=t.name; if(lbl.length>7)lbl=lbl.slice(0,6)+"…"; if(w>40)s+='<text x="'+(x+4)+'" y="'+(y+(rowH-8)/2)+'" dominant-baseline="central">'+lbl+' '+t.fromLvl+'→'+t.toLvl+'</text>'; if(p.locked&&w>24)s+='<foreignObject x="'+(x+w-18)+'" y="'+(y+2)+'" width="16" height="16"><span xmlns="http://www.w3.org/1999/xhtml" data-ui-icon="key" aria-hidden="true" style="display:grid;place-items:center;width:16px;height:16px;font-size:12px"></span></foreignObject>'; s+='</g>'; });
    svg.innerHTML=s;
    svg.querySelectorAll(".vg-bar").forEach(function(g){
      var tid=g.getAttribute("data-tid"),p=self.planned[tid];
      if(!p||p.locked)return;
      g.addEventListener("pointerdown",function(e){ self.onBarDown(e); });
      g.addEventListener("keydown",function(e){
        if(e.key==="Delete"||e.key==="Backspace"||e.key==="Enter"||e.key===" "){
          e.preventDefault();
          self.removeWithDeps(tid);
          self.redraw();
          $(self.pendingGridId).focus();
          return;
        }
        if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
        e.preventDefault();
        var step=e.shiftKey?86400:3600;
        p.start=self.snapValid(p,Math.max(0,p.start+(e.key==="ArrowRight"?step:-step)));
        self.rebuildPlanIndex();
        self.redraw();
        self.focusBar(tid);
      });
    });
  };
  Planner.prototype.svgPoint=function(svg,e){ var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  Planner.prototype.focusBar=function(tid){ var bars=$(this.svgId).querySelectorAll(".vg-bar"); for(var i=0;i<bars.length;i++){ if(bars[i].getAttribute("data-tid")===tid){ bars[i].focus(); return; } } };
  Planner.prototype.stopBarTracking=function(d){
    window.removeEventListener("pointermove",this._move);
    window.removeEventListener("pointerup",this._up);
    window.removeEventListener("pointercancel",this._cancel);
    if(d&&d.captureTarget&&d.captureTarget.releasePointerCapture){
      try{ if(d.captureTarget.hasPointerCapture(d.pointerId))d.captureTarget.releasePointerCapture(d.pointerId); }catch(err){}
    }
    this._move=null; this._up=null; this._cancel=null;
  };
  Planner.prototype.onBarDown=function(e){
    if((e.button!=null&&e.button!==0)||e.isPrimary===false)return;
    e.preventDefault();
    var g=e.currentTarget, tid=g.getAttribute("data-tid"), p=this.planned[tid];
    if(!p||p.locked)return;
    var svg=$(this.svgId), pt=this.svgPoint(svg,e);
    this._drag={tid:tid,p:p,svg:svg,ptStart:pt,start0:p.start,newStart:p.start,pointerId:e.pointerId,captureTarget:g};
    if(g.setPointerCapture){ try{ g.setPointerCapture(e.pointerId); }catch(err){} }
    var self=this;
    this._move=function(ev){ self.onBarMove(ev); };
    this._up=function(ev){ self.onBarUp(ev); };
    this._cancel=function(ev){ self.onBarCancel(ev); };
    window.addEventListener("pointermove",this._move,{passive:false});
    window.addEventListener("pointerup",this._up);
    window.addEventListener("pointercancel",this._cancel);
  };
  Planner.prototype.onBarMove=function(e){
    var d=this._drag;
    if(!d||(e.pointerId!=null&&e.pointerId!==d.pointerId))return;
    e.preventDefault();
    var pt=this.svgPoint(d.svg,e), dx=pt.x-d.ptStart.x;
    var baseW=1000,zoom=STATE.zoom[this.world],padL=140,padR=20,svgW=baseW*zoom,chartW=svgW-padL-padR;
    var end=this.planList.reduce(function(m,p){return Math.max(m,p.start+p.dur);},0);
    var days=Math.ceil(Math.max(end,86400)/86400)+1;
    var pxPerSec=chartW/(days*86400), dsec=dx/pxPerSec;
    d.newStart=Math.max(0,d.start0+dsec);
    var g=d.svg.querySelector('.vg-bar[data-tid="'+d.tid+'"]');
    if(g)g.setAttribute("transform","translate("+dx+" 0)");
  };
  Planner.prototype.onBarUp=function(e){
    var d=this._drag;
    if(!d||(e.pointerId!=null&&e.pointerId!==d.pointerId))return;
    this.stopBarTracking(d);
    this._drag=null; // 判断是否拖到待规划区
    var pend=$(this.pendingGridId).parentElement, rect=pend.getBoundingClientRect();
    if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){ this.removeWithDeps(d.tid); }
    else { d.p.start=this.snapValid(d.p,d.newStart!=null?d.newStart:d.p.start); this.rebuildPlanIndex(); }
    this.redraw();
  };
  Planner.prototype.onBarCancel=function(e){
    var d=this._drag;
    if(!d||(e.pointerId!=null&&e.pointerId!==d.pointerId))return;
    this.stopBarTracking(d);
    this._drag=null;
    this.drawGantt();
  };
  Planner.prototype.snapValid=function(p,newStart){ var task=BUILD.taskMap[p.id],depMin=task?this.depEnd(task):0,t=Math.max(depMin,newStart||0),laneTasks=this._slotPlans[this.slotKey(p.lane,p.slot)]||[];for(var i=0;i<laneTasks.length;i++){var q=laneTasks[i];if(q.id===p.id)continue;if(t+p.dur<=q.start)return t;if(t<q.start+q.dur)t=q.start+q.dur;}return t; };
  Planner.prototype.drawPending=function(){ var self=this,grid=$(this.pendingGridId); var up=this.unplanned(); $(this.pendingCountId).textContent=up.length+" 项"; grid.setAttribute("tabindex","-1"); if(!up.length){ grid.innerHTML='<div class="vp-pending-empty">全部任务已安排</div>'; return; } var h=""; up.forEach(function(t){ var lockTag=t.locked?' '+uiGlyph("key"):''; var lockLabel=t.locked?'，升级进行中':''; h+='<button type="button" class="vp-pending-item" draggable="true" data-tid="'+t.id+'" aria-label="安排 '+t.name+' '+t.fromLvl+' 到 '+t.toLvl+' 级'+lockLabel+'">'+t.name+' '+t.fromLvl+'→'+t.toLvl+' · '+fmtDur(t.sec)+lockTag+'</button>'; }); grid.innerHTML=h; grid.querySelectorAll(".vp-pending-item").forEach(function(el){ el.addEventListener("click",function(){ var t=BUILD.taskMap[el.getAttribute("data-tid")]; if(t){ self.scheduleWithDeps(t); self.redraw(); } }); el.addEventListener("dragstart",function(e){ e.dataTransfer.setData("text/plain","add:"+el.getAttribute("data-tid")); e.dataTransfer.effectAllowed="move"; el.classList.add("dragging"); }); el.addEventListener("dragend",function(){ el.classList.remove("dragging"); }); }); };

  var BUILD=null, homeP=null, bbP=null;

  function fmtDateTime(ms){
    if(!ms)return "尚未保存";
    try{return new Date(ms).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});}
    catch(e){return new Date(ms).toLocaleString();}
  }
  function capturePlanner(planner){ return PLAN_STORAGE.clonePlan(planner&&planner.planList); }
  function captureCurrentMode(){
    if(!PLAN_STATE||!homeP||!bbP)return null;
    var snapshot={home:capturePlanner(homeP),bb:capturePlanner(bbP),updatedAt:Date.now()};
    PLAN_STATE.modes[STATE.mode]=snapshot;
    PLAN_STATE.activeMode=STATE.mode;
    PLAN_STATE.updatedAt=snapshot.updatedAt;
    return snapshot;
  }
  function savePlanState(options){
    options=options||{};
    if(!PLAN_STATE)return false;
    if(options.capture!==false)captureCurrentMode();
    try{
      localStorage.setItem(PLAN_STORAGE.STORAGE_KEY,JSON.stringify(PLAN_STATE));
      if(options.announce)setSnapshotStatus(options.announce,"ok");
      renderComparison();
      return true;
    }catch(e){
      setSnapshotStatus("方案保存失败："+(e&&e.message?e.message:"浏览器存储不可用"),"error");
      return false;
    }
  }
  function schedulePersist(){
    if(!PERSIST_READY)return;
    if(persistTimer)clearTimeout(persistTimer);
    persistTimer=setTimeout(function(){persistTimer=null;savePlanState();},250);
  }
  function setSnapshotStatus(message,tone){
    var el=$("vpSnapshotStatus");if(!el)return;
    el.textContent=message||"";
    el.classList.toggle("is-warning",tone==="warning");
    el.classList.toggle("is-error",tone==="error");
  }
  function renderComparison(){
    var root=$("vpCompare");if(!root||!PLAN_STATE)return;
    PLAN_STORAGE.MODES.forEach(function(mode){
      var card=root.querySelector('[data-compare-mode="'+mode+'"]');if(!card)return;
      var snap=PLAN_STATE.modes[mode],m=PLAN_STORAGE.planMetrics(snap||{});
      card.classList.toggle("active",mode===STATE.mode);
      var label=mode==="steady"?"稳本方案":"速本方案";
      card.querySelector("span").textContent=label+(mode===STATE.mode?" · 当前":"");
      card.querySelector("b").textContent=snap?(m.tasks+" 项"):"未建立";
      card.querySelector("small").textContent=snap?
        ("家乡村庄 "+fmtDur(m.homeSpan)+" · 建筑大师基地 "+fmtDur(m.bbSpan)+" · "+fmtDateTime(snap.updatedAt)):
        "切换到该模式后可重建或复制当前方案";
    });
  }
  function sanitizeModeSnapshot(mode){
    var snap=PLAN_STATE&&PLAN_STATE.modes&&PLAN_STATE.modes[mode];
    if(!snap)return null;
    var allowed=function(task){return !(mode==="rush"&&isRushExcluded(task.cat,task.name));};
    var clean={
      home:PLAN_STORAGE.cleanPlan(snap.home,BUILD.taskMap,"home",homeP.slots(),allowed),
      bb:PLAN_STORAGE.cleanPlan(snap.bb,BUILD.taskMap,"bb",bbP.slots(),allowed),
      updatedAt:num(snap.updatedAt)||Date.now()
    };
    PLAN_STATE.modes[mode]=clean;
    return clean;
  }
  function applySnapshot(mode){
    var snap=sanitizeModeSnapshot(mode);
    if(!snap)return false;
    PERSIST_READY=false;
    homeP.loadPlan(snap.home);
    bbP.loadPlan(snap.bb);
    PERSIST_READY=true;
    renderComparison();
    return true;
  }
  function rebuildMode(mode){
    var previous=STATE.mode;
    STATE.mode=mode;
    PERSIST_READY=false;
    homeP.autoFill();bbP.autoFill();
    captureCurrentMode();
    STATE.mode=previous;
  }
  function rebuildBothModes(reason){
    var active=STATE.mode;
    rebuildMode("steady");
    rebuildMode("rush");
    STATE.mode=active;
    applySnapshot(active);
    savePlanState({capture:false});
    setSnapshotStatus(reason||"稳本与速本方案已按当前村庄数据重建。",staleNotice?"warning":"ok");
  }
  function switchMode(mode){
    if(PLAN_STORAGE.MODES.indexOf(mode)<0||mode===STATE.mode)return;
    savePlanState();
    STATE.mode=mode;
    document.querySelectorAll(".vp-mode-btn").forEach(function(btn){var active=btn.getAttribute("data-mode")===mode;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));});
    $("vpModeDesc").textContent=modeDesc();
    if(!applySnapshot(mode)){
      PERSIST_READY=false;homeP.autoFill();bbP.autoFill();PERSIST_READY=true;savePlanState();
    }else savePlanState();
    setSnapshotStatus((mode==="steady"?"稳本":"速本")+"方案已载入。",staleNotice?"warning":"ok");
  }
  function copyToOtherMode(){
    savePlanState();
    var source=PLAN_STATE.modes[STATE.mode],target=STATE.mode==="steady"?"rush":"steady";
    if(!source)return;
    function allowed(entry){var t=BUILD.taskMap[entry.id];return t&&!(target==="rush"&&isRushExcluded(t.cat,t.name));}
    PLAN_STATE.modes[target]={home:PLAN_STORAGE.clonePlan(source.home).filter(allowed),bb:PLAN_STORAGE.clonePlan(source.bb).filter(allowed),updatedAt:Date.now()};
    savePlanState({capture:false,announce:"已把当前方案复制到"+(target==="steady"?"稳本":"速本")+"槽位；仅保留目标模式允许的任务。"});
  }
  function downloadText(name,text,type){
    var blob=new Blob([text],{type:type||"application/octet-stream"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function exportCurrentJson(){
    savePlanState();
    try{downloadText("COC-"+(STATE.mode==="steady"?"稳本":"速本")+"方案.json",PLAN_STORAGE.exportJson(PLAN_STATE,STATE.mode,BUILD.taskMap),"application/json;charset=utf-8");setSnapshotStatus("当前方案 JSON 已导出。","ok");}
    catch(e){setSnapshotStatus("导出失败："+e.message,"error");}
  }
  function exportCurrentIcs(){
    savePlanState();
    try{downloadText("COC-"+(STATE.mode==="steady"?"稳本":"速本")+"方案.ics",PLAN_STORAGE.exportIcs(PLAN_STATE,STATE.mode,BUILD.taskMap,T0),"text/calendar;charset=utf-8");setSnapshotStatus("当前方案日历已导出，可导入系统日历。","ok");}
    catch(e){setSnapshotStatus("导出失败："+e.message,"error");}
  }
  function setupSnapshotActions(){
    $("vpSavePlan").addEventListener("click",function(){savePlanState({announce:"当前"+(STATE.mode==="steady"?"稳本":"速本")+"方案已保存。"});});
    $("vpRebuildPlan").addEventListener("click",function(){PERSIST_READY=false;homeP.autoFill();bbP.autoFill();PERSIST_READY=true;savePlanState({announce:"当前方案已按固定"+(STATE.mode==="steady"?"稳本":"速本")+"规则重建。"});});
    $("vpCopyPlan").addEventListener("click",copyToOtherMode);
    $("vpExportJson").addEventListener("click",exportCurrentJson);
    $("vpExportIcs").addEventListener("click",exportCurrentIcs);
  }
  function modeDesc(){
    var prefix=PARTIAL?"当前是官方接口公开资料的部分规划：只包含接口实际返回的单位，不推断缺失建筑；家乡村庄与建筑大师基地暂按各 1 名建筑工人，实验室、星空实验室和战宠小屋各按 1 个升级栏位估算。":"";
    if(STATE.mode==="steady")return prefix+"稳本模式：严格依次完成实验室、第一档建筑、第二档防御、英雄和其它；上一阶段全部结束后才进入下一阶段，同档由多名建筑工人按时间短→长分配。超级充能跟随所属建筑的优先档。实验室与战宠小屋先排常用配兵，莱希和大牦固定最后。";
    return prefix+"速本模式：忽略防御建筑、建筑工人小屋升级、陷阱、资源采集器与英雄，集中资源冲大本营。";
  }

  function priorityGroup(unit){
    var cat=String(unit&&unit.category||"");
    if(/战宠/.test(cat))return "战宠";
    if(/英雄/.test(cat))return "英雄";
    if(/法术/.test(cat))return "法术";
    if(/兵|攻城机器/.test(cat))return "兵种与攻城机器";
    return "";
  }
  function availablePriorityUnits(){
    var village=STORE&&STORE.village||{},seen=Object.create(null),result=[];
    ["units","siege_machines","spells","heroes","pets","units2","heroes2"].forEach(function(key){
      (village[key]||[]).forEach(function(item){
        var gid=String(item&&item.data||""),unit=IDMAP[gid],group=priorityGroup(unit);
        if(!gid||!unit||!group||seen[gid])return;
        seen[gid]=1;result.push({gid:gid,name:unit.chineseName||unit.englishName||("ID"+gid),group:group});
      });
    });
    return result.sort(function(a,b){var groups=["兵种与攻城机器","法术","英雄","战宠"],g=groups.indexOf(a.group)-groups.indexOf(b.group);return g||a.name.localeCompare(b.name,"zh-CN");});
  }
  function renderArmyPriority(){
    var root=$('vpArmyGroups');if(!root||!PRIORITY_ENGINE)return;
    var groups={},units=availablePriorityUnits();
    units.forEach(function(unit){(groups[unit.group]||(groups[unit.group]=[])).push(unit);});
    root.innerHTML=["兵种与攻城机器","法术","英雄","战宠"].map(function(group){
      var list=groups[group]||[];
      return '<section class="vp-army-group"><h3>'+esc(group)+'</h3><div class="vp-army-options">'+(list.length?list.map(function(unit){return '<label class="vp-army-choice"><input type="checkbox" data-army-gid="'+unit.gid+'"'+(ARMY_SELECTED[unit.gid]?' checked':'')+'> '+esc(unit.name)+'</label>';}).join(''):'<span class="vp-army-summary">当前存档没有已解锁项目</span>')+'</div></section>';
    }).join('');
    updateArmySummary();
  }
  function selectedFromForm(){
    return Array.prototype.map.call(document.querySelectorAll('[data-army-gid]:checked'),function(input){return input.getAttribute('data-army-gid');});
  }
  function updateArmySummary(){
    var summary=$('vpArmySummary');if(!summary)return;
    var count=selectedFromForm().length,heroes=((STORE&&STORE.village&&STORE.village.heroes)||[]).reduce(function(map,item){map[String(item.data)]=1;return map;},{}),heroCount=Object.keys(heroes).length,builders=PARTIAL?1:(num(STORE&&STORE.baseWC&&STORE.baseWC.home_builder)||5);
    summary.textContent='已选 '+count+' 项 · '+(PARTIAL?'官方资料不含工人数，暂按 1 名估算；':'')+(builders<heroCount?'工人数少于 '+heroCount+' 名已解锁英雄，常用英雄优先':'当前工人数不少于已解锁英雄数，英雄按同档时长分配');
  }
  function setArmyStatus(message,kind){var el=$('vpArmyStatus');if(el){el.textContent=message||'';el.dataset.kind=kind||'';}}
  function persistArmySelection(source,message){
    ARMY_CONFIG=PRIORITY_ENGINE.normalizeConfig({selectedGids:selectedFromForm(),source:source||'custom',updatedAt:Date.now()});
    ARMY_SELECTED=PRIORITY_ENGINE.selectedLookup(ARMY_CONFIG);
    try{localStorage.setItem(PRIORITY_ENGINE.STORAGE_KEY,JSON.stringify(ARMY_CONFIG));}catch(error){setArmyStatus('保存失败：'+error.message,'error');return;}
    if(PLAN_IDENTITY){PLAN_IDENTITY.priorityFingerprint=PRIORITY_ENGINE.fingerprint(ARMY_CONFIG);PLAN_STATE.priorityFingerprint=PLAN_IDENTITY.priorityFingerprint;}
    rebuildBothModes(message||'常用配兵已保存，两套方案已按新优先级重建。');
    updateArmySummary();setArmyStatus(message||'常用配兵已保存，排程已重建。','ok');
  }
  function setupArmyPriority(){
    if(!PRIORITY_ENGINE){setArmyStatus('配兵优先级模块加载失败，请刷新页面。','error');return;}
    renderArmyPriority();
    $('vpArmyGroups').addEventListener('change',updateArmySummary);
    $('vpApplyArmy').addEventListener('click',function(){persistArmySelection('custom');});
    $('vpClearArmy').addEventListener('click',function(){document.querySelectorAll('[data-army-gid]').forEach(function(input){input.checked=false;});persistArmySelection('custom','常用配兵已清空，两套方案已恢复固定分层顺序。');});
    $('vpImportArmy').addEventListener('click',function(){
      try{
        var parsed=PRIORITY_ENGINE.parseArmyLink($('vpArmyLink').value),known=0,unknown=[];
        document.querySelectorAll('[data-army-gid]').forEach(function(input){input.checked=false;});
        parsed.gids.forEach(function(gid){var input=document.querySelector('[data-army-gid="'+gid+'"]');if(input){input.checked=true;known++;}else if(!IDMAP[gid])unknown.push(gid);});
        persistArmySelection('link','已从配兵链接识别 '+known+' 个可升级项目'+(unknown.length?'；新版目录仍未知 '+unknown.length+' 个编号':'')+'，两套方案已重建。');
      }catch(error){setArmyStatus(error&&error.message?error.message:'配兵链接解析失败','error');}
    });
  }

  function renderCoverageNotice(){
    var box=$("vpCoverageNotice");if(!box)return;
    if(!PARTIAL){box.style.display="none";return;}
    var equipment=(STORE.village.equipment||[]),gaps=0;
    equipment.forEach(function(item){var unit=unitOf(item.data),max=maxLevelForTH(unit,TH);if(max>num(item.lvl))gaps++;});
    var missing=Array.isArray(STORE.missingFields)?STORE.missingFields:[];
    box.style.display="block";
    box.innerHTML='<strong>公开资料部分规划</strong><p style="margin:6px 0 0;line-height:1.7;color:var(--ink-dim)">官方玩家接口不提供建筑、陷阱、工人数、资源和升级计时。本页只规划已返回的兵种、法术、英雄与战宠；不会把缺失建筑当作 0 级。装备还有 '+gaps+' 件存在等级差距，但装备升级没有时间轴，保留在快照中供数据分析使用。缺失范围：'+esc(missing.join("、")||"建筑私有数据")+'。导入游戏内完整账号 JSON 后可无损合并并恢复完整规划。</p>';
  }
  function setupDrop(planner){ var wrap=$(planner.wrapId),pending=$(planner.pendingGridId).parentElement; function over(e){ e.preventDefault(); e.dataTransfer.dropEffect="move"; this.classList.add("vp-drop-hover"); } function leave(){ this.classList.remove("vp-drop-hover"); } wrap.addEventListener("dragover",over); wrap.addEventListener("dragleave",leave); wrap.addEventListener("drop",function(e){ e.preventDefault(); this.classList.remove("vp-drop-hover"); var data=e.dataTransfer.getData("text/plain"); if(data&&data.indexOf("add:")===0){ var tid=data.slice(4),t=BUILD.taskMap[tid]; if(t)planner.scheduleWithDeps(t); planner.redraw(); } }); pending.addEventListener("dragover",over); pending.addEventListener("dragleave",leave); }
  function setupZoom(planner,world){ function setZoom(z){ STATE.zoom[world]=Math.max(0.3,Math.min(40,z)); $(planner.zoomLabelId).textContent=Math.round(STATE.zoom[world]*100)+"%"; planner.drawGantt(); } $("vpZoomIn"+cap(world)).addEventListener("click",function(){ setZoom(STATE.zoom[world]*1.5); }); $("vpZoomOut"+cap(world)).addEventListener("click",function(){ setZoom(STATE.zoom[world]/1.5); }); $("vpZoomReset"+cap(world)).addEventListener("click",function(){ setZoom(1); }); }
  function cap(w){ return w==="home"?"Home":"BB"; }
  function activateTab(btn){ document.querySelectorAll(".vp-tab").forEach(function(b){b.classList.remove("active");b.setAttribute("aria-selected","false");}); btn.classList.add("active"); btn.setAttribute("aria-selected","true"); var w=btn.getAttribute("data-world"); document.querySelectorAll(".vp-pane").forEach(function(p){p.classList.remove("active");p.hidden=true;}); var pane=$(w==="home"?"vpHome":"vpBB"); pane.classList.add("active"); pane.hidden=false; }
  function rebuildAll(){ if(homeP&&bbP)rebuildBothModes("工人加成已变化，两套固定方案已重建。"); }

  function init(){
    if(!STORE||!STORE.village){ $("vpNoData").style.display="block"; $("vpBody").style.display="none"; return; }
    if(!PLAN_STORAGE||!PRIORITY_ENGINE){ $("vpMetricsWrap").innerHTML='<p style="color:#f5b8b8">规划器核心模块加载失败，请刷新页面。</p>'; return; }
    fetch("../data/all_game_data_zh.json").then(function(r){return r.json();}).then(function(d){
      G=d; IDMAP=indexGameDataUnits(d);
      BUILD=buildTasks(); $("vpBody").style.display="block"; renderCoverageNotice();
      var v=STORE.village, dt=v.timestamp?new Date(v.timestamp*1000):null, wc=workerCounts();
      PLAN_IDENTITY={
        villageFingerprint:PLAN_STORAGE.fingerprintVillage(STORE,BUILD.tasks.map(function(t){return t.id;})),
        villageTag:String(v.tag||""),villageTimestamp:num(v.timestamp),
        gameDataVersion:String(d.meta&&d.meta.version||"unknown"),
        priorityFingerprint:PRIORITY_ENGINE.fingerprint(ARMY_CONFIG)
      };
      var oldState=null;
      try{oldState=JSON.parse(localStorage.getItem(PLAN_STORAGE.STORAGE_KEY)||"null");}catch(e){oldState=null;}
      var compatible=PLAN_STORAGE.isCompatible(oldState,PLAN_IDENTITY);
      PLAN_STATE=compatible?oldState:PLAN_STORAGE.emptySnapshot(PLAN_IDENTITY);
      if(!compatible&&oldState){
        PLAN_STATE.previous={villageFingerprint:String(oldState.villageFingerprint||""),gameDataVersion:String(oldState.gameDataVersion||""),updatedAt:num(oldState.updatedAt)};
        var sameIdentity=oldState.schemaVersion===PLAN_STORAGE.SCHEMA_VERSION&&oldState.villageFingerprint===PLAN_IDENTITY.villageFingerprint&&oldState.gameDataVersion===PLAN_IDENTITY.gameDataVersion;
        staleNotice=sameIdentity?"检测到方案快照结构损坏，已忽略损坏字段并安全重建两套固定方案。":"检测到村庄指纹或游戏数据版本变化，旧快照已保留摘要并重建。";
      }
      STATE.mode=compatible&&PLAN_STORAGE.MODES.indexOf(oldState.activeMode)>=0?oldState.activeMode:"steady";
      function metric(l,val){return '<div class="v-metric"><div class="vm-label">'+esc(l)+'</div><div class="vm-value">'+esc(val)+'</div></div>';}
      $("vpMetricsWrap").innerHTML=metric("玩家标签",v.tag||"-")+metric("采集时间",dt?dt.toLocaleString("zh-CN"):"-")+metric("家乡村庄大本营",TH+" 本")+metric("建筑大师大本营",BH?BH+" 本":"未建")+metric("游戏数据",PLAN_IDENTITY.gameDataVersion)+metric("村庄指纹",PLAN_IDENTITY.villageFingerprint);
      $("vpGobWorker").checked=STATE.gobWorker===1; $("vpGobLab").checked=STATE.gobLab===1; $("vpModeDesc").textContent=modeDesc();
      homeP=new Planner("home",{lanes:HOME_LANES,svgId:"vpGanttHome",wrapId:"vpGanttWrapHome",pendingGridId:"vpPendingGridHome",pendingCountId:"vpPendingCountHome",infoId:"vpInfoHome",statsId:"vpStatsHome",zoomLabelId:"vpZoomLabelHome"});
      bbP=new Planner("bb",{lanes:BB_LANES,svgId:"vpGanttBB",wrapId:"vpGanttWrapBB",pendingGridId:"vpPendingGridBB",pendingCountId:"vpPendingCountBB",infoId:"vpInfoBB",statsId:"vpStatsBB",zoomLabelId:"vpZoomLabelBB"});
      setupDrop(homeP); setupDrop(bbP); setupZoom(homeP,"home"); setupZoom(bbP,"bb"); setupSnapshotActions();setupArmyPriority();
      if(compatible)PLAN_STORAGE.MODES.forEach(sanitizeModeSnapshot);
      if(compatible&&PLAN_STATE.modes[STATE.mode]){
        applySnapshot(STATE.mode);
      }else{
        rebuildBothModes(staleNotice||"稳本与速本两套固定方案已建立。");
      }
      PERSIST_READY=true;
      document.querySelectorAll(".vp-mode-btn").forEach(function(btn){var active=btn.getAttribute("data-mode")===STATE.mode;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));});
      $("vpModeDesc").textContent=modeDesc();
      renderComparison();
      if(compatible)setSnapshotStatus("已恢复与当前村庄指纹、"+PLAN_IDENTITY.gameDataVersion+" 数据匹配的方案快照。","ok");
      $("vpAutoHome").addEventListener("click",function(){homeP.autoFill();}); $("vpClearHome").addEventListener("click",function(){homeP.clearPlan();});
      $("vpAutoBB").addEventListener("click",function(){bbP.autoFill();}); $("vpClearBB").addEventListener("click",function(){bbP.clearPlan();});
      $("vpGobWorker").addEventListener("change",function(){STATE.gobWorker=this.checked?1:0;saveOpts();rebuildAll();});
      $("vpGobLab").addEventListener("change",function(){STATE.gobLab=this.checked?1:0;saveOpts();rebuildAll();});
      document.querySelectorAll(".vp-mode-btn").forEach(function(btn){ btn.addEventListener("click",function(){switchMode(btn.getAttribute("data-mode"));}); });
      document.querySelectorAll(".vp-tab").forEach(function(btn){ btn.addEventListener("click",function(){ activateTab(btn); }); btn.addEventListener("keydown",function(e){ if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return; e.preventDefault(); var tabs=Array.prototype.slice.call(document.querySelectorAll(".vp-tab")),i=tabs.indexOf(btn),next=tabs[(i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length]; activateTab(next); next.focus(); }); });
      window.__cocPlannerFeature={modes:PLAN_STORAGE.MODES.slice(),fingerprint:PLAN_IDENTITY.villageFingerprint,priorityFingerprint:PLAN_IDENTITY.priorityFingerprint,version:PLAN_IDENTITY.gameDataVersion,getSnapshot:function(){savePlanState();return JSON.parse(JSON.stringify(PLAN_STATE));},switchMode:switchMode,rebuildBoth:rebuildBothModes,parseArmyLink:PRIORITY_ENGINE.parseArmyLink};
    }).catch(function(e){ $("vpMetricsWrap").innerHTML='<p style="color:#f5b8b8">游戏数据加载失败：'+e.message+'</p>'; });
  }
  function plannerTestRun(store,gameData,options,schedule){
    options=options||{};
    var saved={STORE:STORE,PARTIAL:PARTIAL,STATE:STATE,G:G,IDMAP:IDMAP,TH:TH,BH:BH,BUILD:BUILD,ARMY_CONFIG:ARMY_CONFIG,ARMY_SELECTED:ARMY_SELECTED};
    try{
      STORE=JSON.parse(JSON.stringify(store||{}));PARTIAL=Boolean(STORE&&STORE.coverage&&STORE.coverage.buildings===false);
      STATE={mode:options.mode==="rush"?"rush":"steady",gobWorker:0,gobLab:0,zoom:{home:1,bb:1}};
      G=gameData;IDMAP=indexGameDataUnits(gameData);
      TH=num(options.th!=null?options.th:STORE.th);BH=num(options.bh!=null?options.bh:STORE.bh);
      ARMY_CONFIG=PRIORITY_ENGINE.normalizeConfig({selectedGids:options.selectedGids||[],source:"custom",updatedAt:0});ARMY_SELECTED=PRIORITY_ENGINE.selectedLookup(ARMY_CONFIG);
      BUILD=buildTasks();
      var tasks=BUILD.tasks.map(function(task){var phase=strictBuilderPhase(task);return Object.assign({},task,{deps:task.deps.slice(),phase:phase});});
      if(!schedule)return {tasks:tasks};
      var planner=new Planner("home",{lanes:HOME_LANES,svgId:"",wrapId:"",pendingGridId:"",pendingCountId:"",infoId:"",statsId:"",zoomLabelId:""});
      planner.redraw=function(){};planner.autoFill();
      return {tasks:tasks,plan:planner.planList.map(function(entry){return Object.assign({},entry);})};
    }finally{
      STORE=saved.STORE;PARTIAL=saved.PARTIAL;STATE=saved.STATE;G=saved.G;IDMAP=saved.IDMAP;TH=saved.TH;BH=saved.BH;BUILD=saved.BUILD;ARMY_CONFIG=saved.ARMY_CONFIG;ARMY_SELECTED=saved.ARMY_SELECTED;
    }
  }
  window.__cocPlannerTest={build:function(store,gameData,options){return plannerTestRun(store,gameData,options,false);},schedule:function(store,gameData,options){return plannerTestRun(store,gameData,options,true);}};
  function saveOpts(){ try{ STORE.gobWorker=STATE.gobWorker; STORE.gobLab=STATE.gobLab; localStorage.setItem("tz_coc_village",JSON.stringify(STORE)); }catch(e){} }
  init();
})();
