const NS='http://www.w3.org/2000/svg';
const ALTS=[
  {tag:'ss01', name:'Rounded dots', on:false},
  {tag:'ss02', name:'Alternate lowercase l', on:true},
  {tag:'ss03', name:'Alternate r', on:true},
  {tag:'ss04', name:'Serifless uppercase I', on:false}
];
const PRESETS=[
  {name:'Violet / Dark Purple',      pad:'#A87BFE', font:'#4D1061'},
  {name:'Dusk / Midnight',           pad:'#D0B6FF', font:'#322234'},
  {name:'First Light / Dark Purple', pad:'#F1EFFD', font:'#4D1061'},
  {name:'Marigold / Soil',           pad:'#FF9C63', font:'#75153A'},
  {name:'Marigold Light / Soil',     pad:'#FFE4D1', font:'#75153A'},
  {name:'Harvest / Earth',           pad:'#FFE57B', font:'#5F4D00'},
  {name:'Light Harvest / Earth',     pad:'#FFF6D1', font:'#5F4D00'},
  {name:'Apple / Elder',             pad:'#C9EB9D', font:'#314234'},
  {name:'Apple Hint / Elder',        pad:'#F7FFE4', font:'#314234'}
];
/* the full brand palette, single colours — used where only one colour is
   needed (the subtitle), as opposed to PRESETS' curated font+highlight pairs */
const PALETTE=[
  {name:'First Light',     hex:'#F1EFFD'},
  {name:'Dusk',            hex:'#D0B6FF'},
  {name:'Violet',          hex:'#A87BFE'},
  {name:'Bloom',           hex:'#B638FF'},
  {name:'Dark Purple',     hex:'#4D1061'},
  {name:'Open Air',        hex:'#FFFEEE'},
  {name:'Light Harvest',   hex:'#FFF6D1'},
  {name:'Harvest',         hex:'#FFE57B'},
  {name:'Earth',           hex:'#5F4D00'},
  {name:'Marigold Hint',   hex:'#FFFAF6'},
  {name:'Marigold Light',  hex:'#FFE4D1'},
  {name:'Marigold',        hex:'#FF9C63'},
  {name:'Soil',            hex:'#75153A'},
  {name:'Apple Hint',      hex:'#F7FFE4'},
  {name:'Light Green',     hex:'#EBFCC2'},
  {name:'Apple',           hex:'#C9EB9D'},
  {name:'Elder',           hex:'#314234'},
  {name:'Midnight',        hex:'#322234'},
  {name:'Stone Hint',      hex:'#D9D7CA'},
  {name:'Stone',           hex:'#EEEDE3'},
  {name:'White',           hex:'#FFFFFF'}
];
const ZOOM_MIN=12.5, ZOOM_MAX=150, ZOOM_STEP=12.5;
const GAP_ABOVE_SUBTITLE=0.14;   /* x font size, gap between subtitle and title */
const DATE_GAP=0;                /* px — date highlight sits flush against the title block's last line */
const MIN_FRAME_W=160;
const MAX_FRAME_W=1920; /* the whole canvas — the frame can't be resized past its edges */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEAR_MIN=2020, YEAR_MAX=2040;

function defaultState(){
  const now=new Date();
  return {
    text:'The Centre for Reparative Innovation',
    subtitle:'', subColor:'#4D1061', subtitleOn:false,
    dateOn:false, dateColor:'#4D1061', datePadColor:'#A87BFE',
    dateMonth:now.getMonth()+1, dateYear:clamp(now.getFullYear(),YEAR_MIN,YEAR_MAX),
    frame:{x:null,y:null,width:null},
    fontSize:150, lineHeight:95, tracking:-4, capPct:66.7,
    padStart:10.5, padROld:17, padVOld:17,
    padStart2:10.5, padMid:4, padROther:9, padOther:17,
    fontColor:'#4D1061', padColor:'#A87BFE',
    alts:ALTS.map(a=>a.on),
    off:{}, wordColors:{},
    zoom:50
  };
}
let S=defaultState();
let dirty=false;
let lastWordClick=null; /* {gidx,t} — own double-click detection, keyed by the
  word's stable gidx rather than the DOM element, which gets replaced by
  every render() and so can't be used to track a click across two events */
/* Warn on refresh/close only once something has actually changed since the
   last save/export/load — not on every visit. */
window.addEventListener('beforeunload',function(e){
  if(!dirty) return;
  e.preventDefault(); e.returnValue='';
});

const board=document.getElementById('board');
const $=id=>document.getElementById(id);
/* Safari fires a genuine 'click' right after 'mouseup' for a right-click or
   Ctrl+click — Chrome and Firefox fire neither a 'click' nor even a
   'mousedown' for that gesture — so whatever the 'contextmenu' just opened
   (the board menu, a word/subtitle/date popover) reads that phantom click
   as "clicked outside itself" and closes right back up. Confirmed directly
   from Safari: contextmenu → (however long the button is held, no cap) →
   mouseup → click, all still reporting button 0. A short timer to clear
   the suppression doesn't work since that gap is exactly as long as the
   user holds the button, not a fixed handful of milliseconds — so instead
   this arms on 'contextmenu' and only disarms when a 'click' actually
   consumes it, however much later that turns out to be. A plain unrelated
   left-click is protected from ever being wrongly swallowed by a stale
   flag (e.g. Chrome/Firefox, where no phantom click ever arrives to
   consume it) because its own 'mousedown' resets the flag first — and
   'mousedown' reliably precedes 'click' for every gesture except the
   right-click/Ctrl+click one this exists to catch. */
