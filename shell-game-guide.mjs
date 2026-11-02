const viewport=document.getElementById('shellSnagViewport');
const button=document.getElementById('shellSnagFullscreen');
const exit=document.getElementById('shellSnagExitFullscreen');
const status=document.getElementById('shellFullscreenStatus');
const frame=document.getElementById('shellSnagFrame');
const standalone=document.getElementById('shellSnagStandalone');
if(viewport&&button){
  button.addEventListener('click',async()=>{
    try{
      if(status)status.hidden=true;
      if(viewport.requestFullscreen)await viewport.requestFullscreen();
      else if(viewport.webkitRequestFullscreen)viewport.webkitRequestFullscreen();
      else throw Error('Unsupported');
    }catch{if(status){status.hidden=false;status.textContent='Full screen is unavailable in this browser. Use “Open game in a new tab” below.';}}
  });
  exit?.addEventListener('click',async()=>{
    try{if(document.pointerLockElement)document.exitPointerLock();if(document.exitFullscreen)await document.exitFullscreen();else document.webkitExitFullscreen?.();}catch{ /* Escape also exits fullscreen. */ }
  });
  const sync=()=>{const active=document.fullscreenElement===viewport||document.webkitFullscreenElement===viewport;button.setAttribute('aria-pressed',String(active));if(!active&&document.pointerLockElement){try{document.exitPointerLock();}catch{}}};
  document.addEventListener('fullscreenchange',sync);document.addEventListener('webkitfullscreenchange',sync);sync();
}
// Preserve the same profile session if the player uses the fallback link.
if(frame&&standalone){const sync=()=>{if(frame.src)standalone.href=frame.src;};frame.addEventListener('load',sync);sync();}
