const viewport=document.getElementById('shellSnagViewport');
const button=document.getElementById('shellSnagFullscreen');
const exit=document.getElementById('shellSnagExitFullscreen');
const status=document.getElementById('shellFullscreenStatus');
const frame=document.getElementById('shellSnagFrame');
const standalone=document.getElementById('shellSnagStandalone');
if(viewport&&button){
  let expanded=false,nativeWasActive=false,savedScroll=0,savedOverflow='';
  const nativeActive=()=>document.fullscreenElement===viewport||document.webkitFullscreenElement===viewport;
  const size=()=>{
    if(!expanded)return;
    const visible=window.visualViewport;
    viewport.style.setProperty('--shell-visible-height',`${Math.round(visible?.height||window.innerHeight)}px`);
    viewport.style.setProperty('--shell-visible-width',`${Math.round(visible?.width||window.innerWidth)}px`);
    viewport.style.setProperty('--shell-visible-top',`${Math.round(visible?.offsetTop||0)}px`);
    viewport.style.setProperty('--shell-visible-left',`${Math.round(visible?.offsetLeft||0)}px`);
  };
  const releasePointer=()=>{try{if(document.pointerLockElement)document.exitPointerLock();}catch{}};
  const collapse=()=>{
    if(!expanded)return;
    expanded=false;nativeWasActive=false;releasePointer();
    viewport.classList.remove('shell-game-expanded');document.body.classList.remove('shell-game-expanded-page');
    document.body.style.overflow=savedOverflow;button.setAttribute('aria-pressed','false');
    for(const name of ['height','width','top','left'])viewport.style.removeProperty(`--shell-visible-${name}`);
    window.scrollTo(0,savedScroll);button.focus({preventScroll:true});
  };
  const expand=()=>{
    if(expanded)return;
    savedScroll=window.scrollY;savedOverflow=document.body.style.overflow;expanded=true;
    viewport.classList.add('shell-game-expanded');document.body.classList.add('shell-game-expanded-page');
    document.body.style.overflow='hidden';button.setAttribute('aria-pressed','true');size();
    if(status)status.hidden=true;
  };
  button.addEventListener('click',async()=>{
    expand(); // Always give immediate feedback, even without native fullscreen support.
    try{
      if(viewport.requestFullscreen)await viewport.requestFullscreen();
      else if(viewport.webkitRequestFullscreen)viewport.webkitRequestFullscreen();
    }catch{ /* The expanded browser-window view is the supported fallback. */ }
    size();
  });
  const close=async()=>{
    releasePointer();
    try{if(nativeActive()){if(document.exitFullscreen)await document.exitFullscreen();else document.webkitExitFullscreen?.();}}
    catch{ /* Keep the explicit exit control available if native exit fails. */ }
    if(!nativeActive())collapse();
  };
  exit?.addEventListener('click',close);
  const sync=()=>{
    if(nativeActive()){nativeWasActive=true;button.setAttribute('aria-pressed','true');}
    else if(nativeWasActive)collapse();
  };
  const escape=event=>{if(event.key==='Escape'&&expanded&&!nativeActive()){event.preventDefault();void close();}};
  document.addEventListener('keydown',escape);
  document.addEventListener('fullscreenchange',sync);document.addEventListener('webkitfullscreenchange',sync);
  window.addEventListener('resize',size);window.visualViewport?.addEventListener('resize',size);window.visualViewport?.addEventListener('scroll',size);
  const bindFrame=()=>{try{frame?.contentDocument?.addEventListener('keydown',escape);}catch{}};
  frame?.addEventListener('load',bindFrame);bindFrame();
}
if(frame&&standalone){const sync=()=>{if(frame.src)standalone.href=frame.src;};frame.addEventListener('load',sync);sync();}