let suppressNextClick=false;
document.addEventListener('mousedown',function(){ suppressNextClick=false; },true);
document.addEventListener('contextmenu',function(){
  suppressNextClick=true;
  /* Only one menu/popover open at a time, system-wide — a fresh right-click
     anywhere (the board, a word, the subtitle, the date) tears down
     whatever else is currently open first: the header dropdowns
     (Load/Save/Export/Add subtitle/Add date/Text appearance), the board's
     own right-click menu, and the word/subtitle/date popover system (they
     all share activeWordPopover, closing whichever of the three is open).
     Each individual open* function already guards against redundantly
     closing itself right before reopening, so this is safe to call
     unconditionally on every right-click regardless of what it's about to
     open. All three functions are defined further down but hoisted, and
     this only ever runs later in response to a real right-click, well
     after the whole script has loaded. */
  closeAllMenus();
  closeBoardMenu();
  closeWordPopover(true);
},true);
document.addEventListener('click',function(e){
  if(suppressNextClick){ suppressNextClick=false; e.stopImmediatePropagation(); }
},true);
function flash(m){ const el=$('status'); el.textContent=m; clearTimeout(flash.t); flash.t=setTimeout(()=>el.textContent='',3200); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function twoTone(pad,font){ return 'linear-gradient(135deg,'+pad+' 50%,'+font+' 50%)'; }
function slugify(str){
  const s=str.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return s||'hubot-highlight';
}

/* ---------- history (undo/redo) ---------- */
let history=[], future=[], lastPushT=0;
function snapshot(){ return JSON.parse(JSON.stringify(S)); }
function pushHistory(){
  dirty=true;
  history.push(snapshot());
  if(history.length>100) history.shift();
  future=[];
  updateHistButtons();
}
function pushHistoryCoalesced(){
  const now=Date.now();
  if(now-lastPushT>400) pushHistory();
  lastPushT=now;
}
function updateHistButtons(){
  $('undoBtn').disabled=history.length===0;
  $('redoBtn').disabled=future.length===0;
}
function undo(){
  if(!history.length) return;
  future.push(snapshot());
  S=history.pop();
  syncInputs(); render(); updateHistButtons();
}
function redo(){
  if(!future.length) return;
  history.push(snapshot());
  S=future.pop();
  syncInputs(); render(); updateHistButtons();
}
$('undoBtn').addEventListener('click',undo);
$('redoBtn').addEventListener('click',redo);
window.addEventListener('keydown',function(e){
  const tag=document.activeElement&&document.activeElement.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA') return; /* let native field undo work */
  const mod=e.metaKey||e.ctrlKey;
  if(!mod||e.key.toLowerCase()!=='z') return;
  e.preventDefault();
  if(e.shiftKey) redo(); else undo();
});

/* ---------- controls ---------- */

document.querySelectorAll('[data-size]').forEach(function(btn){
  btn.addEventListener('click',function(){
    pushHistory();
    S.fontSize=+btn.dataset.size;
    syncInputs(); render();
  });
});
/* Named so the board's right-click context menu can call them directly —
   these used to be sidebar buttons the menu triggered via .click(), but the
   redesign moved title colour presets/swap/clear entirely into that context
   menu, so the buttons themselves no longer exist in the DOM. */
function swapTitleColours(){
  pushHistory();
  const t=S.fontColor; S.fontColor=S.padColor; S.padColor=t;
  syncInputs(); render();
}
function clearAllOverrides(){
  pushHistory();
  S.wordColors={};
  render();
}
function highlightAllWords(){
  pushHistory();
  allWords().forEach(w=>{ delete S.off[w.gidx]; });
  render();
}
function unhighlightAllWords(){
  pushHistory();
  allWords().forEach(w=>{ S.off[w.gidx]=1; });
  S.wordColors={};
  render();
}
/* One combined toggle instead of two separate buttons — its label always
   names the action a click will perform, so it reads "Un-highlight all"
   whenever everything's currently on (true by default: a fresh document
   starts with nothing in S.off) and flips to "Highlight all" as soon as
   anything's off, including a genuinely mixed state — clicking then always
   resolves to fully on. */
function allWordsHighlighted(){
  return allWords().every(w=>!S.off[w.gidx]);
}
function toggleHighlightAllLabel(){
  return allWordsHighlighted()?'Un-highlight all':'Highlight all';
}
function toggleHighlightAll(){
  if(allWordsHighlighted()) unhighlightAllWords(); else highlightAllWords();
}
/* A popover-style preset picker: hovering an option previews it live on the
   canvas and in the raw colour pickers; moving off without clicking reverts;
   clicking locks it in as one undo step (snapshotting the true pre-open
   state, not whatever was last hovered). The menu only ever lists the brand
   presets — no "Custom" entry — though the trigger still reports "Custom" as
   status text if the current colours were set via the raw pickers instead. */
function initPresetCombo(triggerId,menuId,getState,setState){
  const trigger=$(triggerId), menu=$(menuId);
  const dot=trigger.querySelector('.swatch-dot');
  const label=trigger.querySelector('.combo-label');
  let original=null, open=false;

  function refresh(){
    const st=getState();
    const label_=matchPresetLabel(st.font,st.pad);
    dot.classList.toggle('custom',label_==null);
    dot.style.background=label_!=null?twoTone(st.pad,st.font):'';
    label.textContent=label_!=null?label_:'Custom';
  }
  function preview(state){
    /* guards against a stray mouseover/mouseleave firing after close (e.g. a
       delayed mouseleave synthesised when the menu's display flips to none
       mid-click) from clobbering a commit that already happened */
    if(!open) return;
    setState(state); render();
  }
  function openMenu(){
    if(open) return;
    open=true;
    original=getState();
    menu.innerHTML=PRESETS.map((p,i)=>
      '<button type="button" class="combo-item" data-i="'+i+'">'+
        '<span class="swatch-dot" style="background:'+twoTone(p.pad,p.font)+'"></span>'+
        '<span class="name">'+p.name+'</span></button>').join('');
    menu.hidden=false;
  }
  function closeMenu(committed){
    if(!open) return;
    open=false;
    menu.hidden=true;
    if(committed&&(committed.font!==original.font||committed.pad!==original.pad)){
      setState(original);
      pushHistory();
      setState(committed);
    }else{
      setState(original);
    }
    refresh(); render();
  }

  trigger.addEventListener('click',function(e){
    e.stopPropagation();
    if(open) closeMenu(null); else openMenu();
  });
  menu.addEventListener('mouseover',function(e){
    const b=e.target.closest('.combo-item'); if(!b) return;
    const p=PRESETS[+b.dataset.i];
    preview({font:p.font,pad:p.pad});
  });
  menu.addEventListener('mouseleave',function(){ preview(original); });
  menu.addEventListener('click',function(e){
    const b=e.target.closest('.combo-item'); if(!b) return;
    const p=PRESETS[+b.dataset.i];
    closeMenu({font:p.font,pad:p.pad});
  });
  document.addEventListener('click',function(e){
    if(open&&!trigger.contains(e.target)&&!menu.contains(e.target)) closeMenu(null);
  });
  document.addEventListener('keydown',function(e){
    if(open&&e.key==='Escape') closeMenu(null);
  });

  refresh();
  return {refresh:refresh};
}

/* Same hover-preview/click-to-commit combo, but for a single colour picked
   from the full brand palette rather than a font+highlight pair — used for
   the subtitle, which only ever needs one colour. */
function initColorCombo(triggerId,menuId,list,getState,setState){
  const trigger=$(triggerId), menu=$(menuId);
  const dot=trigger.querySelector('.swatch-dot');
  const label=trigger.querySelector('.combo-label');
  let original=null, open=false;

  function matchIndex(hex){
    for(let i=0;i<list.length;i++) if(list[i].hex.toLowerCase()===hex.toLowerCase()) return i;
    return -1;
  }
  function refresh(){
    const hex=getState();
    const idx=matchIndex(hex);
    dot.classList.toggle('custom',idx<0);
    dot.style.background=idx>=0?list[idx].hex:'';
    label.textContent=idx>=0?list[idx].name:'Custom';
  }
  function preview(hex){ if(!open) return; setState(hex); render(); }
  function openMenu(){
    if(open) return;
    open=true;
    original=getState();
    menu.innerHTML=list.map((c,i)=>
      '<button type="button" class="combo-item" data-i="'+i+'">'+
        '<span class="swatch-dot" style="background:'+c.hex+'"></span>'+
        '<span class="name">'+c.name+'</span></button>').join('');
    menu.hidden=false;
  }
  function closeMenu(committedHex){
    if(!open) return;
    open=false;
    menu.hidden=true;
    if(committedHex!=null&&committedHex!==original){
      setState(original);
      pushHistory();
      setState(committedHex);
    }else{
      setState(original);
    }
    refresh(); render();
  }

  trigger.addEventListener('click',function(e){
    e.stopPropagation();
    if(open) closeMenu(null); else openMenu();
  });
  menu.addEventListener('mouseover',function(e){
    const b=e.target.closest('.combo-item'); if(!b) return;
    preview(list[+b.dataset.i].hex);
  });
  menu.addEventListener('mouseleave',function(){ preview(original); });
  menu.addEventListener('click',function(e){
    const b=e.target.closest('.combo-item'); if(!b) return;
    closeMenu(list[+b.dataset.i].hex);
  });
  document.addEventListener('click',function(e){
    if(open&&!trigger.contains(e.target)&&!menu.contains(e.target)) closeMenu(null);
  });
  document.addEventListener('keydown',function(e){
    if(open&&e.key==='Escape') closeMenu(null);
  });

  refresh();
  return {refresh:refresh};
}

$('text').addEventListener('input',function(){ pushHistoryCoalesced(); S.text=$('text').value; render(); });
/* the canvas caret tracks this field's real cursor, so anything that can
   move the cursor (typing, arrow keys, clicking inside the field itself)
   needs to trigger a redraw, not just changes to the text's value */
/* deferred, not called directly: a click on the canvas can blur this field
   natively (SVG rects aren't focusable) *synchronously mid-mousedown*, and
   rendering right there would rebuild the board and yank out the very
   element that same click is still in the middle of dispatching to — so the
   click silently never lands. Pushing the render a tick later lets that
   click's own mousedown/mouseup/click sequence finish untouched first. */
$('text').addEventListener('focus',function(){ setTimeout(render,0); });
$('text').addEventListener('blur',function(){ setTimeout(render,0); });
$('text').addEventListener('keyup',function(){ render(); });
$('text').addEventListener('click',function(){ render(); });
$('subtitle').addEventListener('input',function(){ pushHistoryCoalesced(); S.subtitle=$('subtitle').value; render(); });

/* Add subtitle and Add date open their panel on click, like every other
   header dropdown — the on/off toggle lives inside the panel itself
   (subtitleToggleBtn/dateToggleBtn) rather than being reserved for the
   trigger button's own click, so opening the panel to peek at or edit the
   colour/text/month/year never requires it to be switched on first. */
initToggleMenu('addSubtitleBtn','addSubtitleMenu');
initToggleMenu('addDateBtn','addDateMenu');
$('subtitleToggleBtn').addEventListener('click',function(){
  pushHistory();
  S.subtitleOn=!S.subtitleOn;
  syncInputs(); render();
});
$('dateToggleBtn').addEventListener('click',function(){
  pushHistory();
  S.dateOn=!S.dateOn;
  syncInputs(); render();
});
/* Plain always-expanded swatch list (not a collapsed trigger+menu combo) —
   same hover-preview/click-to-commit convention as every other colour
   control here. */
function initSubtitleColourList(listId){
  const list=$(listId);
  list.innerHTML=PALETTE.map((c,i)=>
    '<button type="button" class="combo-item" data-i="'+i+'" style="justify-content:flex-start">'+
      '<span class="swatch-dot" style="background:'+c.hex+'"></span>'+
      '<span class="name">'+c.name+'</span></button>').join('');
  let original=null;
  list.addEventListener('mouseover',function(e){
    const b=e.target.closest('button'); if(!b) return;
    if(original==null) original=S.subColor;
    S.subColor=PALETTE[+b.dataset.i].hex; render();
  });
  list.addEventListener('mouseleave',function(){
    if(original==null) return;
    S.subColor=original; original=null; render();
  });
  list.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b) return;
    const hex=PALETTE[+b.dataset.i].hex;
    if(original!=null){ S.subColor=original; original=null; }
    pushHistory();
    S.subColor=hex;
    render();
  });
}
initSubtitleColourList('subColourList');

const monthOptionsHTML=MONTHS.map((m,i)=>'<option value="'+(i+1)+'">'+m+'</option>').join('');
let yearOptionsHTML='';
for(let y=YEAR_MIN;y<=YEAR_MAX;y++) yearOptionsHTML+='<option value="'+y+'">'+y+'</option>';
$('dateMonth').innerHTML=monthOptionsHTML;
$('dateYear').innerHTML=yearOptionsHTML;
$('dateMonth').addEventListener('change',function(){ pushHistory(); S.dateMonth=+this.value; render(); });
$('dateYear').addEventListener('change',function(){ pushHistory(); S.dateYear=+this.value; render(); });

/* Shared open/close animation for every dynamically created menu/popover
   (the board menu, word/subtitle/date popovers, the colour-preset flyout —
   anything appended to <body> and removed outright, as opposed to the
   header dropdowns' persistent .closed-toggled elements, which animate via
   CSS alone). popIn scales+fades an already-appended element up from its
   closed look; popOut reverses that and only removes the element once the
   transition has actually finished playing, so closing looks the same as
   opening in reverse instead of just vanishing. */
const MENU_ANIM_MS=150;
function popIn(el){
  el.style.opacity='0';
  el.style.transform='scale(.8)';
  el.style.transition='opacity '+MENU_ANIM_MS+'ms ease, transform '+MENU_ANIM_MS+'ms ease';
  /* Two nested rAFs, not one — a single one can still land in the same
     style-recalc as the initial opacity:0/scale:.8 above, which would
     make the transition have nothing to animate from and just snap
     straight to the end state. */
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ el.style.opacity='1'; el.style.transform='scale(1)'; });
  });
}
function popOut(el){
  el.style.pointerEvents='none';
  el.style.opacity='0';
  el.style.transform='scale(.8)';
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); },MENU_ANIM_MS);
}

/* The right-click word popover: hovering a preset previews it live on the
   canvas (same pattern as the panel colour combos); moving off without
   clicking reverts to whatever the word had before the popover opened;
   clicking locks it in as one undo step. */
let activeWordPopover=null; /* {el,revert} for the currently open popover, if any */
function closeWordPopover(cancel){
  if(!activeWordPopover) return;
  if(cancel) activeWordPopover.revert();
  popOut(activeWordPopover.el);
  activeWordPopover=null;
}
/* Capture phase, not bubble — the header dropdown buttons (initToggleMenu,
   Save) call stopPropagation() on their own click, which would otherwise
   stop this listener (registered on document, a bubble-phase ancestor)
   from ever seeing that click and this popover would stay open regardless
   of what else the user clicked. Capture fires on the way down, before
   stopPropagation() at the target can cut it off. */
document.addEventListener('click',function(e){
  if(activeWordPopover&&!activeWordPopover.el.contains(e.target)&&!e.target.closest('.hit-word')) closeWordPopover(true);
},true);
document.addEventListener('keydown',function(e){
  if(activeWordPopover&&e.key==='Escape') closeWordPopover(true);
});
function openWordPopover(gidx,clientX,clientY){
  closeWordPopover(true);
  const el=document.createElement('div');
  el.id='wordPopover'; el.className='popover';
  el.style.left=Math.min(clientX,window.innerWidth-190)+'px';
  el.style.top=Math.min(clientY,window.innerHeight-220)+'px';
  el.innerHTML=PRESETS.map((p,i)=>
    '<button type="button" data-p="'+i+'" style="display:flex;align-items:center;gap:7px;justify-content:flex-start">'+
      '<span style="width:14px;height:14px;background:'+twoTone(p.pad,p.font)+';border:1px solid var(--rule);flex:none"></span>'+
      '<span class="name">'+p.name+'</span></button>').join('')+
    '<button type="button" data-p="swap">&#8646; Swap this word\'s colours</button>'+
    '<button type="button" data-p="clear">Clear override</button>';
  document.body.appendChild(el);
  popIn(el);

  const original=S.wordColors[gidx]; /* undefined if this word has no override yet */
  let open=true;

  function colorsFor(p){
    if(p==='clear') return undefined;
    if(p==='swap'){
      /* base the swap on the word's true pre-open colour, not S.wordColors
         (which preview() mutates live) — otherwise hovering a preset first
         and then "swap" previews swapping that stale hover, not the word's
         actual current colour */
      const cur=original||{font:S.fontColor,pad:S.padColor};
      return {font:cur.pad,pad:cur.font};
    }
    const preset=PRESETS[+p];
    return {font:preset.font,pad:preset.pad};
  }
  function apply(v){ if(v===undefined) delete S.wordColors[gidx]; else S.wordColors[gidx]=v; }
  function preview(p){ if(!open) return; apply(colorsFor(p)); render(); }
  function revert(){ apply(original); render(); }
  function commit(p){
    open=false;
    apply(original);
    pushHistory();
    apply(colorsFor(p));
    render();
    popOut(el);
    activeWordPopover=null;
  }

  el.addEventListener('mouseover',function(e){
    const b=e.target.closest('button'); if(!b) return;
    preview(b.dataset.p);
  });
  el.addEventListener('mouseleave',function(){ if(open) revert(); });
  el.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b) return;
    commit(b.dataset.p);
  });

  activeWordPopover={el:el,revert:revert};
}

/* Same right-click popover, colours only — for the subtitle. It's a single
   colour (no highlight to pair it with), so there's no swap and nothing to
   "clear an override" back to; just the brand palette. */
