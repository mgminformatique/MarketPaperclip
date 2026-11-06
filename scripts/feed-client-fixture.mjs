// Isolated client checks against the real built carousel. No API writes.
import assert from 'node:assert/strict';

const event = id => ({ id, kind:'listed', amount_cents:100 * id, previous_cents:null, created_at:`2026-11-05T12:00:${String(id).padStart(2,'0')}Z`, product:{slug:'feed-model-'+id,title:'Feed model '+id,kind:'agent',engine:'Claude',cover_url:null},seller:{username:'fixture-creator',display_name:'Fixture Creator'} });
export function createFeedFixture(mode) {
  assert.ok(['full','reduced','hidden-prices','two','single'].includes(mode));
  const records = mode === 'single' ? [event(6)] : mode === 'two' ? [event(5),event(6)] : [event(4),event(5),event(6)];
  const requests = [];
  const intervals = new Map(), timeouts = new Map();
  let timerId = 100000, now = Date.now(), failNext = false;
  const fixture = {
    mode, requests, initialPath:'/feed',
    addArrivals() { records.push(event(7),event(8)); },
    addLiveArrival() { records.push(event(9)); },
    failNext() { failNext = true; },
    async poll() {
      const entry = [...timeouts].find(([,value]) => value.delay === 15000 || value.delay === 1100);
      assert.ok(entry,'A live poll is scheduled');
      timeouts.delete(entry[0]);
      await entry[1].callback();
    },
    arrive() { const timer = [...intervals.values()].find(value => value.delay === 1100); assert.ok(timer); timer.callback(); },
    playTick() { now += 6000; const timer = [...intervals.values()].find(value => value.delay === 5000); if (timer) timer.callback(); return !!timer; },
    install(w) {
      w.Date.now = () => now;
      const setInterval = w.setInterval.bind(w), clearInterval = w.clearInterval.bind(w);
      const setTimeout = w.setTimeout.bind(w), clearTimeout = w.clearTimeout.bind(w);
      w.setInterval = (callback,delay,...args) => {
        if ([1100,5000].includes(delay)) { const id=timerId++; intervals.set(id,{callback,delay}); return id; }
        return setInterval(callback,delay,...args);
      };
      w.clearInterval = id => { if (!intervals.delete(id)) clearInterval(id); };
      w.setTimeout = (callback,delay,...args) => {
        if ([1100,15000].includes(delay)) { const id=timerId++; timeouts.set(id,{callback,delay}); return id; }
        return setTimeout(callback,delay,...args);
      };
      w.clearTimeout = id => { if (!timeouts.delete(id)) clearTimeout(id); };
      w.matchMedia = media => ({matches:mode === 'reduced' && media.includes('prefers-reduced-motion'),media,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
      w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} takeRecords(){return [];} };
      // JSDOM has no layout engine. Supply fixed carousel geometry, leaving
      // Embla itself, its event handlers and its animations unmodified.
      for (const [property,measure] of Object.entries({
        offsetWidth:node => node.classList.contains('mk-feed-slide') ? 900 : 1000,
        offsetHeight:() => 400,
        offsetLeft:node => node.classList.contains('mk-feed-slide') ? [...node.parentElement.children].indexOf(node)*900 : 0,
        offsetTop:() => 0,
      })) Object.defineProperty(w.HTMLElement.prototype,property,{configurable:true,get(){return measure(this);}});
      const style = w.getComputedStyle.bind(w);
      w.getComputedStyle = node => {
        const result=style(node);
        if (!node.classList.contains('mk-feed-slide')) return result;
        return new Proxy(result,{get(target,key){
          if(key==='getPropertyValue')return name=>target.getPropertyValue(name)||(/^margin-/.test(name)?'0px':'');
          const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
        }});
      };
    },
    fetch(url,options={}) {
      if (!url.pathname.startsWith('/api/')) return;
      assert.equal(options.method || 'GET','GET','Feed checks never write data');
      const path=url.pathname.slice(5);
      if(path==='me')return Response.json({user:null});
      if(path==='config')return Response.json({accounts:true,payments:false,demo:false,github:false,google:false,prices:mode!=='hidden-prices',feeBps:1500});
      if(path==='market/feed') {
        requests.push(url.search);
        if(failNext){failNext=false;return Response.json({error:'Temporary fixture interruption'},{status:503});}
        if(url.searchParams.get('filter')==='sales')return Response.json({events:[],more:false,oldest:null,newest:null});
        let rows;
        const before=Number(url.searchParams.get('before')),after=Number(url.searchParams.get('after'));
        if(before)rows=[event(1),event(2),event(3)].filter(e=>e.id<before).reverse();
        else if(after)rows=records.filter(e=>e.id>after);
        else rows=[...records].sort((a,b)=>b.id-a.id).slice(0,3);
        return Response.json({events:rows,more:!before&&!after,oldest:rows.length?Math.min(...rows.map(e=>e.id)):null,newest:rows.length?Math.max(...rows.map(e=>e.id)):null});
      }
      throw Error('Unmocked feed request: '+path);
    },
  };
  return fixture;
}

