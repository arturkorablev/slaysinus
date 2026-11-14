(() => {
  'use strict';
  const nominations = [
    {
        "id": "drunk",
        "name": "Алкаш года"
    },
    {
        "id": "team",
        "name": "Команда года"
    },
    {
        "id": "ragebait",
        "name": "Рейджбайтер года"
    },
    {
        "id": "breakthrough",
        "name": "Молдован года"
    },
    {
        "id": "project",
        "name": "Проект года"
    },
    {
        "id": "meme",
        "name": "Мем года"
    },
    {
        "id": "achievement",
        "name": "Достижения года"
    },
    {
        "id": "arrival",
        "name": "Завоз года"
    },
    {
        "id": "deer",
        "name": "Deer’s King"
    },
    {
        "id": "doe",
        "name": "Deer’s Queen"
    }
];
  const STORAGE_KEY='slaysinus_2026_v3_local';
  const CONFIG_KEY='slaysinus_supabase_config_v1';
  // For a one-time public deployment setup, paste your Project URL and sb_publishable_ key here.
  // These values are public by design; NEVER use sb_secret_ or service_role here.
  const PUBLIC_SUPABASE_URL = '';
  const PUBLIC_SUPABASE_KEY = '';
  const VOTER_KEY='slaysinus_voter_id_v1';
  const USER_VOTES_KEY='slaysinus_user_votes_v1';
  const $=s=>document.querySelector(s);
  const state={candidates:[],counts:{},userVotes:loadUserVotes(),settings:{voting_open:true,results_published:true}};
  let db=null,adminUser=null,isAdmin=false,editingId=null,toastTimer=null,pollTimer=null,refreshInFlight=false;
  let localState=loadLocalState();
  const voterId=getVoterId();
  const submitterId=localStorage.getItem('slaysinus_submitter_id_v1')||uuid();
  localStorage.setItem('slaysinus_submitter_id_v1',submitterId);

  function uuid(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});}
  function getVoterId(){let v=localStorage.getItem(VOTER_KEY);if(!v){v=uuid();localStorage.setItem(VOTER_KEY,v);}return v;}
  function loadUserVotes(){try{return JSON.parse(localStorage.getItem(USER_VOTES_KEY)||'{}')||{};}catch{return {};}}
  function saveUserVotes(){try{localStorage.setItem(USER_VOTES_KEY,JSON.stringify(state.userVotes));}catch{}}
  function loadLocalState(){try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem('slaysinus_2026_v2')||'{}');return {candidates:Array.isArray(raw.candidates)?raw.candidates:[],votes:raw.votes&&typeof raw.votes==='object'?raw.votes:{}};}catch{return {candidates:[],votes:{}};}}
  function saveLocal(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(localState));return true;}catch{showToast('Не удалось сохранить локальные данные: возможно, слишком много фотографий.');return false;}}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function nById(id){return nominations.find(n=>n.id===id);}
  function plural(n,one,few,many){const x=Math.abs(n)%100,y=x%10;if(x>10&&x<20)return many;if(y>1&&y<5)return few;if(y===1)return one;return many;}
  function initials(name){return (String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('')||'?').toUpperCase();}
  function showToast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
  function setBadge(mode,label){const b=$('#connectionBadge');b.classList.remove('online','error');if(mode==='online')b.classList.add('online');if(mode==='error')b.classList.add('error');$('#connectionLabel').textContent=label;}
  function getNomId(c){return c.nomination_id||c.nomination;}
  function getPhoto(c){return c.media_type==='video'?'':(c.media_url||c.media_data||c.photo_url||c.photo||'');}
  function countVotes(candidateId){return Number(state.counts[candidateId]||0);}

  function avatar(c,small=false){const cls=small?'candidate-avatar result-avatar':'candidate-avatar';const photo=getPhoto(c);return photo?`<div class="${cls}"><img src="${escapeHtml(photo)}" alt="Фото ${escapeHtml(c.name)}" loading="lazy"></div>`:`<div class="${cls}">${escapeHtml(initials(c.name))}</div>`;}
  function fillSelects(){const opts=nominations.map(n=>`<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('');$('#nominationFilter').insertAdjacentHTML('beforeend',opts);$('#candidateNomination').innerHTML=opts;}
  function setModeUi(){
    const online=!!db;setBadge(online?'online':'local',online?'Онлайн':'Нет подключения');
    $('#modeWarning').textContent=online?'✓ Общая база подключена. Кандидаты и голоса синхронизируются между устройствами.':'Заявки и голосование временно недоступны. Попробуйте позже.';
    $('#addCandidateBtn').disabled=!online;
    $('#addCandidateBtn').textContent=canManage()?'＋ Добавить кандидата':'＋ Предложить кандидата';
    $('#votingStatus').textContent=!state.settings.voting_open?'Голосование закрыто организатором':(online?'Общая онлайн-база активна':'Голосование пока недоступно');
    $('#openAdminBtn').textContent=isAdmin?'♛ Панель организатора':'♛ Админ';
    $('#resetVotesBtn').hidden=!canManage();
    const importLabel=document.querySelector('.import-button');if(importLabel)importLabel.hidden=!canManage();
  }

  const VIDEO_CATEGORIES = new Set(['deer','doe','arrival','meme']);
  const mediaUrls = new Map();
  let formPreviewUrl = null;
  function canManage(){return !!db&&isAdmin;}
  function publishedCandidates(){return state.candidates.filter(c=>c.is_published!==false);}
  function candidateMedia(c){
    const url=c.media_url||c.media_data||c.photo_url||c.photo||'';
    if(!url)return '';
    return c.media_type==='video'
      ? `<video class="candidate-cover" src="${escapeHtml(url)}" controls playsinline preload="metadata" aria-label="Видео: ${escapeHtml(c.name)}"></video>`
      : `<img class="candidate-cover" src="${escapeHtml(url)}" alt="Фото: ${escapeHtml(c.name)}" loading="lazy" decoding="async">`;
  }
  function mediaFormState(){
    const allowed=VIDEO_CATEGORIES.has($('#candidateNomination').value);
    $('#candidatePhoto').accept=allowed?'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime':'image/jpeg,image/png,image/webp';
    $('#candidateMediaLabel').textContent=allowed?'Фото или видео':'Фото';
    $('#candidateMediaHint').textContent=allowed?'Фото до 8 МБ, видео MP4, WebM или MOV до 20 МБ.':'Фото JPEG, PNG или WebP до 8 МБ. Видео для этой категории недоступно.';
  }
  function renderCandidates(){
    const filter=$('#nominationFilter').value,query=$('#candidateSearch').value.trim().toLocaleLowerCase('ru');
    const visible=publishedCandidates();
    const filtered=visible.filter(c=>(filter==='all'||getNomId(c)===filter)&&(`${c.name} ${c.note||''}`).toLocaleLowerCase('ru').includes(query));
    $('#candidateCount').textContent=`${visible.length} ${plural(visible.length,'кандидат','кандидата','кандидатов')}`;
    const grid=$('#candidateGrid');
    if(!filtered.length){grid.innerHTML=`<div class="empty-state"><h3>${visible.length?'Ничего не найдено':'Ждём первых кандидатов'}</h3><p>${visible.length?'Попробуйте другой запрос или категорию.':'Предложите свой вариант. После проверки администратором он появится здесь.'}</p></div>`;return;}
    grid.innerHTML=filtered.map(c=>{
      const nom=nById(getNomId(c)),voted=state.userVotes[getNomId(c)]===c.id,count=countVotes(c.id),open=state.settings.voting_open;
      const cover=candidateMedia(c)||`<div class="candidate-cover candidate-cover-empty" aria-hidden="true">${escapeHtml(initials(c.name))}</div>`;
      return `<article class="candidate-card"><div class="candidate-visual">${cover}</div><div class="candidate-body"><span class="candidate-category">${escapeHtml(nom?.name||'Номинация')}</span><h3>${escapeHtml(c.name)}</h3><p class="candidate-note">${escapeHtml(c.note||'История этого кандидата ещё впереди.')}</p><div class="candidate-card-bottom"><span class="vote-count">${state.settings.results_published||isAdmin?`<strong>${count}</strong> ${plural(count,'голос','голоса','голосов')}`:'Количество голосов скрыто'}</span><button class="vote-button ${voted?'voted':''}" type="button" data-vote="${escapeHtml(c.id)}" ${open?'':'disabled'}>${!open?'Голосование закрыто':voted?'Ваш голос':'Голосовать'}</button></div>${canManage()?`<div class="candidate-card-tools"><button type="button" data-edit="${escapeHtml(c.id)}">Изменить</button><button type="button" data-delete="${escapeHtml(c.id)}">Удалить</button></div>`:''}</div></article>`;
    }).join('');
    grid.querySelectorAll('[data-vote]').forEach(b=>b.addEventListener('click',()=>vote(b.dataset.vote)));
    grid.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editCandidate(b.dataset.edit)));
    grid.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteCandidate(b.dataset.delete)));
  }
  function renderAdmin(){
    const logged=canManage()&&!!adminUser;
    $('#adminLoginBox').hidden=logged||!db;$('#adminDashboard').hidden=!logged;$('#localAdminNote').hidden=!!db;
    if(!logged){$('#adminCandidateList').replaceChildren();return;}
    $('#adminUserLabel').textContent=adminUser.email||'Администратор';
    $('#adminVotingState').textContent=state.settings.voting_open?'Открыто':'Закрыто';
    $('#adminVotingHint').textContent='Голосование за опубликованных кандидатов';
    $('#adminResultsState').textContent=state.settings.results_published?'Опубликованы':'Скрыты';
    $('#adminResultsHint').textContent='Настройка видимости итогов';
    $('#toggleVotingBtn').textContent=state.settings.voting_open?'Закрыть голосование':'Открыть голосование';
    $('#toggleResultsBtn').textContent=state.settings.results_published?'Скрыть результаты':'Опубликовать результаты';
    const list=$('#adminCandidateList');
    function rows(candidates){return candidates.map(c=>`<article class="moderation-card" data-moderation-id="${escapeHtml(c.id)}"><div class="moderation-preview">${candidateMedia(c)||avatar(c)}</div><div class="moderation-content"><span class="moderation-state">${c.is_published===false?'На проверке':'Опубликован'} · ${escapeHtml(nById(getNomId(c))?.name||'')}</span><h4>${escapeHtml(c.name)}</h4><p>${escapeHtml(c.note||'Без описания')}</p>${c.submitter_contact?`<p class="moderation-contact"><strong>Связь с отправителем:</strong> ${escapeHtml(c.submitter_contact)}</p>`:''}<div class="admin-row-actions"><button type="button" data-publish="${escapeHtml(c.id)}">${c.is_published===false?'Опубликовать':'Скрыть'}</button><button type="button" data-admin-edit="${escapeHtml(c.id)}">Изменить</button><button type="button" data-admin-delete="${escapeHtml(c.id)}">Удалить</button></div><form class="vote-adjust-form" data-count-form="${escapeHtml(c.id)}"><label>Количество голосов<input name="count" type="number" min="0" max="1000000" step="1" required value="${countVotes(c.id)}" aria-label="Голоса: ${escapeHtml(c.name)}"></label><button type="submit">Сохранить</button></form></div></article>`).join('');}
    const pending=state.candidates.filter(c=>c.is_published===false),visible=publishedCandidates();
    list.innerHTML=`<h3 class="moderation-heading">На проверке <span>${pending.length}</span></h3>${pending.length?rows(pending):'<p class="admin-empty">Новых предложений пока нет.</p>'}<h3 class="moderation-heading">Опубликованы <span>${visible.length}</span></h3>${rows(visible)}`;
    list.querySelectorAll('[data-admin-edit]').forEach(b=>b.addEventListener('click',()=>{closeDialog('adminDialog');editCandidate(b.dataset.adminEdit);}));
    list.querySelectorAll('[data-admin-delete]').forEach(b=>b.addEventListener('click',()=>deleteCandidate(b.dataset.adminDelete)));
    list.querySelectorAll('[data-publish]').forEach(b=>b.addEventListener('click',()=>setCandidateVisibility(b.dataset.publish)));
    list.querySelectorAll('[data-count-form]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();setCandidateCount(form.dataset.countForm,Number(form.elements.count.value),form.querySelector('button'));}));
  }
  async function setCandidateVisibility(id){
    if(!canManage())return;
    const c=state.candidates.find(c=>c.id===id);if(!c)return;
    try{
      if(db){const {error}=await db.from('candidates').update({is_published:c.is_published===false}).eq('id',id);if(error)throw error;await refreshRemote();}
      else{const old=c.is_published;c.is_published=c.is_published===false;if(!saveLocal()){c.is_published=old;return;}render();}
      showToast(c.is_published===false?'Видимость кандидата изменена.':'Настройка публикации сохранена.');
    }catch(err){showToast(prettyError(err));}
  }
  async function setCandidateCount(id,value,button){
    if(!canManage())return;
    if(!Number.isInteger(value)||value<0||value>1000000)return showToast('Введите целое число от 0 до 1000000.');
    button.disabled=true;
    try{
      if(db){const {error}=await db.rpc('set_slaysinus_vote_count',{p_candidate_id:id,p_count:value});if(error)throw error;await refreshRemote();}
      else{const c=state.candidates.find(c=>c.id===id);if(!c)throw new Error('Кандидат не найден');const old=c.vote_adjustment,actual=Object.values(localState.votes).filter(v=>v===id).length;c.vote_adjustment=value-actual;if(!saveLocal()){c.vote_adjustment=old;return;}rebuildLocalCounts();render();}
      showToast('Количество голосов сохранено.');
    }catch(err){showToast(prettyError(err));}finally{button.disabled=false;}
  }
  function openCandidateDialog(nomId=null,candidate=null){
    if(!db)return showToast('Предложения пока недоступны.');
    if(candidate&&!canManage())return;
    editingId=candidate?.id||null;$('#candidateForm').reset();
    if(formPreviewUrl){URL.revokeObjectURL(formPreviewUrl);formPreviewUrl=null;}
    $('#candidateMediaPreview').innerHTML=candidate?candidateMedia(candidate):'';
    $('#candidateRemoveMediaLabel').hidden=!candidate||!(candidate.media_path||candidate.media_data||getPhoto(candidate));
    $('#candidateFormError').textContent='';
    $('#dialogTitle').textContent=candidate?'Изменить кандидата':canManage()?'Добавить кандидата':'Предложить кандидата';
    $('#candidateSubmit').textContent=candidate?'Сохранить изменения':canManage()?'Опубликовать':'Отправить на проверку';
    $('#candidateModerationHint').hidden=canManage();
    if(nomId&&nById(nomId))$('#candidateNomination').value=nomId;
    if(candidate){$('#candidateNomination').value=getNomId(candidate);$('#candidateName').value=candidate.name||'';$('#candidateNote').value=candidate.note||'';$('#candidateContact').value=candidate.submitter_contact||'';}
    mediaFormState();openDialog('candidateDialog');setTimeout(()=>$('#candidateName').focus(),60);
  }
  async function uploadCandidateMedia(file,nomination){
    const video=file.type.startsWith('video/');
    if(video&&!VIDEO_CATEGORIES.has(nomination))throw new Error('Видео доступно только для Deer’s King, Deer’s Queen, Завоза и Мема года.');
    const videoTypes={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
    if(video&&!videoTypes[file.type])throw new Error('Выберите видео MP4, WebM или MOV.');
    if(video&&file.size>20*1024*1024)throw new Error('Максимальный размер видео: 20 МБ.');
    if(video&&!db&&file.size>2*1024*1024)throw new Error('В демо-режиме видео до 2 МБ. Для больших файлов подключите общую базу.');
    const blob=video?file:await resizeImage(file),type=video?'video':'image';
    if(db){const path=`submissions/${submitterId}/${uuid()}.${video?videoTypes[file.type]:'jpg'}`;const {error}=await db.storage.from('candidate-media').upload(path,blob,{contentType:video?file.type:'image/jpeg',upsert:false});if(error)throw error;return {media_path:path,media_type:type};}
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не удалось прочитать вложение'));reader.readAsDataURL(blob);});
    return {media_data:data,media_type:type};
  }
  async function saveCandidate(e){
    e.preventDefault();if(!db){$('#candidateFormError').textContent='Предложения пока недоступны.';return;}const name=$('#candidateName').value.trim(),nomination=$('#candidateNomination').value,note=$('#candidateNote').value.trim(),contact=$('#candidateContact').value.trim();
    if(!name||!nById(nomination))return;
    if(editingId&&!canManage())return;
    const submit=$('#candidateSubmit'),text=submit.textContent;submit.disabled=true;submit.textContent='Отправляем…';$('#candidateFormError').textContent='';
    try{
      const current=state.candidates.find(c=>c.id===editingId),file=$('#candidatePhoto').files[0],remove=$('#candidateRemoveMedia').checked;
      if(current&&getNomId(current)!==nomination&&canManage()&&!confirm('Сменить категорию? Голоса этого кандидата будут сброшены.'))return;
      let media=file?await uploadCandidateMedia(file,nomination):remove?{media_path:null,media_data:null,media_type:'image',photo_url:null,photo_path:null,photo:''}:{};
      if((media.media_type||current?.media_type)==='video'&&!VIDEO_CATEGORIES.has(nomination))throw new Error('Удалите или замените видео фотографией для этой категории.');
      const wasEditing=!!editingId,admin=canManage();
      if(db){
        if(admin){const payload={nomination_id:nomination,name,note,submitter_contact:contact,...media};delete payload.media_data;delete payload.photo;const result=editingId?await db.from('candidates').update(payload).eq('id',editingId):await db.from('candidates').insert({...payload,is_published:true});if(result.error)throw result.error;}
        else{const {error}=await db.rpc('submit_slaysinus_candidate',{p_nomination_id:nomination,p_name:name,p_note:note,p_submitter_id:submitterId,p_media_type:media.media_type||'image',p_media_path:media.media_path||null,p_contact:contact});if(error)throw error;}
        await refreshRemote();
      }else{
        const snapshot=JSON.stringify(localState);
        if(editingId){const index=localState.candidates.findIndex(c=>c.id===editingId);if(index<0)throw new Error('Кандидат не найден');if(getNomId(current)!==nomination){for(const [key,value] of Object.entries(localState.votes))if(value===editingId)delete localState.votes[key];media.vote_adjustment=0;}localState.candidates[index]={...localState.candidates[index],nomination,name,note,submitter_contact:contact,...media};}
        else localState.candidates.push({id:uuid(),nomination,name,note,submitter_contact:contact,...media,is_published:admin,created_at:new Date().toISOString()});
        if(!saveLocal()){localState=JSON.parse(snapshot);state.candidates=localState.candidates;throw new Error('Недостаточно места в браузере. Попробуйте файл меньшего размера.');}
        state.candidates=localState.candidates;rebuildLocalCounts();
      }
      closeDialog('candidateDialog');editingId=null;render();showToast(wasEditing?'Изменения сохранены.':admin?'Кандидат опубликован.':'Предложение отправлено! Оно появится после проверки администратором.');
    }catch(err){$('#candidateFormError').textContent=prettyError(err);}finally{submit.disabled=false;submit.textContent=text;}
  }
  function rebuildLocalCounts(){state.counts={};for(const id of Object.values(localState.votes))state.counts[id]=(state.counts[id]||0)+1;for(const c of localState.candidates)state.counts[c.id]=Math.max(0,(state.counts[c.id]||0)+(c.vote_adjustment||0));}
  async function refreshRemote(silent=false){
    if(!db||refreshInFlight)return;refreshInFlight=true;
    try{
      const [candRes,settingsRes,countsRes]=await Promise.all([db.from('candidates').select('id,nomination_id,name,note,photo_url,photo_path,created_at,is_published,media_type,media_path').order('created_at',{ascending:true}),db.from('site_settings').select('id,voting_open,results_published').eq('id',1).single(),db.rpc('get_slaysinus_vote_counts')]);
      if(candRes.error)throw candRes.error;if(settingsRes.error)throw settingsRes.error;if(countsRes.error)throw countsRes.error;
      const candidates=candRes.data||[];
      if(isAdmin){const contacts=await db.rpc('get_slaysinus_candidate_contacts');if(contacts.error)throw contacts.error;const byId=new Map((contacts.data||[]).map(c=>[c.candidate_id,c.contact]));candidates.forEach(c=>c.submitter_contact=byId.get(c.id)||'');}
      const paths=[...new Set(candidates.map(c=>c.media_path).filter(Boolean))],now=Date.now();
      const missing=paths.filter(path=>!mediaUrls.has(path)||mediaUrls.get(path).expires<now);
      if(missing.length){const {data,error}=await db.storage.from('candidate-media').createSignedUrls(missing,300);if(error)throw error;for(const entry of data||[])if(entry.signedUrl)mediaUrls.set(entry.path,{url:entry.signedUrl,expires:now+240000});}
      candidates.forEach(c=>{if(c.media_path)c.media_url=mediaUrls.get(c.media_path)?.url||'';});
      state.candidates=candidates;state.settings={voting_open:!!settingsRes.data.voting_open,results_published:!!settingsRes.data.results_published};state.counts={};(countsRes.data||[]).forEach(row=>state.counts[row.candidate_id]=Number(row.vote_count||0));render();setBadge('online','Онлайн · синхронно');
    }catch(err){setBadge('error','Ошибка синхронизации');if(!silent)showToast('Не удалось обновить базу: '+prettyError(err));}finally{refreshInFlight=false;}
  }

  function renderResults(){
    const grid=$('#resultsGrid');
    if(!state.settings.results_published&&!isAdmin){grid.innerHTML='<div class="result-hidden">🔒 Результаты пока засекречены организаторами.<br>Голоса принимаются, но интригу сохраним до церемонии.</div>';return;}
    const ordered = ['deer','doe'].map(nById).concat(nominations.filter(n=>!['deer','doe'].includes(n.id)));
    grid.innerHTML=ordered.map((n,i)=>{const major=['deer','doe'].includes(n.id);const mainClass=major?' major-result':'';const list=publishedCandidates().filter(c=>getNomId(c)===n.id);if(!list.length)return `<article class="result-card ${['deer','doe'].includes(n.id)?'major-result':''}"><span class="result-label">${['deer','doe'].includes(n.id)?'ГЛАВНАЯ НОМИНАЦИЯ':'Номинация '+String(i-1).padStart(2,'0')}</span><h3>${escapeHtml(n.name)}</h3><p class="result-empty">Пока нет кандидатов.</p></article>`;const ranked=list.map(c=>({candidate:c,votes:countVotes(c.id)})).sort((a,b)=>b.votes-a.votes||a.candidate.name.localeCompare(b.candidate.name,'ru'));const max=ranked[0].votes;if(max===0)return `<article class="result-card${mainClass}"><span class="result-label">${major?'ГЛАВНАЯ НОМИНАЦИЯ':'Номинация '+String(i-1).padStart(2,'0')}</span><h3>${escapeHtml(n.name)}</h3><p class="result-empty">Голосов пока нет. Борьба только начинается.</p></article>`;const leaders=ranked.filter(x=>x.votes===max);if(leaders.length>1)return `<article class="result-card${mainClass}"><span class="result-label">${major?'ГЛАВНАЯ · НИЧЬЯ':'Ничья'}</span><h3>${escapeHtml(n.name)}</h3><p class="result-tie">${leaders.map(x=>escapeHtml(x.candidate.name)).join(', ')} — по ${max} ${plural(max,'голосу','голоса','голосов')}.</p></article>`;const winner=ranked[0];return `<article class="result-card${mainClass}"><span class="result-label">${state.settings.results_published?'Победитель':'Лидер · виден администратору'}</span><h3>${escapeHtml(n.name)}</h3><div class="result-leader">${avatar(winner.candidate,true)}<div class="result-name">${escapeHtml(winner.candidate.name)}<span class="result-votes">${max} ${plural(max,'голос','голоса','голосов')}</span></div></div></article>`;}).join('');
  }

  let revealObserver=null;
  function initReveal(){
    if(!('IntersectionObserver' in window))return;
    if(!revealObserver){revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}}),{threshold:.12,rootMargin:'0px 0px -35px 0px'});}
    document.querySelectorAll('.section-head,.candidate-card,.result-card,.about-card,.sponsor,.sponsor-title').forEach(el=>{
      if(el.dataset.revealReady)return;el.dataset.revealReady='1';el.classList.add('reveal-item');revealObserver.observe(el);
    });
    document.documentElement.classList.add('reveal-enabled');
  }
  function render(){setModeUi();renderCandidates();renderResults();renderAdmin();initReveal();}
  function openDialog(id){const d=document.getElementById(id);if(d&&!d.open)d.showModal();}
  function closeDialog(id){const d=document.getElementById(id);if(d&&d.open)d.close();}

  function editCandidate(id){if(!canManage())return showToast('Редактировать кандидатов может только организатор.');const c=state.candidates.find(x=>x.id===id);if(c)openCandidateDialog(getNomId(c),c);}
  async function resizeImage(file){if(!file)return null;if(!file.type.startsWith('image/'))throw new Error('Выберите файл изображения.');if(file.size>8*1024*1024)throw new Error('Фото слишком большое. Максимум — 8 МБ.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error('Не удалось прочитать фото.'));r.onload=()=>resolve(r.result);r.readAsDataURL(file);});const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Не удалось открыть изображение.'));i.src=data;});const scale=Math.min(1,1200/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));}
  function prettyError(err){const msg=String(err?.message||err||'Неизвестная ошибка');if(/row-level security|permission denied/i.test(msg))return 'Недостаточно прав. Проверьте, что аккаунт добавлен в admin_users.';if(/candidate-media|bucket|is_published|media_type|schema cache|function.*not.*found/i.test(msg))return 'Обновите базу: выполните slaysinus_moderation_migration.sql в Supabase SQL Editor.';return msg.length>180?msg.slice(0,177)+'…':msg;}
  async function deleteCandidate(id){if(!canManage())return showToast('Удалять кандидатов может только организатор.');const c=state.candidates.find(x=>x.id===id);if(!c||!confirm(`Удалить кандидата «${c.name}»? Связанные голоса тоже будут удалены.`))return;try{if(db){const {error}=await db.from('candidates').delete().eq('id',id);if(error)throw error;await refreshRemote();}else{localState.candidates=localState.candidates.filter(x=>x.id!==id);for(const [nom,vote] of Object.entries(localState.votes))if(vote===id)delete localState.votes[nom];saveLocal();state.candidates=localState.candidates;rebuildLocalCounts();}render();showToast('Кандидат удалён.');}catch(err){showToast(prettyError(err));}}

  async function vote(id){if(!db)return showToast('Голосование пока недоступно.');const c=state.candidates.find(x=>x.id===id);if(!c||c.is_published===false)return;if(!state.settings.voting_open)return showToast('Голосование уже закрыто организатором.');const nom=getNomId(c);try{if(db){const {error}=await db.rpc('cast_slaysinus_vote',{p_nomination_id:nom,p_candidate_id:id,p_voter_id:voterId});if(error)throw error;}else{localState.votes[nom]=id;if(!saveLocal())return;rebuildLocalCounts();}state.userVotes[nom]=id;saveUserVotes();render();showToast('Голос принят! Да здравствует демократия 😈');}catch(err){showToast(prettyError(err));}}

  async function checkAdmin(user){adminUser=user||null;isAdmin=false;if(!db||!user){render();return false;}try{const {data,error}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;isAdmin=!!data;if(!isAdmin){adminUser=null;await db.auth.signOut();$('#adminLoginError').textContent='Этот аккаунт не добавлен в список администраторов.';}else $('#adminLoginError').textContent='';}catch(err){isAdmin=false;adminUser=null;$('#adminLoginError').textContent=prettyError(err);}render();return isAdmin;}
  let supabaseLoading = null;
  function loadSupabase() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (supabaseLoading) return supabaseLoading;
    supabaseLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      const timer = setTimeout(() => { script.remove(); supabaseLoading = null; reject(new Error('Не удалось загрузить Supabase. Проверьте соединение и попробуйте снова.')); }, 12000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); supabaseLoading = null; reject(new Error('Не удалось загрузить Supabase. Проверьте соединение и попробуйте снова.')); };
      document.head.append(script);
    });
    return supabaseLoading;
  }
  async function connectWithConfig(url,key,save=true){await loadSupabase();if(!window.supabase?.createClient)throw new Error('Supabase JS не загрузился. Проверьте интернет и обновите страницу.');const cleanUrl=url.trim().replace(/\/$/,'');if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleanUrl))throw new Error('Проверьте Project URL: ожидается адрес https://…supabase.co');if(!key.trim())throw new Error('Вставьте Publishable key или anon key.');const client=window.supabase.createClient(cleanUrl,key.trim());const test=await client.from('site_settings').select('id,voting_open,results_published').eq('id',1).single();if(test.error)throw new Error('Не удалось проверить базу. Сначала выполните slaysinus_supabase_setup.sql. Подробности: '+test.error.message);db=client;if(save)localStorage.setItem(CONFIG_KEY,JSON.stringify({url:cleanUrl,key:key.trim()}));const {data:{session}}=await db.auth.getSession();adminUser=session?.user||null;if(adminUser)await checkAdmin(adminUser);else{isAdmin=false;render();}db.auth.onAuthStateChange((_event,session)=>{setTimeout(async()=>{if(!session?.user){adminUser=null;isAdmin=false;render();}else await checkAdmin(session.user);},0);});await refreshRemote();if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(()=>{if(db&&!document.hidden)refreshRemote(true);},15000);return true;}
  async function startConfigured(){try{const saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');const embedded=(PUBLIC_SUPABASE_URL&&PUBLIC_SUPABASE_KEY)?{url:PUBLIC_SUPABASE_URL,key:PUBLIC_SUPABASE_KEY}:null;const c=embedded||(saved?.url&&saved?.key?saved:null);if(c?.url&&c?.key){$('#supabaseUrl').value=c.url;$('#supabaseKey').value=c.key;await connectWithConfig(c.url,c.key,false);}}catch(err){setBadge('error','Не подключено');$('#modeWarning').textContent='Не удалось подключиться к Supabase. Откройте «Онлайн» и проверьте настройки базы.';}}
  async function saveSettings(patch){if(!canManage())return showToast('Эта настройка доступна только администратору.');if(!db){Object.assign(state.settings,patch);render();return;}try{const {error}=await db.from('site_settings').update(patch).eq('id',1);if(error)throw error;await refreshRemote();showToast('Настройки премии обновлены.');}catch(err){showToast(prettyError(err));}}
  async function resetAllVotes(){if(!canManage())return showToast('Сброс доступен только администратору.');if(!db){if(!confirm('Сбросить все голоса в этом браузере?'))return;localState.votes={};localState.candidates.forEach(c=>c.vote_adjustment=0);saveLocal();rebuildLocalCounts();render();return;}if(!confirm('Точно удалить ВСЕ голоса всех участников? Номинанты останутся. Это действие нельзя отменить.'))return;try{const {error}=await db.rpc('reset_slaysinus_votes');if(error)throw error;state.userVotes={};saveUserVotes();await refreshRemote();showToast('Все голоса сброшены.');}catch(err){showToast(prettyError(err));}}
  function exportBackup(){const payload={app:'SlaySinus',version:3,exportedAt:new Date().toISOString(),candidates:(canManage()?state.candidates:publishedCandidates()).map(c=>({id:c.id,nomination_id:getNomId(c),name:c.name,note:c.note||'',photo_url:c.photo_url||c.photo||null,is_published:c.is_published!==false,media_type:c.media_type||'image',media_path:c.media_path||null,media_data:c.media_data||null})),voteCounts:state.counts,settings:state.settings};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='slaysinus-backup-v3.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Резервная копия подготовлена.');}
  async function importBackup(file){if(!canManage())return showToast('Импортировать номинантов может только администратор.');try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.candidates))throw new Error('Файл не похож на резервную копию SlaySinus.');const list=data.candidates.filter(c=>c&&typeof c.name==='string'&&nById(c.nomination_id||c.nomination));if(!confirm(`Добавить ${list.length} кандидатов из копии? Существующий список не будет удалён.`))return;if(db){const rows=list.map(c=>({nomination_id:c.nomination_id||c.nomination,name:c.name.slice(0,60),note:String(c.note||'').slice(0,180),is_published:c.is_published!==false,media_type:c.media_type||'image',media_path:c.media_path||null,photo_url:c.photo_url||null}));if(rows.length){const {error}=await db.from('candidates').insert(rows);if(error)throw error;}await refreshRemote();}else{for(const c of list)localState.candidates.push({id:uuid(),nomination:c.nomination_id||c.nomination,name:c.name,note:String(c.note||''),photo:c.photo_url||c.photo||'',is_published:c.is_published!==false,media_type:c.media_type||'image',media_path:c.media_path||null,media_data:c.media_data||null});saveLocal();state.candidates=localState.candidates;rebuildLocalCounts();render();}showToast('Кандидаты импортированы.');}catch(err){showToast(prettyError(err));}}

  // Main page interactions.
  $('#addCandidateBtn').addEventListener('click',()=>{openCandidateDialog($('#nominationFilter').value==='all'?null:$('#nominationFilter').value);});
  $('#candidateForm').addEventListener('submit',saveCandidate);
  $('#candidateNomination').addEventListener('change',mediaFormState);
  $('#candidatePhoto').addEventListener('change',()=>{
    if(formPreviewUrl)URL.revokeObjectURL(formPreviewUrl);
    const file=$('#candidatePhoto').files[0];if(!file)return;
    formPreviewUrl=URL.createObjectURL(file);const el=document.createElement(file.type.startsWith('video/')?'video':'img');el.src=formPreviewUrl;el.className='candidate-cover';if(el.tagName==='VIDEO'){el.controls=true;el.playsInline=true;}else el.alt='Предпросмотр фото';$('#candidateMediaPreview').replaceChildren(el);
  });
  $('#closeDialogBtn').addEventListener('click',()=>closeDialog('candidateDialog'));$('#cancelDialogBtn').addEventListener('click',()=>closeDialog('candidateDialog'));
  $('#candidateDialog').addEventListener('click',e=>{if(e.target===$('#candidateDialog'))closeDialog('candidateDialog');});
  $('#nominationFilter').addEventListener('change',renderCandidates);$('#candidateSearch').addEventListener('input',renderCandidates);
  document.querySelectorAll('button[data-nomination-id]').forEach(card=>{const open=()=>{const id=card.dataset.nominationId;if(!nById(id))return;$('#nominationFilter').value=id;$('#candidateSearch').value='';renderCandidates();$('#voting').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});showToast(`${nById(id).name}: список кандидатов`);};card.addEventListener('click',open);});
  $('#exportDataBtn').addEventListener('click',exportBackup);$('#importDataInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(file)await importBackup(file);e.target.value='';});$('#resetVotesBtn').addEventListener('click',()=>{if(!canManage())return;if(db)return resetAllVotes();if(!Object.keys(localState.votes).length)return showToast('Голосов пока нет.');if(!confirm('Сбросить голоса в этом браузере?'))return;localState.votes={};saveLocal();rebuildLocalCounts();state.userVotes={};saveUserVotes();render();showToast('Локальные голоса сброшены.');});

  // Supabase connection settings.
  $('#openConnectBtn').addEventListener('click',()=>openDialog('connectDialog'));
  $('#connectForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#connectSubmit');btn.disabled=true;btn.textContent='Проверяем…';$('#connectHelp').textContent='Проверяем URL, ключ и доступность таблицы site_settings…';try{await connectWithConfig($('#supabaseUrl').value,$('#supabaseKey').value,true);closeDialog('connectDialog');showToast('Общая база подключена. SlaySinus теперь онлайн!');}catch(err){$('#connectHelp').textContent=prettyError(err);showToast('Не удалось подключить базу.');}finally{btn.disabled=false;btn.textContent='Проверить и подключить ↗';}});
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.closeDialog)));

  // Admin panel and authentication.
  $('#openAdminBtn').addEventListener('click',()=>{renderAdmin();openDialog('adminDialog');if(db&&!isAdmin)setTimeout(()=>$('#adminEmail').focus(),60);});
  $('#adminLoginForm').addEventListener('submit',async e=>{e.preventDefault();if(!db){$('#adminLoginError').textContent='Сначала подключите общую базу.';return;}const btn=$('#adminLoginSubmit');btn.disabled=true;btn.textContent='Проверяем…';$('#adminLoginError').textContent='';try{const {data,error}=await db.auth.signInWithPassword({email:$('#adminEmail').value.trim()==='admin'?'admin@slaysinus.local':$('#adminEmail').value.trim(),password:$('#adminPassword').value});if(error)throw error;const ok=await checkAdmin(data.user);if(ok){$('#adminPassword').value='';await refreshRemote();showToast('Добро пожаловать, организатор 😈');}else throw new Error($('#adminLoginError').textContent||'Нет прав администратора.');}catch(err){$('#adminLoginError').textContent=prettyError(err);}finally{btn.disabled=false;btn.textContent='Войти в панель ↗';}});
  $('#adminSignOutBtn').addEventListener('click',async()=>{if(db)await db.auth.signOut();adminUser=null;isAdmin=false;mediaUrls.clear();$('#candidateMediaPreview').replaceChildren();$('#candidateForm').reset();closeDialog('candidateDialog');state.candidates=state.candidates.filter(c=>c.is_published!==false);render();if(db)await refreshRemote();showToast('Вы вышли из админ-панели.');});
  $('#adminAddCandidateBtn').addEventListener('click',()=>openCandidateDialog());
  $('#toggleVotingBtn').addEventListener('click',()=>saveSettings({voting_open:!state.settings.voting_open}));
  $('#toggleResultsBtn').addEventListener('click',()=>saveSettings({results_published:!state.settings.results_published}));
  $('#adminResetVotesBtn').addEventListener('click',resetAllVotes);
  document.querySelectorAll('.candidate-dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));

  const pageProgress=$('#pageProgress');
  let progressTick=false;
  window.addEventListener('scroll',()=>{if(progressTick)return;progressTick=true;requestAnimationFrame(()=>{const max=document.documentElement.scrollHeight-window.innerHeight;const ratio=max>0?window.scrollY/max:0;pageProgress.style.transform=`scaleX(${Math.max(0,Math.min(1,ratio))})`;progressTick=false;});},{passive:true});

  fillSelects();
  // Public data is loaded only from the shared database.
  state.candidates=[];state.counts={};render();
  startConfigured();
})();