function openSubtitlePopover(clientX,clientY){
  closeWordPopover(true);
  const el=document.createElement('div');
  el.id='wordPopover'; el.className='popover';
  el.style.left=Math.min(clientX,window.innerWidth-190)+'px';
  el.style.top=Math.min(clientY,window.innerHeight-220)+'px';
  el.innerHTML=PALETTE.map((c,i)=>
    '<button type="button" data-p="'+i+'" style="display:flex;align-items:center;gap:7px;justify-content:flex-start">'+
      '<span style="width:14px;height:14px;border-radius:50%;background:'+c.hex+';border:1px solid var(--rule);flex:none"></span>'+
      '<span class="name">'+c.name+'</span></button>').join('');
  document.body.appendChild(el);
  popIn(el);

  const original=S.subColor;
  let open=true;
  function apply(v){ S.subColor=v; }
  function preview(p){ if(!open) return; apply(PALETTE[+p].hex); render(); }
  function revert(){ apply(original); render(); }
  function commit(p){
    open=false;
    apply(original);
    pushHistory();
    apply(PALETTE[+p].hex);
    render();
    popOut(el);
    activeWordPopover=null;
  }
  el.addEventListener('mouseover',function(e){
    const b=e.target.closest('button'); if(!b) return;
    preview(b.dataset.p);
  });
  el.addEventListener('mouseleave',function(){ if(open) revert(); });
  el.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b) return;
    commit(b.dataset.p);
  });

  activeWordPopover={el:el,revert:revert};
}

/* Same right-click popover as words, for the date — it has a font+highlight
   pair like a word does, so it keeps swap and clear override, except
   "clear" here means "match the title's current colours" rather than
   falling back to a stored default, since the date has no default of its own. */
function openDatePopover(clientX,clientY){
  closeWordPopover(true);
  const el=document.createElement('div');
  el.id='wordPopover'; el.className='popover';
  el.style.left=Math.min(clientX,window.innerWidth-190)+'px';
  el.style.top=Math.min(clientY,window.innerHeight-220)+'px';
  el.innerHTML=PRESETS.map((p,i)=>
    '<button type="button" data-p="'+i+'" style="display:flex;align-items:center;gap:7px;justify-content:flex-start">'+
      '<span style="width:14px;height:14px;background:'+twoTone(p.pad,p.font)+';border:1px solid var(--rule);flex:none"></span>'+
      '<span class="name">'+p.name+'</span></button>').join('')+
    '<button type="button" data-p="swap">&#8646; Swap colours</button>'+
    '<button type="button" data-p="clear">Match title colours</button>';
  document.body.appendChild(el);
  popIn(el);

  const original={font:S.dateColor,pad:S.datePadColor};
  let open=true;
  function colorsFor(p){
    if(p==='clear') return {font:S.fontColor,pad:S.padColor};
    if(p==='swap') return {font:original.pad,pad:original.font};
    const preset=PRESETS[+p];
    return {font:preset.font,pad:preset.pad};
  }
  function apply(v){ S.dateColor=v.font; S.datePadColor=v.pad; }
  function preview(p){ if(!open) return; apply(colorsFor(p)); render(); }
  function revert(){ apply(original); render(); }
  function commit(p){
    open=false;
    apply(original);
    pushHistory();
    apply(colorsFor(p));
    render();
    popOut(el);
    activeWordPopover=null;
  }
  el.addEventListener('mouseover',function(e){
    const b=e.target.closest('button'); if(!b) return;
    preview(b.dataset.p);
  });
  el.addEventListener('mouseleave',function(){ if(open) revert(); });
  el.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b) return;
    commit(b.dataset.p);
  });

  activeWordPopover={el:el,revert:revert};
}

/* Right-clicking empty canvas (not a word/subtitle/date hit-rect, which each
   have their own popover above — tagged data-ctx="own" so this handler skips
   them) opens a board-wide action menu. "Colour presets" opens a second
   flyout beside this one rather than replacing it, Figma-style, so picking a
   preset doesn't cost a trip back through the first menu. */
let activeBoardMenu=null; /* {el} */

/* Colour-preset flyout submenu: reused by both the board's right-click menu
   and the Text appearance dropdown's "Colour presets" item (the same action
   is reachable from either place), so it manages its own lifetime rather
   than being owned by whichever menu happened to open it — closes itself on
   an outside click/Escape, and the caller passes onCommit for whatever else
   needs to happen (closing the parent menu) after a preset is picked. */
let activeColorSubmenu=null; /* {el} */
function closeColorSubmenu(){
  if(!activeColorSubmenu) return;
  popOut(activeColorSubmenu.el);
  activeColorSubmenu=null;
}
/* Capture phase — see the matching comment on activeWordPopover's listener. */
document.addEventListener('click',function(e){
  if(activeColorSubmenu&&!activeColorSubmenu.el.contains(e.target)&&!e.target.closest('[data-a="presets"]'))
    closeColorSubmenu();
},true);
document.addEventListener('keydown',function(e){
  if(activeColorSubmenu&&e.key==='Escape') closeColorSubmenu();
});
/* getState/setState let this same submenu serve either the title's colours
   (S.fontColor/S.padColor) or the date's (S.dateColor/S.datePadColor) —
   whichever the caller passes in. */
function openColorPresetSubmenu(anchorBtn,getState,setState,onCommit){
  closeColorSubmenu();
  const r=anchorBtn.getBoundingClientRect();
  const el=document.createElement('div');
  el.className='popover';
  /* aligned to the "Colour presets" row itself, not the parent panel — a
     panel like Text appearance has other sections above this row, so
     aligning to the panel's own top edge would leave the flyout floating
     well above whatever was actually hovered. */
  el.style.top=Math.max(4,r.top)+'px';
  el.innerHTML=PRESETS.map((p,i)=>
    '<button type="button" data-i="'+i+'" style="display:flex;align-items:center;gap:7px;justify-content:flex-start">'+
      '<span style="width:14px;height:14px;background:'+twoTone(p.pad,p.font)+';border:1px solid var(--rule);flex:none"></span>'+
      '<span class="name">'+p.name+'</span></button>').join('');
  document.body.appendChild(el);
  /* measured only now that it's in the DOM (with its real content) — its
     width varies with the longest preset name, so a hardcoded guess here
     either flips too early or, worse, not far enough, leaving it
     overlapping the parent menu instead of clearing it. */
  const w=el.getBoundingClientRect().width;
  let left=r.right+4;
  if(left+w>window.innerWidth) left=r.left-w-4;
  el.style.left=Math.max(4,left)+'px';
  /* after positioning, not before — popIn's scale transform would otherwise
     throw off the getBoundingClientRect() width measurement above */
  popIn(el);

  const original=getState();
  /* Guards mouseleave the same way open/committed does in the word/subtitle/
     date popovers: closeColorSubmenu()'s popOut() sets pointer-events:none
     on this element while it fades out rather than removing it outright, and
     that alone is enough for the browser to synthesise a mouseleave on it
     (the cursor visually still over it no longer resolves to anything
     interactive) — without this guard, that late mouseleave calls revert()
     right after a click had just committed a colour, undoing it instantly. */
  let open=true;
  function preview(p){ if(!open) return; setState({font:p.font,pad:p.pad}); render(); }
  function revert(){ if(!open) return; setState(original); render(); }
  el.addEventListener('mouseover',function(e){
    const b=e.target.closest('button'); if(!b) return;
    preview(PRESETS[+b.dataset.i]);
  });
  el.addEventListener('mouseleave',revert);
  el.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b) return;
    revert();
    open=false;
    pushHistory();
    const p=PRESETS[+b.dataset.i];
    setState({font:p.font,pad:p.pad});
    syncInputs(); render();
    closeColorSubmenu();
    if(onCommit) onCommit();
  });
  activeColorSubmenu={el:el};
}

/* "Swap colours" previews live on hover, same convention as every other
   colour control in this app — moving off without clicking reverts it,
   clicking locks it in as one undo step. Shared between the board menu, the
   Text appearance dropdown, and (via getState/setState) the date's own
   colour controls — each with its own independent hover session (its own
   swapOriginal closure). */
function makeSwapHover(getState,setState){
  let swapOriginal=null;
  function previewSwap(){
    if(swapOriginal) return;
    swapOriginal=getState();
    setState({font:swapOriginal.pad,pad:swapOriginal.font});
    render();
  }
  function revertSwap(){
    if(!swapOriginal) return;
    setState(swapOriginal);
    render();
    swapOriginal=null;
  }
  function commitSwap(){
    if(!swapOriginal) previewSwap();
    const orig=swapOriginal;
    setState(orig);
    pushHistory();
    setState({font:orig.pad,pad:orig.font});
    syncInputs(); render();
    swapOriginal=null;
  }
  return {previewSwap:previewSwap,revertSwap:revertSwap,commitSwap:commitSwap};
}
const titleColourState={
  get:()=>({font:S.fontColor,pad:S.padColor}),
  set:(v)=>{ S.fontColor=v.font; S.padColor=v.pad; }
};
const dateColourState={
  get:()=>({font:S.dateColor,pad:S.datePadColor}),
  set:(v)=>{ S.dateColor=v.font; S.datePadColor=v.pad; }
};

function closeBoardMenu(){
  closeColorSubmenu();
  if(!activeBoardMenu) return;
  activeBoardMenu.revertSwap();
  popOut(activeBoardMenu.el);
  activeBoardMenu=null;
}
/* Capture phase — see the matching comment on activeWordPopover's listener.
   Without this, clicking a header button (Load/Save/Export/Add subtitle/
   Add date/Text appearance) while the board's right-click menu is open
   left it open, since those buttons' own click handlers stopPropagation()
   before a bubble-phase listener here would ever see the click. */
document.addEventListener('click',function(e){
  if(activeBoardMenu&&!activeBoardMenu.el.contains(e.target)&&
     !(activeColorSubmenu&&activeColorSubmenu.el.contains(e.target))) closeBoardMenu();
},true);
document.addEventListener('keydown',function(e){
  if(activeBoardMenu&&e.key==='Escape') closeBoardMenu();
});

function openBoardMenu(clientX,clientY){
  closeBoardMenu();
  const el=document.createElement('div');
  el.className='ctx-menu';
  el.style.left=Math.min(clientX,window.innerWidth-200)+'px';
  el.style.top=Math.min(clientY,window.innerHeight-220)+'px';
  el.innerHTML=
    '<button type="button" data-a="clear">Clear overrides</button>'+
    '<button type="button" data-a="presets">Colour presets <span class="ctx-caret">&#9656;</span></button>'+
    '<hr>'+
    '<button type="button" data-a="toggleAll">'+toggleHighlightAllLabel()+'</button>'+
    '<hr>'+
    '<button type="button" data-a="swap">Swap colours</button>';
  document.body.appendChild(el);
  popIn(el);

  const swap=makeSwapHover(titleColourState.get,titleColourState.set);
  el.addEventListener('mouseover',function(e){
    const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.a==='presets'){ openColorPresetSubmenu(b,titleColourState.get,titleColourState.set,closeBoardMenu); swap.revertSwap(); }
    else if(b.dataset.a==='swap'){ closeColorSubmenu(); swap.previewSwap(); }
    else{ closeColorSubmenu(); swap.revertSwap(); }
  });
  el.addEventListener('mouseleave',function(){ swap.revertSwap(); });
  el.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b) return;
    switch(b.dataset.a){
      case 'presets': return; /* the submenu handles its own clicks */
      case 'clear': clearAllOverrides(); break;
      case 'toggleAll': toggleHighlightAll(); break;
      case 'swap': swap.commitSwap(); break;
    }
    closeBoardMenu();
  });

  activeBoardMenu={el:el,revertSwap:swap.revertSwap};
}

