// Isolated client checks against the real built carousel. Simulated checkout
// requests are handled here and can never reach the remote API.
import assert from 'node:assert/strict';

const event = id => ({ id, kind:'listed', amount_cents:100 * id, previous_cents:null, created_at:`2026-11-05T12:00:${String(id).padStart(2,'0')}Z`, product:{id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(id).padStart(12,'0'),seller_id:'22222222-2222-4222-8222-222222222222',price_cents:100*id,slug:'feed-model-'+id,title:'Feed model '+id,kind:'agent',engine:'Claude',cover_url:null,tagline:'A complete fixture model',description:'Public description for this full-page model.',version:'1.0.0',license:'MIT',agent_count:1,tags:['Research'],requirements:'Personal API key.',setup:'Configure your key and open the agent.'},seller:{username:'fixture-creator',display_name:'Fixture Creator'} });
export function createFeedFixture(mode) {
  assert.ok(['full','reduced','hidden-prices','two','single','demo','buy','buy-owner','buy-anonymous','buy-free','mobile'].includes(mode));
  const records = mode === 'single' ? [event(6)] : mode === 'two' ? [event(5),event(6)] : [event(4),event(5),event(6)];
  const requests = [], purchases = [];
  let rejectPayment = true, holdPayment = false, releasePayment;
  if(mode === 'buy-free') records[records.length-1].product.price_cents = 0;
  const intervals = new Map(), timeouts = new Map();
  let timerId = 100000, now = Date.now(), motionTime = 0, failNext = false;
  const frames = new Map();
  let allowReal = mode !== 'demo';
  const fixture = {
    mode, requests, purchases,
    allowPayment() { rejectPayment = false; },
    holdPayment() { holdPayment = true; },
    releasePayment() { holdPayment = false; releasePayment?.(); },
    initialPath:mode === 'demo' ? '/feed?demo=1' : '/feed',
    allowReal() { allowReal=true; },
    blockReal() { allowReal=false; },
    addArrivals() { records.push(event(7),event(8)); },
    addLiveArrival() { records.push(event(9)); },
    failNext() { failNext = true; },
    async poll() {
      const entry = [...timeouts].find(([,value]) => [4000,15000,1100].includes(value.delay));
      assert.ok(entry,'A live poll is scheduled');
      timeouts.delete(entry[0]);
      await entry[1].callback();
    },
    arrive() { const timer = [...intervals.values()].find(value => value.delay === 1100); assert.ok(timer); timer.callback(); },
    motion(ms = 28064) {
      let ran = false;
      for (let elapsed = 0; elapsed < ms; elapsed += 64) {
        const delta = Math.min(64, ms - elapsed);
        motionTime += delta; now += delta;
        const pending = [...frames.values()]; frames.clear();
        for (const callback of pending) { ran = true; callback(motionTime); }
      }
      return ran;
    },
    playTick() { return this.motion(); },
    install(w) {
      w.Date.now = () => now;
      w.performance.now = () => motionTime;
      w.requestAnimationFrame = callback => { const id=timerId++; frames.set(id,callback); return id; };
      w.cancelAnimationFrame = id => frames.delete(id);
      const setInterval = w.setInterval.bind(w), clearInterval = w.clearInterval.bind(w);
      const setTimeout = w.setTimeout.bind(w), clearTimeout = w.clearTimeout.bind(w);
      w.setInterval = (callback,delay,...args) => {
        if ([1100,5000].includes(delay)) { const id=timerId++; intervals.set(id,{callback,delay}); return id; }
        return setInterval(callback,delay,...args);
      };
      w.clearInterval = id => { if (!intervals.delete(id)) clearInterval(id); };
      w.setTimeout = (callback,delay,...args) => {
        if ([1100,4000,15000].includes(delay)) { const id=timerId++; timeouts.set(id,{callback,delay}); return id; }
        return setTimeout(callback,delay,...args);
      };
      w.clearTimeout = id => { if (!timeouts.delete(id)) clearTimeout(id); };
      w.matchMedia = media => ({matches:(mode === 'reduced' && media.includes('prefers-reduced-motion')) || (mode === 'mobile' && media.includes('max-width: 760px')),media,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
      w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} takeRecords(){return [];} };
      // Motion is viewport-relative; no layout geometry or browser engine is
      // faked. Advance real animation-frame callbacks with a controlled clock.
    },
    fetch(url,options={}) {
      if (!url.pathname.startsWith('/api/')) return;
      const path=url.pathname.slice(5);
      if(path==='checkout') {
        assert.ok(['buy','buy-free','mobile'].includes(mode),'Only the isolated purchase fixture can submit checkout');
        assert.equal(options.method,'POST');
        const body=JSON.parse(options.body); purchases.push(body);
        assert.deepEqual(Object.keys(body).sort(),['license_accepted','product_id']);
        assert.equal(body.license_accepted,true);
        assert.equal(body.product_id,records.at(-1).product.id);
        if(rejectPayment) return Response.json({error:mode==='buy-free'?'Les achats ouvriront au lancement du marketplace.':'Ce vendeur doit activer ses paiements.'},{status:mode==='buy-free'?503:409});
        const response=()=>Response.json({url:mode==='buy-free'?'/library':'https://checkout.stripe.com/c/pay/cs_test_feed_fixture'});
        return holdPayment ? new Promise(resolve=>{releasePayment=()=>resolve(response());}) : response();
      }
      assert.equal(options.method || 'GET','GET','No fixture write can reach the actual server');
      if(path==='me')return Response.json({user: ['buy','buy-free','buy-owner','mobile'].includes(mode) ? {id:mode==='buy-owner'?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111',email:'buyer@example.test'} : null});
      if(path==='favorites')return Response.json({ids:[]});
      if(path==='config')return Response.json({accounts:true,payments:true,launched:true,demo:false,github:false,google:false,prices:mode!=='hidden-prices',feeBps:1500});
      if(path==='market/feed') {
        assert.ok(allowReal,'A demo must never request genuine market events');
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
  if(fixture.mode==='mobile') {
    await until(()=>ids().size===3&&position()==='03','mobile Feed ready');
    const viewport=doc.querySelector('.mk-feed-viewport'),track=doc.querySelector('.mk-feed-track');
    const card=()=>doc.querySelector('.mk-feed-slide.is-selected');
    const pointer=(type,x,y=40,target=viewport)=>{
      const event=new w.Event(type,{bubbles:true,cancelable:true});
      Object.defineProperties(event,{clientX:{value:x},clientY:{value:y},pointerType:{value:'touch'},pointerId:{value:1},isPrimary:{value:true},button:{value:0}});
      target.dispatchEvent(event);
    };
    pointer('pointerdown',150);pointer('pointerup',150);
    viewport.dispatchEvent(new w.FocusEvent('focusin',{bubbles:true}));
    await until(()=>doc.querySelector('.mk-feed-play').getAttribute('aria-pressed')==='true'&&viewport.dataset.motion==='running','touch and its focus must not stop autoplay');
    const before=track.style.transform;assert.ok(fixture.motion(1000));assert.notEqual(track.style.transform,before);
    assert.equal(card().querySelector('.mk-model-actions'),null,'Mobile cards expose purchase controls only');
    assert.equal(card().querySelector('a.mk-feed-title,a.mk-feed-art,a.mk-feed-seller'),null,'Tapping the card cannot navigate away');
    assert.equal(card().querySelector('summary'),null,'Product information is passive on mobile Feed');
    assert.ok(card().querySelector('.mk-feed-description').textContent.includes('Public description'));
    const original=position();
    pointer('pointerdown',150,40);pointer('pointerup',160,200);
    assert.equal(position(),original,'A vertical page gesture is not a horizontal card swipe');
    pointer('pointerdown',150);pointer('pointercancel',150);
    assert.equal(viewport.dataset.motion,'running','Cancelled gestures do not leave playback stuck');
    pointer('pointerdown',280);pointer('pointermove',70,43);pointer('pointerup',60,43);
    await until(()=>position()!==original&&viewport.dataset.motion==='running','left swipe changes card and keeps playback');
    pointer('pointerdown',60);pointer('pointerup',280);
    await until(()=>position()===original&&viewport.dataset.motion==='running','right swipe changes card and keeps playback');
    const consent=card().querySelector('.mk-feed-buy-license input');
    await until(()=>card().querySelector('.mk-feed-buy-button').disabled,'mobile licence required');
    pointer('pointerdown',100,40,consent);pointer('pointerup',100,40,consent);click(consent);
    await until(()=>!card().querySelector('.mk-feed-buy-button').disabled,'mobile licence accepted');
    assert.equal(viewport.dataset.motion,'running','Accepting the licence keeps the Feed moving');
    assert.equal(card().querySelectorAll('.mk-feed-buy-license a').length,2,'Licence and terms remain reviewable');
    click(card().querySelector('.mk-feed-buy-button'));
    await until(()=>fixture.purchases.length===1&&card().querySelector('.notice'),'mobile purchase request and honest error');
    assert.equal(viewport.dataset.motion,'running','Buy now does not disable autoplay');
    click(doc.querySelector('.mk-feed-play'));
    await until(()=>viewport.dataset.motion==='paused','explicit pause still works');
    pointer('pointerdown',280);pointer('pointerup',60);
    assert.equal(viewport.dataset.motion,'paused','A swipe preserves the user’s explicit pause');
    assert.equal(fixture.motion(1000),false);
    assert.deepEqual(errors,[]);
    console.log('PASS mobile Feed: touch, focus, cancel, both swipe directions, passive cards, consent, UUID-bound purchase and explicit pause ('+locale+'; isolated fixtures)');return;
  }
  if(['buy','buy-owner','buy-anonymous','buy-free'].includes(fixture.mode)) {
    await until(()=>ids().size===3&&position()==='03','purchase-ready Feed');
    const card=()=>doc.querySelector('.mk-feed-slide.is-selected');
    if(fixture.mode==='buy-owner') {
      await until(()=>card().querySelector('.mk-feed-buy-own'),'owner state');
      assert.equal(card().querySelector('.mk-feed-buy-button'),null);
      assert.equal(fixture.purchases.length,0);
      assert.deepEqual(errors,[]);console.log('PASS creator cannot buy their own Feed model');return;
    }
    const buy=()=>card().querySelector('.mk-feed-buy-button');
    if(fixture.mode==='buy-anonymous') {
      await until(()=>buy()&&!buy().disabled,'anonymous buy action');
      const neighbor=doc.querySelector('.mk-feed-slide:not(.is-selected) .mk-feed-buy-button:not(:disabled)');
      assert.ok(neighbor,'A model entering from the right remains clickable');
      click(neighbor);
      await until(()=>doc.querySelector('.auth-logo')&&position()==='01','select the clicked model and sign in before purchase');
      assert.equal(fixture.purchases.length,0);
      assert.deepEqual(errors,[]);console.log('PASS anonymous Buy now opens sign-in without a checkout request');return;
    }
    // Wait for /me to reach the component before checking licence enforcement.
    await until(()=>buy()?.disabled,'licence required before checkout');
    assert.equal(fixture.purchases.length,0);
    click(card().querySelector('.mk-feed-buy-license input'));
    await until(()=>!buy().disabled,'explicit licence acceptance');
    click(buy());
    await until(()=>card().querySelector('.notice[role="alert"]'),'checkout availability error');
    assert.equal(fixture.purchases.length,1);
    assert.equal(w.location.pathname,'/feed');
    assert.ok(!buy().disabled,'A failed checkout is retryable');
    fixture.allowPayment();fixture.holdPayment();
    click(buy()); click(buy());
    await until(()=>buy().getAttribute('aria-busy')==='true','checkout in flight');
    assert.equal(fixture.purchases.length,2,'A repeated click cannot create a second checkout');
    assert.equal(buy().disabled,true);
    fixture.releasePayment();
    // JSDOM cannot follow a cross-document location.assign. This one expected
    // navigation signal proves the success branch requested the Stripe/library
    // redirect; it does not claim a browser navigation or real payment occurred.
    await until(()=>errors.some(error=>/Not implemented.*navigation/i.test(error)),'successful checkout requests navigation');
    const navigation=errors.filter(error=>/Not implemented.*navigation/i.test(error));
    assert.equal(navigation.length,1);
    assert.deepEqual(errors.filter(error=>!/Not implemented.*navigation/i.test(error)),[]);
    assert.equal(fixture.purchases.length,2);
    console.log(`PASS Feed ${fixture.mode==='buy-free'?'free acquisition':'Buy now to Stripe'}: licence, server-priced UUID, availability error, retry, single in-flight request and redirect intent (${locale}; fixture only, no real payment)`);return;
  }
  if(fixture.mode==='demo') {
    await until(()=>doc.querySelector('.mk-feed-demo')&&ids().size===6&&position()==='06','temporary demo carousel');
    assert.equal(fixture.requests.length,0,'The demo has no live feed requests');
    assert.ok(doc.querySelector('.mk-feed-demo-notice'));
    const hero = doc.querySelector('.mk-feed-slide.is-selected');
    assert.match(hero.querySelector('.mk-feed-title').textContent,/NEXUS PRIME/);
    assert.ok(hero.querySelector('.mk-feed-art img').src.includes('nexus-prime-demo.webp'));
    assert.ok(hero.querySelector('.mk-feed-description').textContent.length > 200);
    assert.equal(hero.querySelectorAll('.mk-feed-features li').length,4);
    assert.match(hero.querySelector('.mk-feed-specs').textContent,/12/);
    assert.ok(hero.querySelector('.mk-feed-price'));
    assert.ok(hero.querySelector('.mk-feed-details'));
    const demoBuy=hero.querySelector('.mk-feed-buy-button');
    assert.match(demoBuy.textContent,/Buy now/);
    assert.equal(hero.querySelector('.mk-feed-buy-license'),null);
    click(demoBuy);
    await until(()=>doc.querySelector('.mk-feed-demo-preview'),'demo Buy now never charges');
    assert.equal(fixture.purchases.length,0);
    assert.equal(fixture.requests.length,0);
    click(doc.querySelector('.mk-feed-demo-preview .modal-close'));
    await until(()=>!doc.querySelector('.mk-feed-demo-preview'),'close fictitious purchase preview');
    assert.ok([...doc.querySelectorAll('.mk-feed-slide')].every(card=>card.querySelector('.mk-feed-demo-badge')));
    assert.ok([...ids()].every(id=>Number(id)>800000000));
    click(doc.querySelector('.mk-feed-demo-add'));
    await new Promise(resolve=>setTimeout(resolve,0));fixture.arrive();
    await until(()=>ids().size===7,'manual simulated sale');
    click(button(locale==='fr'?'Événement précédent':'Previous event'));
    await until(()=>doc.querySelector('.mk-feed-play').getAttribute('aria-pressed')==='false','demo historical browsing pauses playback');
    const paused=position();
    click(doc.querySelector('.mk-feed-demo-add'));
    await new Promise(resolve=>setTimeout(resolve,0));fixture.arrive();
    await until(()=>ids().size===8&&doc.querySelector('.mk-feed-unread'),'demo respects historical browsing');
    assert.equal(position(),paused);
    click(doc.querySelector('.mk-feed-return'));
    await until(()=>position()==='08','return to demo arrivals');
    await fixture.poll();fixture.arrive();
    await until(()=>ids().size===9,'automatic simulated arrival');
    click(doc.querySelector('.mk-feed-slide.is-selected .mk-feed-title'));
    await until(()=>doc.querySelector('.mk-feed-demo-preview'),'safe demo model preview');
    assert.equal(w.location.pathname,'/feed');
    assert.equal(w.location.search.includes('demo=1'),true);
    assert.ok(!doc.querySelector('.mk-feed-demo-preview a[href*="checkout"]'));
    click(doc.querySelector('.mk-feed-demo-preview .modal-close'));
    await until(()=>!doc.querySelector('.mk-feed-demo-preview'),'preview closed');
    click([...doc.querySelectorAll('.mk-feed-filters button')][2]);
    await until(()=>doc.querySelectorAll('.mk-feed-slide .mk-kind-sold').length>0&&!doc.querySelector('.mk-feed-slide .mk-kind-listed'),'demo paid-sales filter');
    assert.equal(fixture.requests.length,0);
    fixture.allowReal();
    click(doc.querySelector('.mk-feed-demo-exit'));
    await until(()=>!doc.querySelector('.mk-feed-demo')&&ids().size===3&&[...ids()].every(id=>Number(id)<800000000),'back to the genuine feed without test records');
    const reads=fixture.requests.length;assert.ok(reads>0);
    fixture.blockReal();
    click(doc.querySelector('.mk-feed-demo-start'));
    await until(()=>doc.querySelector('.mk-feed-demo')&&ids().size===6,'fresh demo after reopening');
    assert.ok([...ids()].every(id=>Number(id)<=800000016));
    assert.equal(fixture.requests.length,reads);
    assert.deepEqual(errors,[]);
    console.log(`PASS temporary demo labels, manual/automatic test arrivals, history, preview, filters, no live API reads, clean exit and reset (${locale}; no server writes)`);return;
  }
  await until(()=>ids().size===(fixture.mode==='single'?1:fixture.mode==='two'?2:3)&&position()===(fixture.mode==='single'?'01':fixture.mode==='two'?'02':'03'),'initial feed and latest item');
  assert.ok(doc.querySelector('.sidebar a[href*="/feed"]'));
  assert.equal(doc.querySelector('.mk-feed .mk-feed-play').getAttribute('aria-pressed'),fixture.mode==='reduced'?'false':'true');
  if(fixture.mode==='hidden-prices') {
    assert.equal(doc.querySelector('.mk-feed-price'),null);
    assert.equal(doc.querySelector('.mk-feed-buy-button'),null);
    assert.ok(doc.querySelector('.mk-feed-price-hidden'));
  } else assert.ok(doc.querySelector('.mk-feed-price'));
  if(fixture.mode==='single') {
    assert.equal(doc.querySelectorAll('.mk-feed-slide').length,2);
    const track=doc.querySelector('.mk-feed-track');const prior=track.style.transform;
    fixture.playTick();await until(()=>track.style.transform!==prior,'single-event ticker motion');
    assert.equal(position(),'01');assert.equal(ids().size,1);assert.deepEqual(errors,[]);
    console.log('PASS a single real event scrolls like the ticker without inventing another event');return;
  }
  if(fixture.mode==='two') {
    assert.equal(doc.querySelectorAll('.mk-feed-slide').length,3,'One trailing visual copy keeps the marquee seamless');
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
  const track=doc.querySelector('.mk-feed-track');
  const start=track.style.transform;
  assert.ok(fixture.motion(1000));
  const first=track.style.transform;
  assert.notEqual(first,start,'The model moves during the first second without waiting for a slide timer');
  assert.equal(position(),before,'A small continuous movement keeps the same event');
  assert.ok(fixture.motion(1000));
  assert.notEqual(track.style.transform,first,'Motion continues at intermediate positions');
  const offset = value => Number(value.match(/translate3d\((-?[\d.]+)%/)[1]);
  assert.ok(offset(first)<offset(start),'Motion always goes right to left');
  assert.ok(Math.abs((offset(track.style.transform)-offset(first))-(offset(first)-offset(start)))<0.000001,'Equal elapsed times move equal distances');
  assert.ok(fixture.playTick());
  await until(()=>position()!==before,'continuous right-to-left marquee');
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
  fixture.motion(1000);
  const inFlight = track.style.transform;
  const nextVisible = doc.querySelector('.mk-feed-slide.is-selected').nextElementSibling.dataset.eventId;
  fixture.addLiveArrival();await fixture.poll();fixture.arrive();
  await until(()=>ids().size===6,'new sale joins the rail');
  assert.equal(position(),'05','An arrival never teleports over the current model');
  assert.equal(track.style.transform,inFlight,'Arrivals preserve the exact in-flight position');
  assert.equal(doc.querySelector('.mk-feed-slide.is-selected').nextElementSibling.dataset.eventId,nextVisible,'A partially visible next model is never replaced');
  fixture.motion(56000);
  await until(()=>position()==='06','queued sale enters from fully outside the right edge');
  assert.ok(doc.querySelector('.mk-feed-slide.is-selected[data-event-id="9"]'));
  viewport.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
  await until(()=>position()==='01','keyboard history navigation');
  viewport.dispatchEvent(new w.WheelEvent('wheel',{deltaX:120,bubbles:true,cancelable:true}));
  await until(()=>position()==='02','horizontal wheel navigation');
  const gesture = (type,x) => {
    const event=new w.Event(type,{bubbles:true,cancelable:true});
    Object.defineProperties(event,{clientX:{value:x},pointerType:{value:'mouse'}});
    viewport.dispatchEvent(event);
  };
  gesture('pointerdown',100); gesture('pointerup',500);
  await until(()=>position()==='01','mouse swipe browses back');
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
