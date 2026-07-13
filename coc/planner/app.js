/* ===== 天择网 · COC 升级规划器 · app.js ===== */
/* 家乡/夜世界分开 · 稳本/速本模式 · 哥布林加成 · 多槽甘特图 */
(function () {
  "use strict";
  function $(id){ return document.getElementById(id); }
  function fmtDur(sec){ sec=Math.max(0,Math.round(sec)); var d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60,p=[]; if(d)p.push(d+"天"); if(h)p.push(h+"时"); if(m)p.push(m+"分"); if(!p.length)p.push(s+"秒"); return p.join(""); }
  function num(v){ v=parseInt(v,10); return isNaN(v)?0:v; }

  var STORE = null;
  try { STORE = JSON.parse(localStorage.getItem("tz_coc_village")); } catch(e){}
  var STATE = { mode:"steady", gobWorker:STORE?STORE.gobWorker:0, gobLab:STORE?STORE.gobLab:0 };

  var HOME_LANES = [
    { key:"home_builder", label:"建筑工人", color:"#7c3aed" },
    { key:"home_lab",     label:"研究员",   color:"#3b82f6" },
    { key:"home_pet",     label:"战宠研究员", color:"#f59e0b" }
  ];
  var BB_LANES = [
    { key:"bb_builder", label:"建筑工人", color:"#8b5cf6" },
    { key:"bb_lab",     label:"研究员",   color:"#06b6d4" }
  ];

  function laneKey(t){
    var c=t.cat;
    if(/兵|法术|攻城机器/.test(c)) return t.world==="bb"?"bb_lab":"home_lab";
    if(/战宠/.test(c)) return "home_pet";
    return t.world==="bb"?"bb_builder":"home_builder";
  }
  function isBuilderKey(k){ return k.indexOf("_builder")>0; }
  function isLabKey(k){ return k.indexOf("_lab")>0; }

  function workerCounts(){
    var b = STORE.baseWC || {};
    return {
      home_builder: (b.home_builder||5) + STATE.gobWorker,
      home_lab: 1 + STATE.gobLab,
      home_pet: b.home_pet||0,
      bb_builder: b.bb_builder||5,
      bb_lab: 1
    };
  }

  /* 速本过滤：忽略防御建筑/陷阱/英雄/资源采集器/建筑工人小屋升级 */
  function isRushExcluded(t){
    var c=t.cat, nm=t.name;
    if(/防御建筑/.test(c)) return true;
    if(/陷阱/.test(c)) return true;
    if(/英雄/.test(c)) return true;
    if(/金矿|圣水收集器|暗黑重油钻井/.test(nm)) return true;
    if(/建筑工人小屋/.test(nm)) return true;
    return false;
  }

  /* 稳本排序：builder 英雄优先→短→长；lab 随机；pet 短→长 */
  function steadySort(tasks){
    var builders=[], labs=[], pets=[];
    tasks.forEach(function(t){
      var k=laneKey(t);
      if(isBuilderKey(k)) builders.push(t);
      else if(isLabKey(k)) labs.push(t);
      else pets.push(t);
    });
    builders.sort(function(a,b){
      var ah=/英雄/.test(a.cat)?0:1, bh=/英雄/.test(b.cat)?0:1;
      if(ah!==bh) return ah-bh;
      return a.sec-b.sec;
    });
    labs.sort(function(){ return Math.random()-0.5; });
    pets.sort(function(a,b){ return a.sec-b.sec; });
    return builders.concat(labs, pets);
  }

  function filterAndSort(allTasks){
    var arr = STATE.mode==="rush" ? allTasks.filter(function(t){ return !isRushExcluded(t); }) : allTasks.slice();
    return steadySort(arr);
  }

  /* ===== 规划器实例 ===== */
  function Planner(world, opts){
    this.world=world; this.lanes=opts.lanes;
    this.allTasks=(STORE&&STORE.tasks||[]).filter(function(t){ return t.world===world; });
    this.plan=[]; this.pxPerSec=0;
    this.svgId=opts.svgId; this.selId=opts.selId; this.infoId=opts.infoId; this.statsId=opts.statsId;
  }
  Planner.prototype.slots = function(){ var wc=workerCounts(); var s={}; this.lanes.forEach(function(l){ s[l.key]=wc[l.key]||0; }); return s; };
  Planner.prototype.activeLanes = function(){ var s=this.slots(); return this.lanes.filter(function(l){ return (s[l.key]||0)>0; }); };
  Planner.prototype.orderedTasks = function(){ return filterAndSort(this.allTasks); };
  Planner.prototype.taskInPlan = function(tid){ return this.plan.some(function(p){return p.tid===tid;}); };
  Planner.prototype.fillSelect = function(){
    var sel=$(this.selId), html='<option value="">选择要添加的升级任务…</option>';
    var byLane={}, self=this;
    this.orderedTasks().forEach(function(t){ var k=laneKey(t); if(!byLane[k])byLane[k]=[]; byLane[k].push(t); });
    this.activeLanes().forEach(function(l){
      var items=(byLane[l.key]||[]).filter(function(t){ return !self.taskInPlan(t.id); });
      if(!items.length) return;
      html+='<optgroup label="'+l.label+'（'+items.length+'项可添加）">';
      items.forEach(function(t){ html+='<option value="'+t.id+'">'+t.name+' '+t.curLvl+'→'+t.maxLvl+' · '+fmtDur(t.sec)+'</option>'; });
      html+='</optgroup>';
    });
    sel.innerHTML=html;
  };
  Planner.prototype.scheduleTask = function(t, startHint){
    var lk=laneKey(t), slots=this.slots()[lk]||0;
    if(slots<=0) return false;
    var laneTasks=this.plan.filter(function(p){return p.lane===lk;});
    var start=startHint!=null?Math.max(0,startHint):0;
    var best=null;
    for(var s=0;s<slots;s++){
      var stasks=laneTasks.filter(function(p){return p.slot===s;}).sort(function(a,b){return a.start-b.start;});
      var t0=start;
      for(var i=0;i<stasks.length;i++){
        var p=stasks[i];
        if(t0+t.sec<=p.start) break;
        t0=Math.max(t0,p.start+p.dur);
      }
      if(best===null || t0<best.start){ best={slot:s,start:t0}; }
    }
    this.plan.push({tid:t.id,name:t.name,lvlFrom:t.curLvl,lvlTo:t.maxLvl,start:best.start,dur:t.sec,lane:lk,slot:best.slot,world:t.world,upgrading:t.upgrading});
    return true;
  };
  Planner.prototype.autoFill = function(){
    this.plan=[];
    var self=this;
    this.orderedTasks().forEach(function(t){ self.scheduleTask(t,0); });
    this.drawGantt(); this.fillSelect(); this.updateInfo();
  };
  Planner.prototype.addSelected = function(){
    var id=num($(this.selId).value); if(!id) return;
    var t=this.allTasks.filter(function(x){return x.id===id;})[0]; if(!t) return;
    if(this.taskInPlan(id)) return;
    this.scheduleTask(t,0);
    this.drawGantt(); this.fillSelect(); this.updateInfo();
  };
  Planner.prototype.clearPlan = function(){ this.plan=[]; this.drawGantt(); this.fillSelect(); this.updateInfo(); };
  Planner.prototype.updateInfo = function(){
    var end=this.plan.reduce(function(m,p){return Math.max(m,p.start+p.dur);},0);
    $(this.infoId).textContent="已规划 "+this.plan.length+" 项 · 总跨度 "+fmtDur(end);
    var byLane={}; this.plan.forEach(function(p){byLane[p.lane]=(byLane[p.lane]||0)+1;});
    var stxt="", self=this, s=this.slots();
    this.activeLanes().forEach(function(l){ stxt+='<span class="vps">'+l.label+'('+s[l.key]+'槽)：'+(byLane[l.key]||0)+'项</span>'; });
    stxt+='<span class="vps">规划总时长：'+fmtDur(end)+'</span>';
    $(this.statsId).innerHTML=stxt;
  };
  Planner.prototype.drawGantt = function(){
    var svg=$(this.svgId), lanes=this.activeLanes(), rowH=30, labelW=130, padL=labelW+10, padR=20, padT=30;
    var slots=this.slots();
    // 每个lane的槽位行数 = slots，但为紧凑，每lane一行高 = max(slots,1)*? 不，多槽画多行
    // 计算总行数：每个activeLane占 slots[lane] 行（至少1）
    var laneRows=[];
    var totalRows=0;
    lanes.forEach(function(l){ var n=Math.max(slots[l.key]||0,1); laneRows.push({lane:l,rows:n}); totalRows+=n; });
    var end=this.plan.reduce(function(m,p){return Math.max(m,p.start+p.dur);},0);
    var span=Math.max(end,86400), daySec=86400, days=Math.ceil(span/daySec)+1;
    var chartW=1000-padL-padR; this.pxPerSec=chartW/(days*daySec);
    var H=padT+totalRows*rowH+20;
    svg.setAttribute("viewBox","0 0 1000 "+H);
    var s="";
    var yCursor=padT;
    var laneStartY={};
    lanes.forEach(function(l,i){ laneStartY[l.key]=yCursor; yCursor += laneRows[i].rows*rowH; });
    // 画lane背景+标签+槽分割
    lanes.forEach(function(l,i){
      var n=laneRows[i].rows, y0=laneStartY[l.key];
      s+='<rect x="0" y="'+y0+'" width="1000" height="'+(n*rowH)+'" fill="'+(i%2?'rgba(255,255,255,0.015)':'transparent')+'"/>';
      s+='<text class="vg-lane-label" x="10" y="'+(y0+12)+'" dominant-baseline="central">'+l.label+' ('+slots[l.key]+'槽)</text>';
      for(var r=0;r<n;r++){ s+='<line class="vg-grid" x1="'+padL+'" y1="'+(y0+(r+1)*rowH)+'" x2="1000" y2="'+(y0+(r+1)*rowH)+'"/>'; }
      s+='<line class="vg-grid" x1="'+padL+'" y1="'+y0+'" x2="'+padL+'" y2="'+(y0+n*rowH)+'"/>';
    });
    // 时间刻度
    // 时间刻度：绝对日期 + 自适应间隔
    var today=new Date();
    var step=1;
    if(days>150) step=14; else if(days>70) step=7; else if(days>30) step=3; else if(days>14) step=2;
    for(var d=0;d<=days;d+=step){ var x=padL+d*daySec*this.pxPerSec; if(x>1000)break;
      var dt=new Date(today.getTime()+d*86400000);
      var lbl=(dt.getMonth()+1)+"/"+dt.getDate();
      s+='<line class="vg-grid" x1="'+x+'" y1="'+padT+'" x2="'+x+'" y2="'+(padT+totalRows*rowH)+'"/>';
      s+='<text class="vg-axis" x="'+x+'" y="'+(padT-8)+'" text-anchor="middle">'+lbl+'</text>';
    }
    // 任务条
    var laneColor={}; lanes.forEach(function(l){laneColor[l.key]=l.color;});
    var self=this;
    this.plan.forEach(function(p){
      var y0=laneStartY[p.lane]; if(y0==null)return;
      var y=y0+p.slot*rowH+4, x=padL+p.start*self.pxPerSec, w=Math.max(p.dur*self.pxPerSec,3);
      var col=laneColor[p.lane]||"#7c3aed";
      s+='<g class="vg-bar" data-tid="'+p.tid+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+(rowH-8)+'" rx="4" fill="'+col+'"/>';
      var lbl=p.name; if(lbl.length>8)lbl=lbl.slice(0,7)+"…";
      if(w>50) s+='<text x="'+(x+5)+'" y="'+(y+(rowH-8)/2)+'" dominant-baseline="central">'+lbl+' '+p.lvlFrom+'→'+p.lvlTo+'</text>';
      s+='</g>';
    });
    svg.innerHTML=s;
    var self2=this;
    svg.querySelectorAll(".vg-bar").forEach(function(g){ g.addEventListener("mousedown", function(e){ self2.onBarDown(e); }); });
  };
  Planner.prototype.svgPoint = function(svg,e){ var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  Planner.prototype.onBarDown = function(e){
    e.preventDefault();
    var g=e.currentTarget, tid=num(g.getAttribute("data-tid")), p=this.plan.filter(function(x){return x.tid===tid;})[0];
    if(!p)return;
    var svg=$(this.svgId), pt=this.svgPoint(svg,e);
    this._drag={tid:tid,p:p,svg:svg,ptStart:pt,start0:p.start,moved:false,newStart:null};
    var self=this;
    this._move=function(ev){ self.onBarMove(ev); };
    this._up=function(ev){ self.onBarUp(ev); };
    window.addEventListener("mousemove",this._move);
    window.addEventListener("mouseup",this._up);
  };
  Planner.prototype.onBarMove = function(e){
    var d=this._drag; if(!d)return;
    var pt=this.svgPoint(d.svg,e), dx=pt.x-d.ptStart.x, dsec=dx/this.pxPerSec;
    var newStart=Math.max(0,d.start0+dsec);
    d.moved=true; d.newStart=newStart;
    var labelW=130, padL=labelW+10;
    var g=d.svg.querySelector('.vg-bar[data-tid="'+d.tid+'"]'); if(g){ g.querySelector("rect").setAttribute("x",padL+newStart*this.pxPerSec); }
  };
  Planner.prototype.onBarUp = function(){
    var d=this._drag; if(!d)return;
    window.removeEventListener("mousemove",this._move);
    window.removeEventListener("mouseup",this._up);
    if(d.moved && d.newStart!=null){ d.p.start=this.snapValid(d.p,d.newStart); }
    this._drag=null;
    this.drawGantt(); this.updateInfo();
  };
  Planner.prototype.snapValid = function(p,newStart){
    newStart=Math.max(0,newStart);
    var laneTasks=this.plan.filter(function(x){return x.lane===p.lane&&x.slot===p.slot&&x.tid!==p.tid;}).sort(function(a,b){return a.start-b.start;});
    function conflict(s){ return laneTasks.some(function(q){ return s<q.start+q.dur && s+p.dur>q.start; }); }
    if(!conflict(newStart))return newStart;
    var t=newStart, sorted=laneTasks.slice().sort(function(a,b){return a.start-b.start;});
    for(var i=0;i<sorted.length;i++){ var q=sorted[i]; if(t+p.dur<=q.start)return t; t=Math.max(t,q.start+q.dur); }
    return t;
  };

  /* ===== 初始化 ===== */
  var homeP=null, bbP=null;
  function modeDesc(){
    if(STATE.mode==="steady") return "稳本模式：升级所有内容。建筑工人优先升级英雄，然后是时间短的项目，最后是时间长的项目；研究员随机升级。";
    return "速本模式：忽略防御建筑、建筑工人小屋升级、陷阱、资源采集器（金矿 / 圣水收集器 / 暗黑重油钻井）与英雄，集中资源冲大本营。";
  }
  function rebuildAll(){
    if(homeP){ homeP.autoFill(); }
    if(bbP){ bbP.autoFill(); }
  }
  function init(){
    if(!STORE || !STORE.tasks || !STORE.tasks.length){
      $("vpNoData").style.display="block";
      $("vpBody").style.display="none";
      $("vpMetricsWrap").innerHTML='<p style="font-size:13.5px; color:var(--ink-dim);">本页需要村庄存档数据。请先在「村庄存档分析」页解析数据后再来。</p>';
      return;
    }
    $("vpBody").style.display="block";
    var v=STORE.village||{}, d=v.timestamp?new Date(v.timestamp*1000):null;
    var wc=workerCounts();
    function metric(l,val){ return '<div class="v-metric"><div class="vm-label">'+l+'</div><div class="vm-value">'+val+'</div></div>'; }
    var mHtml=metric("玩家标签",v.tag||"-")+metric("采集时间",d?d.toLocaleString("zh-CN"):"-")+metric("家乡大本营",STORE.th+" 本")+metric("夜世界大本营",STORE.bh?STORE.bh+" 本":"未建")+metric("家乡建筑工人",wc.home_builder+" 个")+metric("待升级任务",STORE.tasks.length+" 项");
    $("vpMetricsWrap").innerHTML=mHtml;

    $("vpGobWorker").checked = STATE.gobWorker===1;
    $("vpGobLab").checked = STATE.gobLab===1;
    $("vpModeDesc").textContent = modeDesc();

    homeP = new Planner("home", { lanes:HOME_LANES, svgId:"vpGanttHome", selId:"vpSelHome", infoId:"vpInfoHome", statsId:"vpStatsHome" });
    bbP = new Planner("bb", { lanes:BB_LANES, svgId:"vpGanttBB", selId:"vpSelBB", infoId:"vpInfoBB", statsId:"vpStatsBB" });
    homeP.autoFill(); bbP.autoFill();

    $("vpAddHome").addEventListener("click",function(){homeP.addSelected();});
    $("vpAutoHome").addEventListener("click",function(){homeP.autoFill();});
    $("vpClearHome").addEventListener("click",function(){homeP.clearPlan();});
    $("vpAddBB").addEventListener("click",function(){bbP.addSelected();});
    $("vpAutoBB").addEventListener("click",function(){bbP.autoFill();});
    $("vpClearBB").addEventListener("click",function(){bbP.clearPlan();});

    $("vpGobWorker").addEventListener("change", function(){ STATE.gobWorker=this.checked?1:0; saveOpts(); rebuildAll(); });
    $("vpGobLab").addEventListener("change", function(){ STATE.gobLab=this.checked?1:0; saveOpts(); rebuildAll(); });

    document.querySelectorAll(".vp-mode-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        document.querySelectorAll(".vp-mode-btn").forEach(function(b){b.classList.remove("active");});
        btn.classList.add("active");
        STATE.mode=btn.getAttribute("data-mode");
        $("vpModeDesc").textContent=modeDesc();
        rebuildAll();
      });
    });

    document.querySelectorAll(".vp-tab").forEach(function(btn){
      btn.addEventListener("click", function(){
        document.querySelectorAll(".vp-tab").forEach(function(b){b.classList.remove("active");});
        btn.classList.add("active");
        var w=btn.getAttribute("data-world");
        document.querySelectorAll(".vp-pane").forEach(function(p){p.classList.remove("active");});
        $(w==="home"?"vpHome":"vpBB").classList.add("active");
      });
    });
  }
  function saveOpts(){
    try{ STORE.gobWorker=STATE.gobWorker; STORE.gobLab=STATE.gobLab; localStorage.setItem("tz_coc_village", JSON.stringify(STORE)); }catch(e){}
  }
  init();
})();