board.addEventListener('contextmenu',function(ev){
  if(ev.target.closest('[data-ctx="own"]')) return;
  ev.preventDefault();
  openBoardMenu(ev.clientX,ev.clientY);
});

/* ---------- zoom ---------- */
/* The 100%-zoom "fit to screen" size, measured once from the CSS default
   (width:100% of .stage, capped by max-height) rather than duplicating that
   calc() in JS. Cached so setZoom doesn't force a layout on every call —
   only boot and viewport-size changes (see measureHeader) recompute it. */
let boardFitWidth=null;
function measureFitWidth(){
  const savedW=board.style.width, savedMH=board.style.maxHeight;
  board.style.width=''; board.style.maxHeight='';
  boardFitWidth=board.getBoundingClientRect().width||800;
  board.style.width=savedW;
  /* neutralised from here on — with an explicit px width below, this rule
     would otherwise keep re-clamping height (and thus width, since it's a
     replaced element with an intrinsic ratio) back down past 100%, which
     is exactly the zoom ceiling this replaces. */
  board.style.maxHeight='none';
}
function setZoom(z){
  S.zoom=clamp(Math.round(z*8)/8,ZOOM_MIN,ZOOM_MAX);
  if(boardFitWidth==null) measureFitWidth();
  board.style.width=(boardFitWidth*S.zoom/100)+'px';
  board.style.height='auto';
  $('zoomLbl').textContent=(Math.round(S.zoom*2)/2)+'%';
  /* frame-handle sizing is scale-aware (see render()) — re-render so handles
     stay a constant, grabbable screen size right after the zoom changes */
  render();
}
$('zoomIn').addEventListener('click',function(){ setZoom(S.zoom+ZOOM_STEP); });
$('zoomOut').addEventListener('click',function(){ setZoom(S.zoom-ZOOM_STEP); });

function ensureFrame(){
  /* the frame always stays centred (x/y are never user-set — see frameX/frameY
     in render()), so only its width needs a concrete baseline before a resize
     drag can compute relative deltas off it */
  if(S.frame.width==null){
    S.frame.width=(lastAutoFrame||{width:400}).width;
  }
}

/* ---------- save / load ---------- */
/* Named, listed layouts with a save-conflict prompt and an unsaved-changes
   guard — the same save flow as layout-studies.html's Saved panel, in place
   of this tool's old prompt()-for-a-name plus dropdown-select pair. */
function uid(){ return Math.random().toString(36).slice(2,10); }
function esc(str){ return String(str).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function loadLayouts(){
  let raw;
  try{ raw=JSON.parse(localStorage.getItem('hubotLayouts')||'[]'); }catch(e){ return []; }
  if(Array.isArray(raw)) return raw;
  /* migrate the old {name: state} object format from before named/listed saves */
  return Object.keys(raw).map(name=>({id:uid(),name:name,at:Date.now(),state:raw[name]}));
}
function saveLayoutsList(list){
  try{ localStorage.setItem('hubotLayouts',JSON.stringify(list)); return true; }
  catch(e){ return false; }
}
function uniqueLayoutName(base){
  let n=base,i=2;
  while(layouts.some(l=>l.name===n)){ n=base+' '+i; i++; }
  return n;
}
function snapshotLayout(id,name){
  return {id:id,name:name,at:Date.now(),state:snapshot()};
}

let layouts=loadLayouts();
let currentSaveId=null;

/* ============ header dropdown menus ============ */
/* Generic open/close for the header's Load/Save/Export/Add subtitle/Add
   date/Text appearance menus — each is a .ctx-menu nested in a .menu-anchor
   (position:relative) wrapper, toggled by its own trigger button, with only
   one open at a time. Independent of the older per-word/board-context-menu/
   combo popover systems, which manage their own elements and
   close-on-outside-click already. */
let openMenuEls=[];
function closeAllMenus(){
  openMenuEls.forEach(m=>{ m.classList.add('closed'); });
  openMenuEls=[];
  /* also drops any colour-preset flyout left over from whichever menu just
     closed — it's a sibling in <body>, not a DOM descendant of the panel,
     so it doesn't disappear on its own when the panel does */
  closeColorSubmenu();
}
function showMenu(menu){
  closeAllMenus();
  menu.classList.remove('closed');
  openMenuEls=[menu];
}
document.addEventListener('click',function(e){
  if(openMenuEls.length&&!e.target.closest('.menu-anchor')) closeAllMenus();
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape') closeAllMenus();
});
function initToggleMenu(btnId,menuId,onOpen){
  const btn=$(btnId), menu=$(menuId);
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    if(!menu.classList.contains('closed')){ closeAllMenus(); return; }
    if(onOpen) onOpen();
    showMenu(menu);
  });
}
initToggleMenu('exportMenuBtn','exportMenu');
/* Text appearance opens on click now too, like every other header
   dropdown — it has no on/off state of its own, so there's nothing left
   that needed hover to stay independent of a click. */
initToggleMenu('textAppearanceBtn','textAppearanceMenu');

/* Text appearance also carries its own copy of Clear overrides/Colour
   presets/Highlight all/Un-highlight all/Swap colours — same actions as the
   board's right-click menu, reachable here too. Shares the colour-preset
   submenu and swap-hover-preview logic with that menu (see openBoardMenu).
   None of these close the panel afterward — clicking one just applies it,
   leaving the panel open for further adjustments until it's dismissed like
   any other header dropdown (its own trigger, an outside click, Escape). */
(function initTextAppearanceColourActions(){
  const menu=$('textAppearanceMenu');
  const swap=makeSwapHover(titleColourState.get,titleColourState.set);
  menu.addEventListener('mouseover',function(e){
    const b=e.target.closest('button[data-a]'); if(!b) return;
    if(b.dataset.a==='presets'){ openColorPresetSubmenu(b,titleColourState.get,titleColourState.set,null); swap.revertSwap(); }
    else if(b.dataset.a==='swap'){ closeColorSubmenu(); swap.previewSwap(); }
    else{ closeColorSubmenu(); swap.revertSwap(); }
  });
  menu.addEventListener('mouseleave',function(){ swap.revertSwap(); });
  menu.addEventListener('click',function(e){
    const b=e.target.closest('button[data-a]'); if(!b) return;
    switch(b.dataset.a){
      case 'presets': return; /* the submenu handles its own clicks */
      case 'clear': clearAllOverrides(); break;
      case 'toggleAll': toggleHighlightAll(); break;
      case 'swap': swap.commitSwap(); break;
    }
  });
})();

/* The date's own colour controls — Match title colours / Colour presets
   (flyout) / Swap colours. onAction runs after any of the three commits, so
   the caller can decide what "done" means for its own menu style. */
function initDateColourActions(menuId,onAction){
  const menu=$(menuId);
  const swap=makeSwapHover(dateColourState.get,dateColourState.set);
  menu.addEventListener('mouseover',function(e){
    const b=e.target.closest('button[data-a]'); if(!b) return;
    if(b.dataset.a==='presets'){ openColorPresetSubmenu(b,dateColourState.get,dateColourState.set,onAction); swap.revertSwap(); }
    else if(b.dataset.a==='swap'){ closeColorSubmenu(); swap.previewSwap(); }
    else{ closeColorSubmenu(); swap.revertSwap(); }
  });
  menu.addEventListener('mouseleave',function(){ swap.revertSwap(); });
  menu.addEventListener('click',function(e){
    const b=e.target.closest('button[data-a]'); if(!b) return;
    switch(b.dataset.a){
      case 'presets': return; /* the submenu handles its own clicks */
      case 'matchTitle':
        pushHistory();
        S.dateColor=S.fontColor; S.datePadColor=S.padColor;
        syncInputs(); render();
        break;
      case 'swap': swap.commitSwap(); break;
    }
    if(onAction) onAction();
  });
}
initDateColourActions('addDateMenu',null);

function savedRowsHTML(){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return layouts.length?layouts.slice().sort((a,b)=>b.at-a.at).map(function(l){
    const d=new Date(l.at);
    const when=d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear();
    return '<div class="saved-row">'+
      '<span style="width:14px;height:14px;background:'+twoTone(l.state.padColor,l.state.fontColor)+';border:1px solid var(--rule);flex:none"></span>'+
      '<button class="name" data-load="'+l.id+'">'+esc(l.name)+'<br><span class="meta">'+when+(l.id===currentSaveId?' · open':'')+'</span></button>'+
      '<button class="del" data-del="'+l.id+'" aria-label="Delete">&times;</button></div>';
  }).join(''):'<p class="hint" style="margin:0;padding:4px 6px">Nothing saved yet.</p>';
}
function renderLoadMenu(){
  $('loadMenu').innerHTML=savedRowsHTML()+'<hr>'+
    '<button type="button" id="exportJsonBtn">Export styles</button>'+
    '<button type="button" id="importJsonBtn">Import styles</button>';
}
initToggleMenu('loadBtn','loadMenu',renderLoadMenu);

function loadObj(obj){
  S=Object.assign(defaultState(),obj);
  currentSaveId=null;
  dirty=false;
  syncInputs(); render();
}

function commitSave(entry,replaceId){
  const prev=layouts;
  layouts=replaceId?layouts.map(l=>l.id===replaceId?entry:l):[entry].concat(layouts);
  if(saveLayoutsList(layouts)){
    currentSaveId=entry.id;
    dirty=false;
    $('layoutName').value=entry.name;
    flash((replaceId?'Updated "':'Saved "')+entry.name+'".');
  } else {
    layouts=prev;
    flash('Could not save — storage is full.');
  }
}
/* Same-name/renamed/collides-with-a-different-saved-layout conflict
   detection — the header's Save presents it as a dropdown under the
   button, skipped entirely (straight to commitSave) when there's no
   conflict. */
