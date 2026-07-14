/* ===== 天择网 · COC 升级规划器 · app.js ===== */
/* 单级拆分+前置依赖 · 英雄优先专用槽 · 缩放自适应日期 · 滑块鼠标拖动+拖出 */
(function () {
  "use strict";
  function $(id){ return document.getElementById(id); }
  function fmtDur(sec){ sec=Math.max(0,Math.round(sec)); var d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60,p=[]; if(d)p.push(d+"天"); if(h)p.push(h+"时"); if(m)p.push(m+"分"); if(!p.length)p.push(s+"秒"); return p.join(""); }
  function num(v){ v=parseInt(v,10); return isNaN(v)?0:v; }

  var STORE = null;
  try { STORE = JSON.parse(localStorage.getItem("tz_coc_village")); } catch(e){}
  var STATE = { mode:"steady", gobWorker:STORE?STORE.gobWorker:0, gobLab:STORE?STORE.gobLab:0, zoom:{home:1,bb:1} };
  var G=null, IDMAP={};
  var T0 = (STORE&&STORE.village&&STORE.village.timestamp) ? STORE.village.timestamp : Math.floor(Date.now()/1000);
  var TH = STORE?STORE.th:0, BH = STORE?STORE.bh:0;

  var HOME_LANES = [
    { key:"home_builder", label:"建筑工人", color:"#7c3aed" },
    { key:"home_lab",     label:"研究员",   color:"#3b82f6" },
    { key:"home_pet",     label:"战宠研究员", color:"#f59e0b" }
  ];
  var BB_LANES = [
    { key:"bb_builder", label:"建筑工人", color:"#8b5cf6" },
    { key:"bb_lab",     label:"研究员",   color:"#06b6d4" }
  ];
  var LAB_GID="1000007", TAVERN_GID="1000071", PETHOUSE_GID="1000068";

  function nameOf(id){ var u=IDMAP[String(id)]; return u?u.chineseName:("ID"+id); }
  function unitOf(id){ return IDMAP[String(id)]||null; }
  function catOf(id){ var u=IDMAP[String(id)]; return u?u.category:""; }
  function buildTimeSec(r){ if(!r)return 0; return num(r.BuildTimeD)*86400+num(r.BuildTimeH)*3600+num(r.BuildTimeM)*60+num(r.BuildTimeS); }
  function upgradeTimeSec(r){ if(!r)return 0; return num(r.UpgradeTimeH)*3600+num(r.UpgradeTimeM)*60; }
  function thOf(r){ if(!r)return 99; var ks=["requiredTownHallLevel","RequiredTownHallLevel","TownHallLevel"]; for(var i=0;i<3;i++){ if(r[ks[i]]!=null)return num(r[ks[i]]); } return 99; }
  function maxLevelForTH(unit,th){ if(!unit||!unit.levels||!unit.levels.length)return 0; var m=0; unit.levels.forEach(function(r){ if(thOf(r)<=th&&num(r.level)>m)m=num(r.level); }); return m; }
  function laneKey(t){ var c=t.cat; if(/兵|法术|攻城机器/.test(c)) return t.world==="bb"?"bb_lab":"home_lab"; if(/战宠/.test(c)) return "home_pet"; return t.world==="bb"?"bb_builder":"home_builder"; }
  function isBuilderKey(k){ return k.indexOf("_builder")>0; }
  function workerCounts(){ var b=STORE.baseWC||{}; return { home_builder:(b.home_builder||5)+STATE.gobWorker, home_lab:1+STATE.gobLab, home_pet:b.home_pet||0, bb_builder:b.bb_builder||5, bb_lab:1 }; }
  function currentBuildingLvl(gid,world){ var arr=world==="bb"?(STORE.village.buildings2||[]):(STORE.village.buildings||[]); var l=0; arr.forEach(function(b){ if(String(b.data)===gid)l=Math.max(l,b.lvl); }); return l; }
  function isRushExcluded(cat,name){ if(/防御建筑/.test(cat))return true; if(/陷阱/.test(cat))return true; if(/英雄/.test(cat))return true; if(/金矿|圣水收集器|暗黑重油钻井/.test(name))return true; if(/建筑工人小屋/.test(name))return true; return false; }

  function buildTasks(){
    var tasks=[],taskMap={}, v=STORE.village;
    function split(item,isBuilding,world){
      var unit=unitOf(item.data); if(!unit||!unit.levels||!unit.levels.length)return;
      var cur=item.lvl, maxL=maxLevelForTH(unit, world==="bb"?BH:TH);
      if(maxL<=0||cur>=maxL)return;
      var lmap={}; unit.levels.forEach(function(r){ lmap[num(r.level)]=r; });
      var cat=catOf(item.data);
      var cnt=item.cnt||1;
      for(var inst=0;inst<cnt;inst++){
        for(var L=cur;L<maxL;L++){
          var toLvl=L+1, row=lmap[toLvl]; if(!row)continue;
          var locked=false, sec;
          if(item.timer&&L===cur&&inst===0){ locked=true; sec=num(item.timer); } else { sec=isBuilding?buildTimeSec(row):upgradeTimeSec(row); }
          if(sec<=0&&!locked)continue;
          var reqLab=null, reqTavern=null;
          if(/兵|法术|攻城机器|战宠/.test(cat)) reqLab=num(row.LaboratoryLevel);
          if(/英雄/.test(cat)) reqTavern=num(row.RequiredHeroTavernLevel);
          var id=item.data+"_"+inst+"_"+L+"_"+toLvl;
          var t={id:id,unitKey:String(item.data)+"_"+inst,name:nameOf(item.data)+(cnt>1?("#"+(inst+1)):""),fromLvl:L,toLvl:toLvl,sec:sec,cat:cat,world:world,locked:locked,reqLab:reqLab,reqTavern:reqTavern,deps:[]};
          tasks.push(t); taskMap[id]=t;
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
      var prev=t.unitKey+"_"+(t.fromLvl-1)+"_"+t.fromLvl; if(taskMap[prev])t.deps.push(prev);
      if(t.reqLab){ var bg=/战宠/.test(t.cat)?PETHOUSE_GID:LAB_GID; var cb=currentBuildingLvl(bg,t.world); if(t.reqLab>cb){ var d=bg+"_0_"+(t.reqLab-1)+"_"+t.reqLab; if(taskMap[d])t.deps.push(d); } }
      if(t.reqTavern){ var ct=currentBuildingLvl(TAVERN_GID,"home"); if(t.reqTavern>ct){ var d2=TAVERN_GID+"_0_"+(t.reqTavern-1)+"_"+t.reqTavern; if(taskMap[d2])t.deps.push(d2); } }
    });
    return {tasks:tasks, taskMap:taskMap};
  }
  function sortCmp(a,b){ var ka=laneKey(a),kb=laneKey(b); var ab=isBuilderKey(ka),bb=isBuilderKey(kb); if(ab&&bb){ var ah=/英雄/.test(a.cat)?0:1,bh=/英雄/.test(b.cat)?0:1; if(ah!==bh)return ah-bh; return a.sec-b.sec; } return a.sec-b.sec; }
  function topoSort(tasks,taskMap){ var map={}; tasks.forEach(function(t){map[t.id]=1;}); tasks.forEach(function(t){ t._deps=t.deps.filter(function(d){return map[d];}); t._indeg=t._deps.length; }); var q=tasks.filter(function(t){return t._indeg===0;}).sort(sortCmp); var r=[]; while(q.length){ var t=q.shift(); r.push(t); tasks.forEach(function(u){ if(u._deps.indexOf(t.id)>=0){ u._indeg--; if(u._indeg===0)q.push(u); q.sort(sortCmp); } }); } return r; }

  function Planner(world,opts){
    this.world=world; this.lanes=opts.lanes;
    this.svgId=opts.svgId; this.wrapId=opts.wrapId; this.pendingGridId=opts.pendingGridId; this.pendingCountId=opts.pendingCountId;
    this.infoId=opts.infoId; this.statsId=opts.statsId; this.zoomLabelId=opts.zoomLabelId;
    this.planned={}; this.planList=[]; this._drag=null;
  }
  Planner.prototype.slots=function(){ var wc=workerCounts(),s={}; this.lanes.forEach(function(l){s[l.key]=wc[l.key]||0;}); return s; };
  Planner.prototype.activeLanes=function(){ var s=this.slots(); return this.lanes.filter(function(l){return (s[l.key]||0)>0;}); };
  Planner.prototype.allTasks=function(){ var all=BUILD.tasks.filter(function(t){return t.world===this.world;},this); if(STATE.mode==="rush")all=all.filter(function(t){return !isRushExcluded(t.cat,t.name);}); return all; };
  Planner.prototype.unplanned=function(){ var self=this; return this.allTasks().filter(function(t){return !self.planned[t.id];}).sort(sortCmp); };
  Planner.prototype.placeInLane=function(lane,earliest,dur){ var slots=this.slots()[lane]||0; if(slots<=0)return null; var laneTasks=this.planList.filter(function(p){return p.lane===lane;}).sort(function(a,b){return a.start-b.start;}); var best=null; for(var s=0;s<slots;s++){ var stasks=laneTasks.filter(function(p){return p.slot===s;}).sort(function(a,b){return a.start-b.start;}); var t0=earliest; for(var i=0;i<stasks.length;i++){ var p=stasks[i]; if(t0+dur<=p.start)break; t0=Math.max(t0,p.start+p.dur); } if(best===null||t0<best.start)best={slot:s,start:t0}; } return best; };
  Planner.prototype.depEnd=function(t){ var end=0,self=this; t.deps.forEach(function(did){ var p=self.planned[did]; if(p)end=Math.max(end,p.start+p.dur); }); return end; };
  Planner.prototype.scheduleWithDeps=function(t){ if(this.planned[t.id])return; var self=this; t.deps.forEach(function(did){ var dt=BUILD.taskMap[did]; if(dt&&!self.planned[did]&&dt.world===this.world)this.scheduleWithDeps(dt); },this); if(this.planned[t.id])return; if(t.locked){ var pl=this.placeInLane(laneKey(t),0,t.sec); this.planned[t.id]={id:t.id,start:0,dur:t.sec,lane:laneKey(t),slot:pl?pl.slot:0,locked:true}; } else { var e=this.depEnd(t); var pl2=this.placeInLane(laneKey(t),e,t.sec); this.planned[t.id]={id:t.id,start:pl2?pl2.start:e,dur:t.sec,lane:laneKey(t),slot:pl2?pl2.slot:0,locked:false}; } this.planList.push(this.planned[t.id]); };
  Planner.prototype.removeWithDeps=function(tid){ var self=this,entry=this.planned[tid]; if(!entry||entry.locked)return; delete this.planned[tid]; this.planList=this.planList.filter(function(p){return p.id!==tid;}); this.allTasks().forEach(function(t){ if(t.deps.indexOf(tid)>=0&&self.planned[t.id])self.removeWithDeps(t.id); }); };

  /* 英雄优先排程：locked先排(英雄locked排专用槽) → 英雄专用槽串行 → 其他拓扑贪心 */
  Planner.prototype.autoFill=function(){
    this.planned={}; this.planList=[];
    var all=this.allTasks(), self=this;
    var builderLane=this.world==="bb"?"bb_builder":"home_builder";
    var bSlots=this.slots()[builderLane]||0;
    var heroKeys=[]; all.forEach(function(t){ if(/英雄/.test(t.cat)&&laneKey(t)===builderLane&&heroKeys.indexOf(t.unitKey)<0)heroKeys.push(t.unitKey); });
    // 1. locked：英雄locked排专用槽，其他locked贪心
    all.filter(function(t){return t.locked;}).forEach(function(t){
      if(self.planned[t.id])return;
      var slot;
      if(/英雄/.test(t.cat)&&laneKey(t)===builderLane){ slot=heroKeys.indexOf(t.unitKey)%Math.max(bSlots,1); }
      else { var pl=self.placeInLane(laneKey(t),0,t.sec); slot=pl?pl.slot:0; }
      self.planned[t.id]={id:t.id,start:0,dur:t.sec,lane:laneKey(t),slot:slot,locked:true}; self.planList.push(self.planned[t.id]);
    });
    // 2. 英雄非locked专用槽串行；英雄多于槽位时，同槽英雄链继续排在已有链尾部
    var heroSlotEnd=[];
    for(var hs=0;hs<Math.max(bSlots,1);hs++)heroSlotEnd[hs]=0;
    this.planList.forEach(function(p){ if(p.lane===builderLane)heroSlotEnd[p.slot]=Math.max(heroSlotEnd[p.slot]||0,p.start+p.dur); });
    heroKeys.forEach(function(key,idx){
      var slot=idx%Math.max(bSlots,1);
      var prevEnd=heroSlotEnd[slot]||0;
      var lt=all.filter(function(t){return t.unitKey===key&&t.locked;})[0];
      if(lt&&self.planned[lt.id]) prevEnd=Math.max(prevEnd,self.planned[lt.id].start+self.planned[lt.id].dur);
      all.filter(function(t){return t.unitKey===key&&!t.locked;}).sort(function(a,b){return a.fromLvl-b.fromLvl;}).forEach(function(t){
        if(self.planned[t.id])return;
        var e=self.depEnd(t); var start=Math.max(prevEnd,e);
        self.planned[t.id]={id:t.id,start:start,dur:t.sec,lane:builderLane,slot:slot,locked:false}; self.planList.push(self.planned[t.id]);
        prevEnd=start+t.sec;
      });
      heroSlotEnd[slot]=prevEnd;
    });
    // 3. 其他任务拓扑贪心
    var others=all.filter(function(t){return !self.planned[t.id]&&!t.locked;});
    topoSort(others,BUILD.taskMap).forEach(function(t){ if(!self.planned[t.id])self.scheduleWithDeps(t); });
    this.redraw();
  };
  Planner.prototype.clearPlan=function(){ var self=this; Object.keys(this.planned).forEach(function(id){ if(!self.planned[id].locked)delete self.planned[id]; }); this.planList=this.planList.filter(function(p){return p.locked;}); this.redraw(); };
  Planner.prototype.redraw=function(){ this.drawGantt(); this.drawPending(); this.updateInfo(); };
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
    this.planList.forEach(function(p){ var t=BUILD.taskMap[p.id]; if(!t)return; var y0=laneStartY[p.lane]; if(y0==null)return; var y=y0+p.slot*rowH+4, x=padL+p.start*pxPerSec, w=Math.max(p.dur*pxPerSec,3); var col=laneColor[p.lane]||"#7c3aed"; if(p.locked)col="#64748b"; var barLabel=t.name+" "+t.fromLvl+"到"+t.toLvl+(p.locked?"，升级进行中":"，按 Delete 移回待规划区"); s+='<g class="vg-bar" data-tid="'+p.id+'" role="button" tabindex="'+(p.locked?'-1':'0')+'" aria-label="'+barLabel+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+(rowH-8)+'" rx="4" fill="'+col+'"'+(p.locked?' stroke="#fbbf24" stroke-width="1.5"':'')+'/>'; var lbl=t.name; if(lbl.length>7)lbl=lbl.slice(0,6)+"…"; if(w>40)s+='<text x="'+(x+4)+'" y="'+(y+(rowH-8)/2)+'" dominant-baseline="central">'+lbl+' '+t.fromLvl+'→'+t.toLvl+'</text>'; if(p.locked&&w>20)s+='<text x="'+(x+w-14)+'" y="'+(y+10)+'" font-size="9" fill="#fbbf24">🔒</text>'; s+='</g>'; });
    svg.innerHTML=s;
    svg.querySelectorAll(".vg-bar").forEach(function(g){ var tid=g.getAttribute("data-tid"),p=self.planned[tid]; if(p&&p.locked)return; g.addEventListener("mousedown",function(e){ self.onBarDown(e); }); g.addEventListener("keydown",function(e){ if(e.key==="Delete"||e.key==="Backspace"){ e.preventDefault(); self.removeWithDeps(tid); self.redraw(); $(self.pendingGridId).focus(); } }); });
  };
  Planner.prototype.svgPoint=function(svg,e){ var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  Planner.prototype.onBarDown=function(e){ e.preventDefault(); var g=e.currentTarget, tid=g.getAttribute("data-tid"), p=this.planned[tid]; if(!p||p.locked)return; var svg=$(this.svgId), pt=this.svgPoint(svg,e); this._drag={tid:tid,p:p,svg:svg,ptStart:pt,start0:p.start}; var self=this; this._move=function(ev){ self.onBarMove(ev); }; this._up=function(ev){ self.onBarUp(ev); }; window.addEventListener("mousemove",this._move); window.addEventListener("mouseup",this._up); };
  Planner.prototype.onBarMove=function(e){ var d=this._drag; if(!d)return; var pt=this.svgPoint(d.svg,e), dx=pt.x-d.ptStart.x; var baseW=1000,zoom=STATE.zoom[this.world],padL=140,padR=20,svgW=baseW*zoom,chartW=svgW-padL-padR; var end=this.planList.reduce(function(m,p){return Math.max(m,p.start+p.dur);},0); var days=Math.ceil(Math.max(end,86400)/86400)+1; var pxPerSec=chartW/(days*86400); var dsec=dx/pxPerSec; d.newStart=Math.max(0,d.start0+dsec); var g=d.svg.querySelector('.vg-bar[data-tid="'+d.tid+'"]'); if(g){ g.querySelector("rect").setAttribute("x",padL+d.newStart*pxPerSec); } };
  Planner.prototype.onBarUp=function(e){ var d=this._drag; if(!d)return; window.removeEventListener("mousemove",this._move); window.removeEventListener("mouseup",this._up); this._drag=null; // 判断是否拖到待规划区
    var pend=$(this.pendingGridId).parentElement, rect=pend.getBoundingClientRect();
    if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){ this.removeWithDeps(d.tid); }
    else { d.p.start=this.snapValid(d.p,d.newStart||d.p.start); }
    this.redraw();
  };
  Planner.prototype.snapValid=function(p,newStart){ var task=BUILD.taskMap[p.id],depMin=task?this.depEnd(task):0; newStart=Math.max(depMin,newStart||0); var laneTasks=this.planList.filter(function(x){return x.lane===p.lane&&x.slot===p.slot&&x.id!==p.id;}).sort(function(a,b){return a.start-b.start;}); function conflict(s2){ return laneTasks.some(function(q){ return s2<q.start+q.dur&&s2+p.dur>q.start; }); } if(!conflict(newStart))return newStart; var t=newStart; for(var i=0;i<laneTasks.length;i++){ var q=laneTasks[i]; if(t+p.dur<=q.start)return t; t=Math.max(t,q.start+q.dur); } return t; };
  Planner.prototype.drawPending=function(){ var self=this,grid=$(this.pendingGridId); var up=this.unplanned(); $(this.pendingCountId).textContent=up.length+" 项"; grid.setAttribute("tabindex","-1"); if(!up.length){ grid.innerHTML='<div class="vp-pending-empty">全部任务已安排</div>'; return; } var h=""; up.forEach(function(t){ var lockTag=t.locked?' 🔒':''; h+='<button type="button" class="vp-pending-item" draggable="true" data-tid="'+t.id+'" aria-label="安排 '+t.name+' '+t.fromLvl+' 到 '+t.toLvl+' 级">'+t.name+' '+t.fromLvl+'→'+t.toLvl+' · '+fmtDur(t.sec)+lockTag+'</button>'; }); grid.innerHTML=h; grid.querySelectorAll(".vp-pending-item").forEach(function(el){ el.addEventListener("click",function(){ var t=BUILD.taskMap[el.getAttribute("data-tid")]; if(t){ self.scheduleWithDeps(t); self.redraw(); } }); el.addEventListener("dragstart",function(e){ e.dataTransfer.setData("text/plain","add:"+el.getAttribute("data-tid")); e.dataTransfer.effectAllowed="move"; el.classList.add("dragging"); }); el.addEventListener("dragend",function(){ el.classList.remove("dragging"); }); }); };

  var BUILD=null, homeP=null, bbP=null;
  function modeDesc(){ if(STATE.mode==="steady")return "稳本模式：升级所有内容，每级一个滑块。建筑工人优先英雄（每个英雄占一个专用槽连续升级），英雄升完再升其他；研究员与战宠研究员按时间短→长。"; return "速本模式：忽略防御建筑、建筑工人小屋升级、陷阱、资源采集器与英雄，集中资源冲大本营。"; }
  function setupDrop(planner){ var wrap=$(planner.wrapId),pending=$(planner.pendingGridId).parentElement; function over(e){ e.preventDefault(); e.dataTransfer.dropEffect="move"; this.classList.add("vp-drop-hover"); } function leave(){ this.classList.remove("vp-drop-hover"); } wrap.addEventListener("dragover",over); wrap.addEventListener("dragleave",leave); wrap.addEventListener("drop",function(e){ e.preventDefault(); this.classList.remove("vp-drop-hover"); var data=e.dataTransfer.getData("text/plain"); if(data&&data.indexOf("add:")===0){ var tid=data.slice(4),t=BUILD.taskMap[tid]; if(t)planner.scheduleWithDeps(t); planner.redraw(); } }); pending.addEventListener("dragover",over); pending.addEventListener("dragleave",leave); }
  function setupZoom(planner,world){ function setZoom(z){ STATE.zoom[world]=Math.max(0.3,Math.min(40,z)); $(planner.zoomLabelId).textContent=Math.round(STATE.zoom[world]*100)+"%"; planner.drawGantt(); } $("vpZoomIn"+cap(world)).addEventListener("click",function(){ setZoom(STATE.zoom[world]*1.5); }); $("vpZoomOut"+cap(world)).addEventListener("click",function(){ setZoom(STATE.zoom[world]/1.5); }); $("vpZoomReset"+cap(world)).addEventListener("click",function(){ setZoom(1); }); }
  function cap(w){ return w==="home"?"Home":"BB"; }
  function activateTab(btn){ document.querySelectorAll(".vp-tab").forEach(function(b){b.classList.remove("active");b.setAttribute("aria-selected","false");}); btn.classList.add("active"); btn.setAttribute("aria-selected","true"); var w=btn.getAttribute("data-world"); document.querySelectorAll(".vp-pane").forEach(function(p){p.classList.remove("active");p.hidden=true;}); var pane=$(w==="home"?"vpHome":"vpBB"); pane.classList.add("active"); pane.hidden=false; }
  function rebuildAll(){ if(homeP)homeP.autoFill(); if(bbP)bbP.autoFill(); }

  function init(){
    if(!STORE||!STORE.village){ $("vpNoData").style.display="block"; $("vpBody").style.display="none"; return; }
    fetch("../data/all_game_data_zh.json").then(function(r){return r.json();}).then(function(d){
      G=d; d.units.forEach(function(u){var g=String(u.globalID||"").trim(); if(g)IDMAP[g]=u;});
      BUILD=buildTasks(); $("vpBody").style.display="block";
      var v=STORE.village, dt=v.timestamp?new Date(v.timestamp*1000):null, wc=workerCounts();
      function metric(l,val){return '<div class="v-metric"><div class="vm-label">'+l+'</div><div class="vm-value">'+val+'</div></div>';}
      $("vpMetricsWrap").innerHTML=metric("玩家标签",v.tag||"-")+metric("采集时间",dt?dt.toLocaleString("zh-CN"):"-")+metric("家乡大本营",TH+" 本")+metric("夜世界大本营",BH?BH+" 本":"未建")+metric("家乡建筑工人",wc.home_builder+" 个")+metric("单级任务总数",BUILD.tasks.length+" 项");
      $("vpGobWorker").checked=STATE.gobWorker===1; $("vpGobLab").checked=STATE.gobLab===1; $("vpModeDesc").textContent=modeDesc();
      homeP=new Planner("home",{lanes:HOME_LANES,svgId:"vpGanttHome",wrapId:"vpGanttWrapHome",pendingGridId:"vpPendingGridHome",pendingCountId:"vpPendingCountHome",infoId:"vpInfoHome",statsId:"vpStatsHome",zoomLabelId:"vpZoomLabelHome"});
      bbP=new Planner("bb",{lanes:BB_LANES,svgId:"vpGanttBB",wrapId:"vpGanttWrapBB",pendingGridId:"vpPendingGridBB",pendingCountId:"vpPendingCountBB",infoId:"vpInfoBB",statsId:"vpStatsBB",zoomLabelId:"vpZoomLabelBB"});
      homeP.autoFill(); bbP.autoFill(); setupDrop(homeP); setupDrop(bbP); setupZoom(homeP,"home"); setupZoom(bbP,"bb");
      $("vpAutoHome").addEventListener("click",function(){homeP.autoFill();}); $("vpClearHome").addEventListener("click",function(){homeP.clearPlan();});
      $("vpAutoBB").addEventListener("click",function(){bbP.autoFill();}); $("vpClearBB").addEventListener("click",function(){bbP.clearPlan();});
      $("vpGobWorker").addEventListener("change",function(){STATE.gobWorker=this.checked?1:0;saveOpts();rebuildAll();});
      $("vpGobLab").addEventListener("change",function(){STATE.gobLab=this.checked?1:0;saveOpts();rebuildAll();});
      document.querySelectorAll(".vp-mode-btn").forEach(function(btn){ btn.addEventListener("click",function(){ document.querySelectorAll(".vp-mode-btn").forEach(function(b){b.classList.remove("active");b.setAttribute("aria-pressed","false");}); btn.classList.add("active"); btn.setAttribute("aria-pressed","true"); STATE.mode=btn.getAttribute("data-mode"); $("vpModeDesc").textContent=modeDesc(); rebuildAll(); }); });
      document.querySelectorAll(".vp-tab").forEach(function(btn){ btn.addEventListener("click",function(){ activateTab(btn); }); btn.addEventListener("keydown",function(e){ if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return; e.preventDefault(); var tabs=Array.prototype.slice.call(document.querySelectorAll(".vp-tab")),i=tabs.indexOf(btn),next=tabs[(i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length]; activateTab(next); next.focus(); }); });
    }).catch(function(e){ $("vpMetricsWrap").innerHTML='<p style="color:#f5b8b8">游戏数据加载失败：'+e.message+'</p>'; });
  }
  function saveOpts(){ try{ STORE.gobWorker=STATE.gobWorker; STORE.gobLab=STATE.gobLab; localStorage.setItem("tz_coc_village",JSON.stringify(STORE)); }catch(e){} }
  init();
})();
