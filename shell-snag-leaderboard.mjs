function element(tag, text, className) {
  const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;
}
for(const host of document.querySelectorAll('[data-shell-leaderboard]')) {
  let mode='timed',sequence=0;
  host.classList.add('shell-board');
  host.append(element('h2','Shell Snag Leaderboard'));
  host.append(element('p','Best completed run per wallet, ranked by game score. Clams shown belong to that run.','shell-board-note'));
  const controls=element('div',undefined,'shell-board-tabs');controls.setAttribute('role','group');controls.setAttribute('aria-label','Shell Snag mode');
  const buttons=[];
  for(const [value,label] of [['timed','3-Minute Run'],['endless','Endless']]){
    const button=element('button',label);button.type='button';button.dataset.mode=value;button.setAttribute('aria-pressed',String(value===mode));
    button.addEventListener('click',()=>{mode=value;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));void load();});
    buttons.push(button);controls.append(button);
  }
  host.append(controls);
  const status=element('p','Loading…','shell-board-note');status.setAttribute('role','status');host.append(status);
  const wrap=element('div',undefined,'shell-board-scroll'),table=element('table');table.setAttribute('aria-label','Shell Snag wallet rankings');
  const head=element('thead'),heading=element('tr');for(const label of ['Rank','Full wallet address','Game score','Clams earned']){const th=element('th',label);th.scope='col';heading.append(th);}head.append(heading);table.append(head);
  const rows=element('tbody');table.append(rows);wrap.append(table);host.append(wrap);
  function message(text){rows.replaceChildren();const tr=element('tr'),td=element('td',text);td.colSpan=4;tr.append(td);rows.append(tr);}
  async function load(){
    const request=++sequence;status.textContent=`${mode==='timed'?'3-Minute Run':'Endless'} · Loading…`;message('Loading rankings…');
    try {
      const response=await fetch(`/api/rewards/leaderboard?game=shell-snag&mode=${mode}&limit=25`,{cache:'no-store'});
      const data=await response.json();if(request!==sequence)return;
      if(!response.ok||!data.ok)throw Error('Leaderboard temporarily unavailable.');
      if(data.configured===false){status.textContent='Leaderboard storage is not configured.';message('Rankings will appear once storage is connected.');return;}
      rows.replaceChildren();
      for(const [index,row] of (data.rows||[]).entries()){
        const tr=element('tr');tr.append(element('td',String(index+1)));
        const wallet=element('td');wallet.append(element('code',row.wallet||'—','shell-board-wallet'));tr.append(wallet);
        tr.append(element('td',Number(row.points||0).toLocaleString()));tr.append(element('td',Number(row.shells||0).toLocaleString()));rows.append(tr);
      }
      status.textContent=`${mode==='timed'?'3-Minute Run':'Endless'} · ${(data.rows||[]).length?'Live rankings':'No completed runs yet'}`;
      if(!data.rows?.length)message('Finish a signed-in run in this mode to appear here.');
    }catch{if(request!==sequence)return;status.textContent='Leaderboard temporarily unavailable.';message('Please try again shortly.');}
  }
  void load();window.setInterval(()=>{if(!document.hidden)void load();},15000);
}