function computeSaveActions(typed){
  const current=layouts.find(l=>l.id===currentSaveId);
  const byName=layouts.find(l=>l.name===typed&&l.id!==currentSaveId);
  if(current&&current.name===typed){
    return [
      {label:'Update "'+current.name+'"',fn:()=>commitSave(snapshotLayout(current.id,typed),current.id)},
      {label:'Save as a new layout',fn:()=>commitSave(snapshotLayout(uid(),uniqueLayoutName(typed)))}];
  }
  if(current){
    return [
      {label:'Rename and update it',fn:()=>commitSave(snapshotLayout(current.id,uniqueLayoutName(typed)),current.id)},
      {label:'Save as a new layout',fn:()=>commitSave(snapshotLayout(uid(),uniqueLayoutName(typed)))}];
  }
  if(byName){
    return [
      {label:'Overwrite it',fn:()=>commitSave(snapshotLayout(byName.id,typed),byName.id)},
      {label:'Save as "'+uniqueLayoutName(typed)+'"',fn:()=>commitSave(snapshotLayout(uid(),uniqueLayoutName(typed)))}];
  }
  return null;
}
$('saveBtn').addEventListener('click',function(e){
  e.stopPropagation();
  const typed=($('layoutName').value||'').trim()||'Untitled';
  const actions=computeSaveActions(typed);
  if(!actions){ commitSave(snapshotLayout(uid(),typed)); return; }
  const menu=$('saveMenu');
  menu.innerHTML=actions.map((a,i)=>'<button type="button" data-i="'+i+'">'+esc(a.label)+'</button>').join('')+
    '<hr><button type="button" data-i="cancel">Cancel</button>';
  menu.__actions=actions;
  showMenu(menu);
});
$('saveMenu').addEventListener('click',function(e){
  const b=e.target.closest('button'); if(!b) return;
  const actions=this.__actions;
  closeAllMenus();
  if(b.dataset.i!=='cancel'&&actions) actions[+b.dataset.i].fn();
});
function guardUnsaved(what,next){
  if(!dirty) return next();
  openModal('Unsaved changes',
    'This layout has changes that aren’t saved. '+what+' will lose them — save it first if you want to keep it.',
    [{label:'Discard and continue',fn:next},{label:'Cancel'}]);
}
function loadLayout(id){
  const l=layouts.find(l=>l.id===id); if(!l) return;
  guardUnsaved('Loading another layout',function(){
    pushHistory();
    S=Object.assign(defaultState(),l.state);
    currentSaveId=l.id;
    dirty=false;
    $('layoutName').value=l.name;
    syncInputs(); render();
    flash('Loaded "'+l.name+'".');
  });
}
function exportJson(){
  const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.download='hubot-layout.json'; a.href=URL.createObjectURL(blob); a.click();
  URL.revokeObjectURL(a.href);
  dirty=false;
  closeAllMenus();
}
function handleSavedRowClick(e){
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.load){ closeAllMenus(); loadLayout(b.dataset.load); }
  if(b.dataset.del){
    const l=layouts.find(l=>l.id===b.dataset.del);
    closeAllMenus();
    openModal('Delete','Delete "'+(l?l.name:'this layout')+'"? This cannot be undone.',[
      {label:'Delete it',fn:function(){
        layouts=layouts.filter(l=>l.id!==b.dataset.del);
        if(currentSaveId===b.dataset.del) currentSaveId=null;
        saveLayoutsList(layouts);
      }},{label:'Cancel'}]);
  }
}
$('loadMenu').addEventListener('click',function(e){
  const b=e.target.closest('button'); if(!b) return;
  if(b.id==='exportJsonBtn'){ exportJson(); return; }
  if(b.id==='importJsonBtn'){ $('importJsonFile').click(); return; }
  handleSavedRowClick(e);
});
$('importJsonFile').addEventListener('change',function(){
  const f=this.files[0]; if(!f) return;
  const reader=new FileReader();
  reader.onload=function(){
    try{
      const obj=JSON.parse(reader.result);
      pushHistory();
      loadObj(obj);
      flash('Layout imported.');
    }catch(e){ flash('Import failed — not valid JSON.'); }
    $('importJsonFile').value='';
  };
  reader.readAsText(f);
});

/* ============ modal ============ */
/* Still used for the two flows that stayed as centered prompts: the
   unsaved-changes guard (guardUnsaved) and confirming a saved layout's
   deletion — only the Save conflict prompt moved to the dropdown above. */