export async function checkFeedClient({w,fixture,until,click,errors,locale}) {
  const doc=w.document;
  const position=()=>doc.querySelector('.mk-feed-position strong')?.textContent;
  const ids=()=>new Set([...doc.querySelectorAll('.mk-feed-slide')].map(node=>node.dataset.eventId));
  const button=label=>doc.querySelector(`[aria-label="${label}"]`);
  await until(()=>ids().size===(fixture.mode==='single'?1:fixture.mode==='two'?2:3)&&position()===(fixture.mode==='single'?'01':fixture.mode==='two'?'02':'03'),'initial feed and latest item');
  assert.ok(doc.querySelector('.sidebar a[href*="/feed"]'));
  assert.equal(doc.querySelector('.mk-feed .mk-feed-play').getAttribute('aria-pressed'),fixture.mode==='reduced'?'false':'true');
  if(fixture.mode==='hidden-prices') {
    assert.equal(doc.querySelector('.mk-feed-price'),null);
    assert.ok(doc.querySelector('.mk-feed-price-hidden'));
  } else assert.ok(doc.querySelector('.mk-feed-price'));
  if(fixture.mode==='single') {
    assert.equal(doc.querySelectorAll('.mk-feed-slide').length,3);
    const track=doc.querySelector('.mk-feed-track');const prior=track.style.transform;
    fixture.playTick();await until(()=>track.style.transform!==prior,'single-event ticker motion');
    assert.equal(position(),'01');assert.equal(ids().size,1);assert.deepEqual(errors,[]);
    console.log('PASS a single real event scrolls like the ticker without inventing another event');return;
  }
  if(fixture.mode==='two') {
    assert.equal(doc.querySelectorAll('.mk-feed-slide').length,4,'Visual copies keep a two-event carousel looping');
    const prior=position();fixture.playTick();
    await until(()=>position()!==prior,'two-event forward loop');
    assert.equal(ids().size,2,'Copies never create extra market events');
    assert.ok([...doc.querySelectorAll('.mk-feed-slide[aria-hidden="true"] a')].every(link=>link.tabIndex===-1));
    assert.deepEqual(errors,[]);console.log('PASS two-event carousel loops without duplicate accessible cards or inflated counts');return;
  }
  if(fixture.mode==='reduced') {
    assert.equal(fixture.playTick(),false,'Reduced motion starts with autoplay paused');
    assert.deepEqual(errors,[]);
    console.log(`PASS feed respects reduced motion (${locale}; no remote writes)`);return;
  }
  const viewport=doc.querySelector('.mk-feed-viewport');
  const before=position();
  assert.ok(fixture.playTick());
  await until(()=>position()!==before,'automatic forward carousel');
  click(button(locale==='fr'?'Événement précédent':'Previous event'));
  await until(()=>doc.querySelector('.mk-feed-play').getAttribute('aria-pressed')==='false','manual browsing pauses playback');
  const historyPosition=position();
  fixture.addArrivals();
  await fixture.poll();
  fixture.arrive();
  await until(()=>ids().size===4,'first arrival from a batch');
  assert.equal(position(),historyPosition,'A live arrival must not steal the reader’s position');
  fixture.arrive();
  await until(()=>ids().size===5,'second arrival from the batch');
  assert.equal(doc.querySelector('.mk-feed-unread')?.textContent,'+2');
  await fixture.poll(); fixture.arrive();
  assert.equal(ids().size,5,'Overlapping polls must not duplicate cards');
  click(doc.querySelector('.mk-feed-return'));
  await until(()=>position()==='05'&&!doc.querySelector('.mk-feed-unread'),'return to newest arrival');
  fixture.addLiveArrival();await fixture.poll();fixture.arrive();
  await until(()=>ids().size===6&&position()==='06','live arrival advances to the appended right-hand card');
  assert.ok(doc.querySelector('.mk-feed-slide.is-selected[data-event-id="9"]'));
  viewport.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
  await until(()=>position()==='01','keyboard history navigation');
  viewport.dispatchEvent(new w.WheelEvent('wheel',{deltaX:120,bubbles:true,cancelable:true}));
  await until(()=>position()==='02','horizontal wheel navigation');
  click(doc.querySelector('.mk-feed-older'));
  await until(()=>ids().size===9&&!doc.querySelector('.mk-feed-older'),'paginated older history');
  assert.ok(fixture.requests.some(query=>query.includes('before=4')));
  assert.equal(ids().size,9);
  const range=doc.querySelector('.mk-feed-history input');
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(range,'0');
  range.dispatchEvent(new w.Event('input',{bubbles:true}));
  await until(()=>position()==='01','history range control');
  fixture.failNext();
  await fixture.poll();
  await until(()=>doc.querySelector('.mk-feed .notice[role="alert"]'),'transient feed error');
  assert.equal(ids().size,9,'An interruption preserves the loaded carousel');
  click(doc.querySelector('.mk-feed .notice .text-button'));
  await until(()=>!doc.querySelector('.mk-feed .notice[role="alert"]'),'retry without discarding history');
  assert.equal(ids().size,9);
  click([...doc.querySelectorAll('.mk-feed-filters button')][2]);
  await until(()=>!!doc.querySelector('.mk-feed-empty h2')&&ids().size===0,'real empty paid-sales filter');
  assert.ok(!doc.querySelector('.mk-feed-card'),'No sale is fabricated for an empty filter');
  assert.deepEqual(errors,[]);
  console.log(`PASS feed autoplay, one-by-one arrivals, paused history, no duplicates, live return, keyboard, wheel, older pages, retry and honest filters (${locale}; local fixtures; no remote writes)`);
}
