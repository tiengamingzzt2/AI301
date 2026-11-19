(() => {
  const key='an-tin-interface-design',root=document.documentElement;
  let initial='classic';try{initial=localStorage.getItem(key)||'classic';}catch{}
  root.dataset.design=initial==='mecha'?'mecha':'classic';
  function sync(){
    const design=root.dataset.design;
    document.querySelectorAll('[data-design-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.designChoice===design)));
    const label=document.querySelector('#designLabel');if(label)label.textContent=design==='mecha'?'MECHA / Giao diện 02':'Glass / Giao diện 01';
    if(typeof syncThemeControl==='function')syncThemeControl();
    const theme=document.querySelector('#themeToggle');
    if(theme){theme.disabled=design==='mecha';if(design==='mecha'){theme.setAttribute('aria-checked','true');theme.title='MECHA sử dụng bảng màu tối riêng. Chọn Glass để dùng chế độ sáng/tối.';const status=document.querySelector('#themeStatus');if(status)status.textContent='Tối · MECHA';}}
  }
  function choose(design){
    if(!['classic','mecha'].includes(design))return;
    const commit=()=>{root.dataset.design=design;try{localStorage.setItem(key,design);}catch{}sync();};
    commit();
    const shell=document.querySelector('#workspaceShell');
    if(shell?.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)shell.animate([{opacity:.9},{opacity:1}],{duration:350,easing:'ease-out'});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const dialog=document.querySelector('#designDialog');
    document.querySelectorAll('[data-open-design]').forEach(button=>button.onclick=()=>{sync();dialog.showModal();});
    document.querySelector('#closeDesign').onclick=()=>dialog.close();
    document.querySelectorAll('[data-design-choice]').forEach(button=>button.onclick=()=>choose(button.dataset.designChoice));
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    sync();
    const robot=document.querySelector('#robotCharacter'),pause=document.querySelector('#pauseRobot'),companion=document.querySelector('.mecha-companion');
    let jumpTimer;
    robot.onclick=()=>{clearTimeout(jumpTimer);companion.classList.remove('robot-greeting');void robot.offsetWidth;companion.classList.add('robot-greeting');document.querySelector('#companionStatus').textContent='Đã sẵn sàng! Cùng xử lý dữ liệu nào.';jumpTimer=setTimeout(()=>companion.classList.remove('robot-greeting'),900);};
    pause.onclick=()=>{const paused=companion.classList.toggle('robot-paused');pause.setAttribute('aria-pressed',String(paused));pause.setAttribute('aria-label',paused?'Cho robot chạy tiếp':'Tạm dừng robot');pause.textContent=paused?'▷':'Ⅱ';};
    const label=document.querySelector('#currentStageLabel');
    new MutationObserver(()=>{document.querySelector('#companionStatus').textContent=label.textContent.replace(/^\d+\s*\/\s*/,'')+' · MECHA đồng hành';}).observe(label,{childList:true,characterData:true,subtree:true});
  });
})();