let modalActions=[];
function closeModal(){
  $('modal').classList.remove('on');
  modalActions=[];
}
function openModal(title,msg,actions){
  modalActions=actions||[];
  $('modalTitle').textContent=title;
  $('modalMsg').textContent=msg||'';
  $('modalActions').innerHTML=modalActions
    .map((a,i)=>'<button data-act="'+i+'">'+esc(a.label)+'</button>').join('');
  $('modal').classList.add('on');
}
$('modalActions').addEventListener('click',function(e){
  const b=e.target.closest('button'); if(!b) return;
  const a=modalActions[+b.dataset.act]; closeModal(); if(a&&a.fn) a.fn();
});
$('modal').addEventListener('click',function(e){ if(e.target.id==='modal') closeModal(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeModal(); });

/* ---------- sync DOM inputs from state (load / undo / redo) ---------- */
function matchPresetIndex(font,pad){
  for(let i=0;i<PRESETS.length;i++){
    if(PRESETS[i].font.toLowerCase()===font.toLowerCase()&&(pad==null||PRESETS[i].pad.toLowerCase()===pad.toLowerCase())) return i;
  }
  return -1;
}
/* Also matches a preset reversed (e.g. after hitting "swap" on Apple/Elder),
   so the trigger reads "Elder / Apple" instead of falling back to "Custom" —
   the colours are still exactly a named brand pair, just the other way round. */
function matchPresetLabel(font,pad){
  const idx=matchPresetIndex(font,pad);
  if(idx>=0) return PRESETS[idx].name;
  for(let i=0;i<PRESETS.length;i++){
    if(PRESETS[i].font.toLowerCase()===pad.toLowerCase()&&PRESETS[i].pad.toLowerCase()===font.toLowerCase()){
      const parts=PRESETS[i].name.split(' / ');
      return parts.length===2?(parts[1]+' / '+parts[0]):PRESETS[i].name;
    }
  }
  return null;
}
function syncInputs(){
  $('text').value=S.text;
  $('subtitle').value=S.subtitle;
  /* The trigger button just stays highlighted while on (.active); the
     toggle button inside its panel carries the actual "Show X"/"Hide X"
     state label, since the trigger's own click now opens the panel rather
     than toggling on/off. */
  $('addDateBtn').classList.toggle('active',S.dateOn);
  $('dateToggleBtn').textContent=S.dateOn?'Hide date':'Show date';
  $('addSubtitleBtn').classList.toggle('active',S.subtitleOn);
  $('subtitleToggleBtn').textContent=S.subtitleOn?'Hide subtitle':'Show subtitle';
  $('dateMonth').value=S.dateMonth; $('dateYear').value=S.dateYear;
  document.querySelectorAll('[data-size]').forEach(function(btn){
    btn.classList.toggle('active',+btn.dataset.size===S.fontSize);
  });
  setZoom(S.zoom);
}

/* ---------- type helpers ---------- */
function featureSettings(){
  const on=['"tnum" 1'].concat(ALTS.filter((a,i)=>S.alts[i]).map(a=>'"'+a.tag+'" 1'));
  return on.join(',');
}
function fontStyle(size,trackPct,wght,wdth){
  wght=wght||450; wdth=wdth||100;
  return "font-family:'Hubot Sans',sans-serif;font-variation-settings:'wdth' "+wdth+",'wght' "+wght+";"+
    "font-feature-settings:"+featureSettings()+";font-size:"+size+"px;"+
    "letter-spacing:"+(trackPct*size/100)+"px;";
}
/* Cap height and descender depth, both measured from the live styled font so
   the variable axes and any alternates are accounted for. The band runs cap
   height to baseline; the padding on every side is the descender depth, which
   puts the block's bottom edge exactly on the descenders. */
function metrics(size,trackPct){
  function box(str){
    const t=document.createElementNS(NS,'text');
    t.setAttribute('x',0); t.setAttribute('y',0);
    t.setAttribute('style',fontStyle(size,trackPct));
    t.textContent=str;
    board.appendChild(t);
    const b=t.getBBox();
    board.removeChild(t);
    return b;
  }
  const cb=box('H'), db=box('pqjy');
  return {
    cap: Math.abs(cb.y)||size*0.72,
    desc: Math.max(0,(db.y+db.height))||size*0.16
  };
}
function textWidth(str,style){
  if(!str) return 0;
  const t=document.createElementNS(NS,'text');
  t.setAttribute('x',0); t.setAttribute('y',0);
  t.setAttribute('style',style);
  t.appendChild(document.createTextNode(str));
  board.appendChild(t);
  const w=t.getBBox().width;
  board.removeChild(t);
  return w;
}

/* ---------- word model ---------- */
/* Every word in the title gets a stable global index (gidx), independent of
   how it happens to wrap into visual lines — so resizing the text box never
   loses or reshuffles a word's highlight state or colour override. */
function tokenize(text){
  let gidx=0;
  return text.split('\n').map(function(line){
    const trimmed=line.trim();
    if(!trimmed) return [];
    return trimmed.split(/\s+/).map(function(w){ return {text:w, gidx:gidx++}; });
  });
}
let lastWords=[];
function allWords(){ return lastWords; }
/* One entry per drawn text run (each title word, each subtitle line, the
   date string) — recorded fresh on every render() so the SVG export's
   outline step always matches exactly what's on screen. */
let lastGlyphRuns=[];

/* Maps a word's gidx back to its character offset in the raw text, so a
   click on the canvas can place a real cursor in the sidebar textarea at
   roughly the right spot — reusing the same word order tokenize() assigns
   gidx in, so the two stay in sync. */
function wordCharOffset(text,gidx){
  let idx=0, pos=0;
  const lines=text.split('\n');
  for(let li=0;li<lines.length;li++){
    const line=lines[li];
    const re=/\S+/g; let m;
    while((m=re.exec(line))){
      if(idx===gidx) return pos+m.index;
      idx++;
    }
    pos+=line.length+1;
  }
  return text.length;
}
function focusFieldAt(fieldId,offset){
  const ta=$(fieldId);
  ta.focus();
  ta.setSelectionRange(offset,offset);
  render(); /* draws the canvas caret at the final position, not wherever it was before focus */
}
/* Inverse of wordCharOffset: given a character offset in the raw text, finds
   which word it falls in (or the nearest word edge, if it's sitting in
   whitespace) and how many characters into that word it is — used to draw
   the fake blinking caret at the right spot on the canvas. */
function offsetToWordPosition(text,offset){
  let idx=0, pos=0, prev=null;
  const lines=text.split('\n');
  for(let li=0;li<lines.length;li++){
    const line=lines[li];
    const re=/\S+/g; let m;
    while((m=re.exec(line))){
      const wStart=pos+m.index, wEnd=wStart+m[0].length;
      if(offset>=wStart&&offset<=wEnd) return {gidx:idx,charsIntoWord:offset-wStart};
      if(offset<wStart) return prev||{gidx:idx,charsIntoWord:0};
      prev={gidx:idx,charsIntoWord:m[0].length};
      idx++;
    }
    pos+=line.length+1;
  }
  return prev;
}
/* Finds how many characters of `word` (rendered in `style`) fit within
   targetWidth of pixels, so a click lands between the actual nearest
   letters rather than snapping to the start/end of the whole word. */
function charIndexInWord(word,style,targetWidth){
  let best=0,bestDiff=Infinity;
  for(let n=0;n<=word.length;n++){
    const diff=Math.abs(textWidth(word.slice(0,n),style)-targetWidth);
    if(diff<bestDiff){ bestDiff=diff; best=n; }
  }
  return best;
}

function wrapParagraph(words,style,frameWidth){
  if(!words.length) return [[]];
  if(frameWidth==null) return [words];
  const lines=[]; let current=[];
  words.forEach(function(w){
    const trial=current.concat([w]);
    if(current.length && textWidth(trial.map(x=>x.text).join(' '),style)>frameWidth){
      lines.push(current); current=[w];
    } else current=trial;
  });
  if(current.length) lines.push(current);
  return lines;
}

/* Each word is its own tspan so it can be measured and clicked independently.
   Words are joined with a single literal space text node so natural spacing
   and letter-spacing both still apply correctly across word boundaries. */
function buildLine(words,style,defaultFill,wordColorFn){
  const t=document.createElementNS(NS,'text');
  t.setAttribute('x',0); t.setAttribute('y',0);
  t.setAttribute('style',style); t.setAttribute('fill',defaultFill);
  const tspans=[];
  words.forEach(function(w,idx){
    if(idx>0) t.appendChild(document.createTextNode(' '));
    const ts=document.createElementNS(NS,'tspan');
    ts.textContent=w.text;
    const fc=wordColorFn(w.gidx);
    if(fc) ts.setAttribute('fill',fc);
    t.appendChild(ts);
    tspans.push({el:ts,gidx:w.gidx});
  });
  return {t:t,tspans:tspans};
}

/* ---------- render ---------- */
let lastAutoFrame=null;

function render(){
  const size=S.fontSize;
  const pitch=size*(S.lineHeight/100);
  const trackPct=S.tracking;
  const fontColor=S.fontColor, padColor=S.padColor;
  const m=metrics(size,trackPct);
  const cap=m.cap*(S.capPct/100);
  const style=fontStyle(size,trackPct);

  const padLeftWhole=size*(S.padStart/100);
  const padRightWhole=size*(S.padROld/100);
  const padVWhole=size*(S.padVOld/100);
  const padLeftStart=size*(S.padStart2/100);
  const padLeftMid=size*(S.padMid/100);
  const padROther=size*(S.padROther/100);
  const padOther=size*(S.padOther/100);
  const refBlockH=cap+padVWhole*2;

  function wordFontColor(gidx){ const o=S.wordColors[gidx]; return o?o.font:null; }
  function wordPadColor(gidx){ const o=S.wordColors[gidx]; return o?o.pad:padColor; }
  lastGlyphRuns=[];
  board.innerHTML='';
  const contentG=document.createElementNS(NS,'g'); contentG.setAttribute('class','ui-content');
  const rectG=document.createElementNS(NS,'g');
  const textG=document.createElementNS(NS,'g');
  const subG=document.createElementNS(NS,'g');
  const dateG=document.createElementNS(NS,'g');
  const hitG=document.createElementNS(NS,'g'); hitG.setAttribute('class','ui-only');
  const frameG=document.createElementNS(NS,'g'); frameG.setAttribute('class','ui-only');
  const caretG=document.createElementNS(NS,'g'); caretG.setAttribute('class','ui-only');
  contentG.appendChild(rectG); contentG.appendChild(subG); contentG.appendChild(textG); contentG.appendChild(dateG);
  board.appendChild(contentG); board.appendChild(hitG); board.appendChild(frameG); board.appendChild(caretG);

  /* ---- title: tokenize, wrap, measure ---- */
  const paragraphs=tokenize(S.text);
  /* Before the frame's ever been touched, S.frame.width is null — wrapParagraph
     treats that as "don't wrap at all," which is fine as long as the text
     actually fits on one line. When it doesn't (long text, large font size,
     no manual resize yet), the unwrapped line just runs off both edges of
     the canvas, since nothing caps it. Wrapping against the canvas's own
     width (MAX_FRAME_W) in that case — rather than skipping wrapping
     outright — keeps the auto/unresized state consistent with what a
     resize immediately produces, without needing S.frame.width itself to
     become non-null (the frame still reads as "auto-sized", not "manually
     resized to 1920"). */
  const frameWidth=S.frame.width==null?MAX_FRAME_W:S.frame.width;
  const visualLines=[];
  paragraphs.forEach(function(p){ wrapParagraph(p,style,frameWidth).forEach(l=>visualLines.push(l)); });

  const built=visualLines.map(function(words){
    const b=buildLine(words,style,fontColor,wordFontColor);
    textG.appendChild(b.t);
    return b;
  });
  const lineBox=built.map(function(b,i){
    if(!visualLines[i].length) return {x:0,w:0};
    const bb=b.t.getBBox();
    return {x:bb.x, w:bb.width};
  });
  /* Per-word x/width from measured prefix substrings, not getBBox() on each
     tspan: Safari returns wrong bounding boxes for tspans placed by natural
     text-flow continuation (no explicit x) once there's more than one on a
     line — only the first tspan's box came back right. That silently threw
     off every highlight-run edge and click hit-rect for the 2nd+ word on a
     line in Safari, while Chrome happened to compute it correctly. Measuring
     the same way wrapParagraph() already measures line widths sidesteps it
     entirely. */
  const wordBox=visualLines.map(function(line){
    return line.map(function(w,j){
      const width=textWidth(w.text,style);
      /* SVG text measurement trims leading/trailing whitespace, so a
         trailing space appended to just the prefix is silently dropped —
         measuring through this word and subtracting its own width back off
         is what actually captures the interior space before it. */
      const before=j===0?0:textWidth(line.slice(0,j+1).map(x=>x.text).join(' '),style)-width;
      return {gidx:w.gidx, bb:{x:before, width:width}};
    });
  });
  const maxW=Math.max(1,...lineBox.map(o=>o.w));
  const titleH=(visualLines.length-1)*pitch+refBlockH;

  /* ---- subtitle: measured, own single line for now (wraps as one block if it has line breaks) ---- */
  const subSize=Math.max(10,size*0.32);
  const subStyle=fontStyle(subSize,trackPct,350,100);
  /* Turning the subtitle on with no text typed yet shows a ghost "Edit Me"
     line instead of nothing — an editing affordance, not real content, so
     it's excluded from lastGlyphRuns below (never exported) and drawn at
     reduced opacity to read as a placeholder. */
  const subHasText=S.subtitle.split('\n').some(l=>l.trim()!=='' );
  const subIsPlaceholder=S.subtitleOn&&!subHasText;
  const subLines=S.subtitleOn?(subHasText?S.subtitle.split('\n'):['Edit Me']):[];
  const subM=subLines.length?metrics(subSize,trackPct):null;
  const subPitch=subSize*(S.lineHeight/100);
  const subH=subLines.length?((subLines.length-1)*subPitch+subM.cap+subM.desc):0;
  const subGapPx=subLines.length?size*GAP_ABOVE_SUBTITLE:0;
  const subWidths=subLines.map(l=>textWidth(l,subStyle));
  const subMaxW=subWidths.length?Math.max(...subWidths):0;

  /* ---- date ---- */
  const dateStr=S.dateOn?(MONTHS[S.dateMonth-1]+' '+S.dateYear):'';
  const dateSize=Math.max(10,size*0.26);
  const dateStyle=fontStyle(dateSize,trackPct);
  const dateM=S.dateOn?metrics(dateSize,trackPct):null;
  const dateCap=S.dateOn?dateM.cap*(S.capPct/100):0;
  /* left/right and top/bottom padding are both doubled relative to the
     title's own whole-line padding — the default read too tight around the date */
  const datePadStart=dateSize*(S.padStart/100)*2;
  const datePadR=dateSize*(S.padROld/100)*2;
  const datePadV=dateSize*(S.padVOld/100)*2;
  /* dateW/dateH describe the date's own highlight box (text + its padding),
     not just the text glyphs, so it centres and touches correctly below */
  const dateW=S.dateOn?textWidth(dateStr,dateStyle)+datePadStart+datePadR:0;
  const dateH=S.dateOn?(dateCap+datePadV*2):0;
  const dateGapPx=S.dateOn?DATE_GAP:0;

  /* ---- layout: auto-center whole assembly, or use the user's frame ---- */
  const totalW=Math.max(maxW,subMaxW,dateW);
  const totalH=subH+subGapPx+titleH+dateGapPx+dateH;
  const autoX=(1920-Math.max(maxW,subMaxW))/2;
  const autoY=(1080-totalH)/2+subH+subGapPx;
  lastAutoFrame={x:autoX,y:autoY,width:Math.max(MIN_FRAME_W,maxW)};

  /* frame position is never user-controlled — only its width (the wrap
     boundary) is draggable — so the whole title/subtitle/date block always
     stays centred on the canvas */
  const frameX=autoX;
  const frameY=autoY;

  const firstBaseline=frameY+cap;
  const targetLeft=frameX;

  const words=[]; /* flat, for allWords() */
  const lineRuns=[];
  let lastLineRightEdge=null; /* last visual line's right edge, including highlight padding if its last word is highlighted */
  /* document.activeElement changes synchronously the instant .focus() is
     called — checking it directly here (rather than a separate flag set from
     inside a 'focus'/'blur' listener) means the very first render right
     after a click already shows the caret in the right place, instead of
     lagging one extra render behind while that listener's own state catches up. */
  const activeTextField=(document.activeElement===$('text'))?$('text'):null;
  const caretTarget=activeTextField
    ?offsetToWordPosition(S.text,activeTextField.selectionStart):null;
  visualLines.forEach(function(line,i){
    const baseline=firstBaseline+i*pitch;
    const delta=targetLeft-lineBox[i].x;
    built[i].t.setAttribute('x',delta);
    built[i].t.setAttribute('y',baseline);
    if(!line.length) return;

    const lw=wordBox[i].map((o,j)=>({gidx:o.gidx,text:line[j].text,left:o.bb.x+delta,right:o.bb.x+o.bb.width+delta}));
    lw.forEach(w=>words.push(w));
    lw.forEach(w=>lastGlyphRuns.push({text:w.text,x:w.left,y:baseline,size:size,wght:450,wdth:100,trackingPx:trackPct*size/100,fill:wordFontColor(w.gidx)||fontColor,anchor:'start'}));

    const runs=[]; let cur=null;
    lw.forEach(function(w,j){
      if(!S.off[w.gidx]){ if(cur) cur.b=j; else cur={a:j,b:j}; }
      else if(cur){ runs.push(cur); cur=null; }
    });
    if(cur) runs.push(cur);

    /* if the line's last word is highlighted, the date should sit at the edge
       of ITS highlight padding, not the bare glyph edge */
    lastLineRightEdge=lw[lw.length-1].right;
    if(runs.length){
      const lastRun=runs[runs.length-1];
      if(lastRun.b===lw.length-1){
        const isWhole=lastRun.a===0&&lastRun.b===lw.length-1;
        lastLineRightEdge=lw[lastRun.b].right+(isWhole?padRightWhole:padROther);
      }
    }

    runs.forEach(function(r){
      const isStart=r.a===0;
      const isWhole=r.a===0&&r.b===lw.length-1;
      const leftPad=isWhole?padLeftWhole:(isStart?padLeftStart:padLeftMid);
      const rightPad=isWhole?padRightWhole:padROther;
      const vPad=isWhole?padVWhole:padOther;
      const top=baseline-cap-vPad;
      const h=cap+vPad*2;

      let subA=r.a, subColor=wordPadColor(lw[r.a].gidx);
      for(let j=r.a+1;j<=r.b+1;j++){
        const c=j<=r.b?wordPadColor(lw[j].gidx):null;
        if(j>r.b||c!==subColor){
          const subB=j-1;
          const x0=(subA===r.a)?(lw[subA].left-leftPad):((lw[subA-1].right+lw[subA].left)/2);
          const x1=(subB===r.b)?(lw[subB].right+rightPad):((lw[subB].right+lw[subB+1].left)/2);
          const rect=document.createElementNS(NS,'rect');
          rect.setAttribute('x',x0); rect.setAttribute('y',top);
          rect.setAttribute('width',Math.max(0,x1-x0)); rect.setAttribute('height',h);
          rect.setAttribute('fill',subColor);
          rectG.appendChild(rect);
          subA=j; subColor=c;
        }
      }
    });

    const hitTop=baseline-cap-padVWhole;

    if(caretTarget){
      const cw=lw.find(o=>o.gidx===caretTarget.gidx);
      if(cw){
        const caretX=cw.left+textWidth(cw.text.slice(0,caretTarget.charsIntoWord),style);
        const caret=document.createElementNS(NS,'rect');
        caret.setAttribute('x',caretX); caret.setAttribute('y',hitTop);
        caret.setAttribute('width',Math.max(2,size*0.012)); caret.setAttribute('height',refBlockH);
        caret.setAttribute('fill',wordFontColor(cw.gidx)||fontColor);
        caret.setAttribute('class','text-caret');
        caretG.appendChild(caret);
      }
    }

    lw.forEach(function(w){
      const hit=document.createElementNS(NS,'rect');
      hit.setAttribute('x',w.left); hit.setAttribute('y',hitTop);
      hit.setAttribute('width',w.right-w.left); hit.setAttribute('height',refBlockH);
      hit.setAttribute('fill','transparent');
      hit.setAttribute('class','hit-word');
      hit.setAttribute('data-ctx','own');
      hit.style.cursor='pointer';
      hit.addEventListener('mousedown',function(ev){
        /* Root fix: an SVG rect isn't focusable, so mousedown here would
           otherwise let the browser blur the sidebar Text field by default —
           right before the resulting 'click' handler tries to focus it again
           and move the cursor. Every earlier attempt at this was reacting to
           that blur after the fact (deferred renders, timing heuristics);
           preventing it from happening at all removes the whole race. */
        if(ev.button===0) ev.preventDefault();
      });
      hit.addEventListener('click',function(ev){
        /* Every click jumps the cursor to the nearest character, mid-word
           included — there's no real in-canvas text input here (the canvas
           has its own wrap engine, independent of the browser's text
           layout), just a fake blinking caret drawn at the resulting cursor
           position. Double-click detection is done ourselves (by gidx +
           timestamp) rather than trusting the browser's native 'dblclick':
           every click here also calls render(), which replaces this exact
           DOM element, and once the element a double-click's two clicks
           landed on differs between them, browsers can stop recognising it
           as one gesture — native ev.detail/'dblclick' turned out not to be
           reliable enough for that reason. A genuine double-click still also
           jumps the cursor once (from its first click) before toggling. */
        const now=Date.now();
        const isDouble=lastWordClick&&lastWordClick.gidx===w.gidx&&(now-lastWordClick.t)<500;
        lastWordClick={gidx:w.gidx,t:now};
        const p=svgPoint(ev);
        const n=charIndexInWord(w.text,style,p.x-w.left);
        focusFieldAt('text',wordCharOffset(S.text,w.gidx)+n);
        if(isDouble){
          lastWordClick=null;
          pushHistory();
          if(S.off[w.gidx]) delete S.off[w.gidx]; else S.off[w.gidx]=1;
          render();
        }
      });
      hit.addEventListener('contextmenu',function(ev){
        ev.preventDefault();
        openWordPopover(w.gidx,ev.clientX,ev.clientY);
      });
      hitG.appendChild(hit);
    });
  });
  lastWords=words;

  /* the last visual line's own padded right edge — the date follows that
     specific line's highlight box, not the widest line in the block */
  const contentRight=(lastLineRightEdge!=null)?lastLineRightEdge:(targetLeft+maxW);
  const titleBottom=firstBaseline+(visualLines.length-1)*pitch+padVWhole;

  /* ---- draw subtitle ---- */
  /* Clickable like the title: left-click drops the cursor into the Subtitle
     field at the nearest character (measuring prefix widths the same way
     charIndexInWord does for title words — one hit-rect per line is enough
     since there's no per-word state to key here), right-click opens its
     colour-preset combo. A fake caret is drawn the same way as the title's. */
  const activeSubField=(document.activeElement===$('subtitle'))?$('subtitle'):null;
  const subCaretOffset=activeSubField?activeSubField.selectionStart:null;
  if(subLines.length){
    let sy=frameY-subGapPx-subM.desc;
    for(let i=subLines.length-1;i>=0;i--){
      const lineText=subLines[i];
      const lineStart=subLines.slice(0,i).reduce((a,l)=>a+l.length+1,0);
      const t=document.createElementNS(NS,'text');
      t.setAttribute('style',subStyle); t.setAttribute('fill',S.subColor);
      if(subIsPlaceholder) t.setAttribute('opacity','0.35');
      t.setAttribute('x',targetLeft); t.setAttribute('y',sy);
      t.textContent=lineText;
      subG.appendChild(t);

      if(lineText.trim()){
        if(!subIsPlaceholder) lastGlyphRuns.push({text:lineText,x:targetLeft,y:sy,size:subSize,wght:350,wdth:100,trackingPx:trackPct*subSize/100,fill:S.subColor,anchor:'start'});
        const bb=t.getBBox();
        const hit=document.createElementNS(NS,'rect');
        hit.setAttribute('x',bb.x); hit.setAttribute('y',sy-subM.cap);
        hit.setAttribute('width',bb.width); hit.setAttribute('height',subM.cap+subM.desc);
        hit.setAttribute('fill','transparent');
        hit.setAttribute('data-ctx','own');
        hit.style.cursor='text';
        hit.addEventListener('mousedown',function(ev){ if(ev.button===0) ev.preventDefault(); });
        hit.addEventListener('click',function(ev){
          const p=svgPoint(ev);
          const n=charIndexInWord(lineText,subStyle,p.x-bb.x);
          focusFieldAt('subtitle',lineStart+n);
        });
        hit.addEventListener('contextmenu',function(ev){
          ev.preventDefault();
          openSubtitlePopover(ev.clientX,ev.clientY);
        });
        hitG.appendChild(hit);

        if(subCaretOffset!=null&&subCaretOffset>=lineStart&&subCaretOffset<=lineStart+lineText.length){
          const caretX=bb.x+textWidth(lineText.slice(0,subCaretOffset-lineStart),subStyle);
          const caret=document.createElementNS(NS,'rect');
          caret.setAttribute('x',caretX); caret.setAttribute('y',sy-subM.cap);
          caret.setAttribute('width',Math.max(2,size*0.012)); caret.setAttribute('height',subM.cap+subM.desc);
          caret.setAttribute('fill',S.subColor);
          caret.setAttribute('class','text-caret');
          caretG.appendChild(caret);
        }
      }
      sy-=subPitch;
    }
  }

  /* ---- draw date ---- */
  /* Its own highlight box, right edge flush with the title's rightmost content
     and top edge flush with the title block's bottom (DATE_GAP=0) so it reads
     as touching the last line, the way the reference layout does. */
  if(S.dateOn){
    const boxRight=contentRight;
    const boxLeft=boxRight-dateW;
    const boxTop=titleBottom+dateGapPx;
    const rect=document.createElementNS(NS,'rect');
    rect.setAttribute('x',boxLeft); rect.setAttribute('y',boxTop);
    rect.setAttribute('width',dateW); rect.setAttribute('height',dateH);
    rect.setAttribute('fill',S.datePadColor);
    dateG.appendChild(rect);

    const t=document.createElementNS(NS,'text');
    t.setAttribute('style',dateStyle); t.setAttribute('fill',S.dateColor);
    t.setAttribute('text-anchor','end');
    t.setAttribute('x',boxRight-datePadR);
    t.setAttribute('y',boxTop+datePadV+dateCap);
    t.textContent=dateStr;
    dateG.appendChild(t);
    lastGlyphRuns.push({text:dateStr,x:boxRight-datePadR,y:boxTop+datePadV+dateCap,size:dateSize,wght:450,wdth:100,trackingPx:trackPct*dateSize/100,fill:S.dateColor,anchor:'end'});

    /* A dedicated transparent hit-rect, not the visible shapes themselves —
       same reasoning as the word/subtitle hit-rects: hit-testing directly on
       painted text can miss between glyphs, where a plain rect covering the
       full box always catches the click reliably. Right-click for its
       colour menu, same convention as title words and the subtitle. */
    const dateHit=document.createElementNS(NS,'rect');
    dateHit.setAttribute('x',boxLeft); dateHit.setAttribute('y',boxTop);
    dateHit.setAttribute('width',dateW); dateHit.setAttribute('height',dateH);
    dateHit.setAttribute('fill','transparent');
    dateHit.setAttribute('class','hit-date');
    dateHit.setAttribute('data-ctx','own');
    dateHit.style.cursor='pointer';
    dateHit.addEventListener('contextmenu',function(ev){
      ev.preventDefault();
      openDatePopover(ev.clientX,ev.clientY);
    });
    hitG.appendChild(dateHit);
  }

  /* ---- frame resize handle ---- */
  /* the frame can only be resized (its wrap width), never moved — position
     always follows autoX/autoY above, so the block stays centred on canvas */
  const fx=autoX, fy=autoY;
  const fw=S.frame.width==null?Math.max(MIN_FRAME_W,maxW):S.frame.width;
  /* Handles are sized in SVG units scaled by the current on-screen px-per-unit
     ratio, so they stay a constant, grabbable screen size at any zoom level —
     without this, zooming out shrinks them to an unclickable sliver. */
  const screenScale=(board.getBoundingClientRect().width/1920)||1;
  const handleSize=18/screenScale;
  /* the outline is purely a visual guide — clamp what's drawn so it never
     visually runs past the canvas edge, even though fw itself (the wrap
     boundary) can be wider than what's actually visible here */
  const outlineW=Math.max(0,Math.min(fw,1920-fx));

  const outline=document.createElementNS(NS,'rect');
  outline.setAttribute('x',fx); outline.setAttribute('y',fy);
  outline.setAttribute('width',outlineW); outline.setAttribute('height',Math.max(titleH,refBlockH));
  outline.setAttribute('fill','none'); outline.setAttribute('stroke','#2F6F62');
  outline.setAttribute('stroke-width',2/screenScale); outline.setAttribute('stroke-dasharray',(8/screenScale)+','+(6/screenScale));
  outline.setAttribute('opacity',0.55);
  frameG.appendChild(outline);

  const resizeH=document.createElementNS(NS,'rect');
  resizeH.setAttribute('x',fx+outlineW-handleSize*0.5); resizeH.setAttribute('y',fy+Math.max(titleH,refBlockH)/2-handleSize*0.64);
  resizeH.setAttribute('width',handleSize); resizeH.setAttribute('height',handleSize*1.27);
  resizeH.setAttribute('fill','#2F6F62'); resizeH.setAttribute('class','frame-handle resize');
  frameG.appendChild(resizeH);

  attachDrag(resizeH);

  /* Keeps the Highlight/Un-highlight all toggle's label matching real
     state even when nothing about it was clicked directly — a per-word
     double-click, a right-click popover swap, anything touching S.off runs
     through render(), so this always ends up current. */
  $('taToggleAllBtn').textContent=toggleHighlightAllLabel();
}

/* ---------- frame dragging ---------- */
function svgPoint(evt){
  const pt=board.createSVGPoint();
  pt.x=evt.clientX; pt.y=evt.clientY;
  return pt.matrixTransform(board.getScreenCTM().inverse());
}
function attachDrag(el){
  el.addEventListener('pointerdown',function(e){
    e.preventDefault(); e.stopPropagation();
    ensureFrame();
    pushHistory();
    const start=svgPoint(e);
    const startFrame={width:S.frame.width};
    function onMove(ev){
      const p=svgPoint(ev);
      const dx=p.x-start.x;
      S.frame.width=clamp(startFrame.width+dx,MIN_FRAME_W,MAX_FRAME_W);
      syncInputs(); render();
    }
    function onUp(){
      window.removeEventListener('pointermove',onMove);
      window.removeEventListener('pointerup',onUp);
    }
    window.addEventListener('pointermove',onMove);
    window.addEventListener('pointerup',onUp);
  });
}

/* ---------- export ---------- */
/* An SVG loaded into an Image can't reach the document's own stylesheets, so
   the @font-face declaration has to be duplicated inside the SVG itself. Since
   the font is already embedded as base64 in the page (#fontFace), this is just
   copying that text — no network fetch, works fully offline. UI-only layers
   (drag handles, click hit-boxes) are stripped before export, and the crop is
   taken from the content group's own bounding box so the PNG is pixel-tight. */
async function buildExportSVG(){
  /* Forces a fresh measurement pass right before export. Without this, a
     render() from before the (locally-embedded, but still asynchronously
     parsed) variable font finished loading can leave lastWords sized against
     a fallback font — invisible on screen, since the painted glyphs re-swap
     to the real font automatically once it's ready regardless of any JS
     re-render, but it would still leave the highlight rects/crop bbox
     computed from the stale, wrong-font measurements. */
  render();
  const contentEl=board.querySelector('.ui-content');
  const bbox=contentEl.getBBox();
  if(bbox.width<1||bbox.height<1){ throw new Error('nothing to export'); }

  const svg=board.cloneNode(true);
  svg.querySelectorAll('.ui-only').forEach(n=>n.remove());
  /* the clone inherits board's live on-screen zoom sizing (inline
     width/height px, plus max-height:none once zoom has ever run) — left in
     place, that overrides the width/height attributes set below for export
     (CSS always wins over presentation attributes), scaling the output by
     whatever the editor's zoom happened to be and clipping off whatever
     falls outside it (wrapped lines included) at any zoom other than 100% */
  svg.style.width=''; svg.style.height=''; svg.style.maxHeight=''; svg.style.transform='';
  svg.setAttribute('xmlns',NS);
  svg.setAttribute('viewBox',bbox.x+' '+bbox.y+' '+bbox.width+' '+bbox.height);
  const fontB64=bytesToBase64(await getFontBytes());
  const st=document.createElementNS(NS,'style');
  st.textContent="@font-face{font-family:'Hubot Sans';src:url(data:font/ttf;base64,"+fontB64+") format('truetype');font-weight:200 900;font-stretch:75% 125%;}";
  svg.insertBefore(st,svg.firstChild);
  return {svg:svg, bbox:bbox};
}

/* The SVG stays vector until the final canvas draw, so rendering the source
   at bbox size but drawing it onto a canvas scaled up by exportScale makes
   the browser re-rasterise the text/shapes at that higher resolution — crisp
   edges instead of blowing up an already-rasterised bitmap. Getting a truly
   crisp result depends on that rasterisation happening at EXACTLY the
   canvas's own pixel size: the SVG's width/height attributes used to be set
   to the raw, fractional bbox.width*scale while the canvas rounded up to the
   next whole pixel, so the two never quite matched — drawImage then had to
   resample by that fraction of a pixel to fit one into the other, softening
   the entire image slightly. Rounding once and reusing that exact figure for
   both removes the mismatch, so the copy onto the canvas is pixel-for-pixel
   with nothing to resample. */
/* Downsamples in successive halving steps rather than one big jump straight
   to the target size. A single huge-ratio drawImage (e.g. 10x -> 1x) only
   bilinear-samples a handful of source pixels per output pixel, quietly
   discarding most of the extra resolution it was supposed to be using;
   halving repeatedly means every step stays within the ratio the browser's
   own resampler actually filters well, so each output pixel ends up an
   average of the FULL block of source pixels behind it — genuine
   supersampling instead of a fancier-looking crop. */
function downsampleCanvas(src,targetW,targetH){
  let cur=src, curW=cur.width, curH=cur.height;
  while(curW>targetW*2 && curH>targetH*2){
    const nextW=Math.max(targetW,Math.round(curW/2)), nextH=Math.max(targetH,Math.round(curH/2));
    const next=document.createElement('canvas');
    next.width=nextW; next.height=nextH;
    const nctx=next.getContext('2d');
    nctx.imageSmoothingQuality='high';
    nctx.drawImage(cur,0,0,nextW,nextH);
    cur=next; curW=nextW; curH=nextH;
  }
  const final=document.createElement('canvas');
  final.width=targetW; final.height=targetH;
  const fctx=final.getContext('2d');
  fctx.imageSmoothingQuality='high';
  fctx.drawImage(cur,0,0,targetW,targetH);
  return final;
}
async function exportPNG(scale,btn){
  btn.disabled=true; flash('Preparing export…');
  try{
    const built=await buildExportSVG();
    const svg=built.svg, bbox=built.bbox;
    const outW=Math.round(bbox.width*scale), outH=Math.round(bbox.height*scale);
    /* Supersample: rasterise at up to 10x the target size, then downsample
       back down to it, so the exported pixels are an average of a much
       denser render rather than a single direct sample — smoother curves
       and diagonals than rasterising once at the final size. Capped so the
       intermediate canvas can't exceed browsers' own size limits (~16384px
       per side on most engines, tighter on Safari); ssFactor only backs off
       from 10x when the target itself is already large enough to need it. */
    const MAX_SS_DIM=10000;
    const ssFactor=clamp(MAX_SS_DIM/Math.max(outW,outH),1,10);
    const ssW=Math.round(outW*ssFactor), ssH=Math.round(outH*ssFactor);
    svg.setAttribute('width',ssW); svg.setAttribute('height',ssH);
    const xml=new XMLSerializer().serializeToString(svg);
    const img=new Image();
    img.onload=function(){
      const ssCanvas=document.createElement('canvas');
      ssCanvas.width=ssW; ssCanvas.height=ssH;
      const sctx=ssCanvas.getContext('2d');
      sctx.imageSmoothingQuality='high';
      sctx.drawImage(img,0,0,ssW,ssH);
      const cv=downsampleCanvas(ssCanvas,outW,outH); /* left transparent on purpose */
      const a=document.createElement('a');
      a.download=slugify(S.text)+'.png';
      a.href=cv.toDataURL('image/png'); a.click();
      btn.disabled=false; flash('PNG downloaded, '+cv.width+' × '+cv.height+' ('+scale+'×), supersampled '+ssFactor.toFixed(1)+'x, transparent.');
    };
    img.onerror=function(){ btn.disabled=false; flash('Export failed while rasterising.'); };
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
  }catch(e){
    btn.disabled=false;
    flash('Export failed — '+e.message);
  }
}
$('exportPng1Btn').addEventListener('click',function(){ closeAllMenus(); exportPNG(1,this); });
$('exportPng2Btn').addEventListener('click',function(){ closeAllMenus(); exportPNG(2,this); });

/* The font now lives in its own file (hubot-sans.ttf) instead of being
   inlined as page-context base64 — fetched once and cached, since both the
   HarfBuzz outline step and the PNG export's embedded-@font-face step need
   the raw bytes at runtime (an <img>-rasterised SVG can't reach external
   resources at all, so that one still has to inline them as base64 itself,
   just built from these fetched bytes instead of a DOM <style> tag). */
let fontBytesPromise=null;
function getFontBytes(){
  if(!fontBytesPromise) fontBytesPromise=fetch('hubot-sans.ttf').then(r=>r.arrayBuffer());
  return fontBytesPromise;
}
function bytesToBase64(buf){
  const bytes=new Uint8Array(buf);
  let bin='';
  for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
  return btoa(bin);
}
/* ---------- SVG text-to-outline (HarfBuzz) ---------- */
/* Traces every glyph to a real path instead of leaving live <text> behind an
   embedded @font-face — most illustration apps don't reliably honour an
   SVG's own @font-face, and Hubot Sans's variable weight/width axes
   definitely wouldn't survive being re-rendered against whatever default
   font a viewer falls back to. This shapes with the actual HarfBuzz engine
   (WASM, embedded above, offline) rather than a plain glyph-outline parser —
   a first attempt with opentype.js produced visibly wrong glyphs on this
   font (a mirrored 'k', among other issues) because it doesn't fully
   implement variable-font composite-glyph interpolation or this font's GSUB
   features; HarfBuzz is the real engine browsers themselves use for text
   shaping, so it resolves both correctly by construction, not by ad-hoc
   fixes. */
let hbFontCache=null;
async function getHBFont(){
  if(hbFontCache) return hbFontCache;
  await window.__hbReadyPromise;
  const hb=window.HB;
  const buf=await getFontBytes();
  const blob=new hb.Blob(buf);
  const face=new hb.Face(blob,0);
  const font=new hb.Font(face);
  const upm=face.upem;
  font.setScale(upm,upm);
  hbFontCache={hb:hb,font:font,upm:upm};
  return hbFontCache;
}
/* Same OpenType features the canvas renders with (font-feature-settings in
   fontStyle()/featureSettings()) — HarfBuzz doesn't infer these from a CSS
   string, they have to be requested explicitly at shape time. Letter-spacing
   (trackingPx) is a CSS effect, not a shaping concept, so it's added
   manually between glyphs afterward, same as advances. */
async function buildOutlinePaths(){
  const {hb,font,upm}=await getHBFont();
  const features=[new hb.Feature('tnum',1),new hb.Feature('ss02',1),new hb.Feature('ss03',1)];
  const groups=[];
  lastGlyphRuns.forEach(function(r){
    font.setVariations([new hb.Variation('wght',r.wght),new hb.Variation('wdth',r.wdth)]);
    const buffer=new hb.Buffer();
    buffer.addText(r.text);
    buffer.guessSegmentProperties();
    hb.shape(font,buffer,features);
    const glyphs=buffer.getGlyphInfosAndPositions();
    const scale=r.size/upm;
    let totalW=0;
    glyphs.forEach(function(g,i){ totalW+=g.xAdvance*scale; if(i<glyphs.length-1) totalW+=r.trackingPx; });
    let x=(r.anchor==='end')?(r.x-totalW):r.x;
    const items=[];
    glyphs.forEach(function(g,i){
      const d=font.glyphToPath(g.codepoint);
      if(d&&d.trim()){
        const gx=x+g.xOffset*scale, gy=r.y-g.yOffset*scale;
        items.push({d:d,gx:gx,gy:gy,scale:scale});
      }
      x+=g.xAdvance*scale;
      if(i<glyphs.length-1) x+=r.trackingPx;
    });
    if(items.length) groups.push({fill:r.fill,items:items});
  });
  return groups;
}

async function exportSVG(btn){
  closeAllMenus();
  btn.disabled=true; flash('Preparing export…');
  try{
    const built=await buildExportSVG();
    const svg=built.svg, bbox=built.bbox;
    svg.setAttribute('width',bbox.width); svg.setAttribute('height',bbox.height);

    const groups=await buildOutlinePaths();
    svg.querySelectorAll('text').forEach(function(n){ n.remove(); });
    const outlineG=document.createElementNS(NS,'g');
    groups.forEach(function(grp){
      const g=document.createElementNS(NS,'g');
      g.setAttribute('fill',grp.fill);
      grp.items.forEach(function(it){
        const p=document.createElementNS(NS,'path');
        p.setAttribute('d',it.d);
        p.setAttribute('transform','translate('+it.gx.toFixed(2)+','+it.gy.toFixed(2)+') scale('+it.scale.toFixed(6)+',-'+it.scale.toFixed(6)+')');
        g.appendChild(p);
      });
      outlineG.appendChild(g);
    });
    (svg.querySelector('.ui-content')||svg).appendChild(outlineG);
    /* no live text left, so the embedded @font-face is dead weight now —
       dropping it shrinks the file by roughly the size of the font itself */
    const styleEl=svg.querySelector('style');
    if(styleEl) styleEl.remove();

    const xml=new XMLSerializer().serializeToString(svg);
    const blob=new Blob([xml],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.download=slugify(S.text)+'.svg';
    a.href=url; a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
    btn.disabled=false; flash('SVG downloaded, '+Math.round(bbox.width)+' × '+Math.round(bbox.height)+', text outlined, transparent.');
  }catch(e){
    btn.disabled=false;
    flash('Export failed — '+e.message);
  }
}
$('exportSvgBtn').addEventListener('click',function(){ exportSVG(this); });

/* ---------- boot ---------- */
function measureHeader(){
  const h=document.querySelector('header');
  if(h) document.documentElement.style.setProperty('--hh',h.offsetHeight+'px');
  /* the 100%-zoom baseline depends on viewport/header size (see
     measureFitWidth) — keep it current and reapply the user's zoom level
     against it */
  if(typeof measureFitWidth==='function'){ measureFitWidth(); setZoom(S.zoom); }
}
window.addEventListener('resize',function(){ measureHeader(); });
if(document.fonts&&document.fonts.ready){
  document.fonts.ready.then(function(){ measureHeader(); render(); });
}
syncInputs();
updateHistButtons();
measureHeader(); render();
