(async()=>{
 async function logout(){try{const response=await fetch('/auth/logout',{method:'POST'});if(!response.ok)throw Error();location.replace('/login.html')}catch{alert('로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')}}
 async function check(){const response=await fetch('/auth/session',{cache:'no-store'});if(!response.ok){location.replace('/login.html');return null}return response.json()}
 let session;try{session=await check()}catch{return}if(!session)return;
 const button=document.createElement('button');button.type='button';button.textContent='로그아웃';button.className='button secondary';button.onclick=logout;
 if(session.role==='coach'){const target=document.querySelector('header');const label=document.createElement('span');label.textContent=`${session.name} · 코치`;target.replaceChildren(label,button)}else{const old=document.querySelector('#role');if(old)old.hidden=true;document.querySelector('.profile')?.append(button)}
 window.addEventListener('pageshow',event=>{if(event.persisted)check().catch(()=>location.replace('/login.html'))});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check().catch(()=>{})});
})();
