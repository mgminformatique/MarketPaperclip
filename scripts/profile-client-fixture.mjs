// Client integration fixtures: never contact a real user, upload or payment API.
import assert from 'node:assert/strict';

const member = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const publishedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const createdId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const baseModel = {
  id: publishedId, seller_id: member, slug: 'fixture-model', title: 'Published model fixture',
  tagline: 'A complete model for the profile integration checks.', description: 'A complete package with documented installation steps and clear permissions for the buyer.',
  category: 'Développement', kind: 'agent', engine: 'Claude', version: '1.0.0', price_cents: 500,
  currency: 'cad', license: 'MIT', tags: ['profile'], requirements: 'Node.js and Paperclip.',
  setup: 'Read the README and install the instruction bundle.', agent_count: 1, status: 'published',
  created_at: '2026-11-01T12:00:00Z', cover_url: null, product_files: null,
};

export function createProfileFixture(mode) {
  assert.ok(['owner', 'visitor', 'anonymous', 'public-anonymous'].includes(mode));
  const profile = { id: member, username: 'mgm-labs', display_name: 'QA Creator', bio: 'Building useful agent models.', website: '', avatar_url: null, banner_url: null };
  const models = [baseModel, { ...baseModel, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Private draft fixture', status: 'draft' }];
  const posts = mode === 'owner' ? [] : [{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',author_id:member,body:'Published model',images:[],created_at:'2026-11-06T00:00:00Z',product:baseModel},{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',author_id:member,body:'Legacy unlinked message',images:[],created_at:'2026-11-05T00:00:00Z',product:null}];
  const checks = { creates: 0, packageUploads: 0, submissions: 0, studioReads: 0, pictures: 0, posts: 0, profileEdits: 0, favorites: 0, offers: 0, checkouts: 0, copied: [] };
  let packageAttached = false;
  return { profile, checks, install(w) { Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{checks.copied.push(value);}}}); }, initialPath: ['visitor','public-anonymous'].includes(mode) ? '/creators/mgm-labs' : '/profile',
    fetch(url, options = {}) {
      if (!url.pathname.startsWith('/api/')) return;
      const path = url.pathname.slice(5), method = options.method || 'GET';
      if (path === 'config') return Response.json({ accounts:true, payments:true, demo:false, github:false, google:false, launched:true, prices:true, feeBps:1500 });
      if (path === 'me') return Response.json(['anonymous','public-anonymous'].includes(mode) ? { user:null } : {
        user:{ id:mode === 'owner' ? member : other, email:'qa@example.test' },
        profile:mode === 'owner' ? profile : { ...profile, id:other, username:'qa-visitor', display_name:'QA Visitor' },
        seller:null, isAdmin:false,
      });
      if (path === 'favorites') {
        if(method!=='GET') { assert.equal(mode,'visitor');assert.equal(JSON.parse(options.body).product_id,publishedId); checks.favorites++; }
        return Response.json({ids:[]});
      }
      if(path==='offers' && method==='POST') {
        assert.equal(mode,'visitor'); const body=JSON.parse(options.body);
        assert.equal(body.product_id,publishedId);assert.equal(body.amount_cents,375);checks.offers++;
        return Response.json({offer:{id:'ffffffff-ffff-4fff-8fff-ffffffffffff',status:'pending'}});
      }
      if(path==='checkout' && method==='POST') {
        assert.equal(mode,'visitor');const body=JSON.parse(options.body);
        assert.deepEqual(body,{product_id:publishedId,license_accepted:true});checks.checkouts++;
        return Response.json({error:'Ce vendeur doit activer ses paiements.'},{status:409});
      }
      if (path === 'creators/mgm-labs') return Response.json({ profile, products:models.filter(m => m.status === 'published'), posts, more_posts:false, activity:[], stats:null });
      if (path === 'studio') {
        assert.equal(mode, 'owner', 'Only an owner may request private model data');
        checks.studioReads++;
        return Response.json({ products:models, orders:[], seller:null, stats:{ total_products:models.length } });
      }
      if (path.startsWith('studio/')) return Response.json({ product:models.find(m => m.id === path.split('/')[1]) });
      if (path === 'profile' && method === 'PATCH') {
        assert.equal(mode, 'owner');
        Object.assign(profile, JSON.parse(options.body));
        checks.profileEdits++;
        return Response.json({ok:true});
      }
      if (['profile/avatar','profile/banner'].includes(path) && method === 'POST') {
        assert.equal(mode, 'owner');
        assert.ok(options.body.get('file').size > 0);
        const kind = path.split('/')[1];
        const media = `https://ltommtumsvvqxdknpkfd.supabase.co/storage/v1/object/public/profile-media/${member}/${kind}/fixture.png`;
        profile[kind === 'avatar' ? 'avatar_url' : 'banner_url'] = media;
        checks.pictures++;
        return Response.json({url:media});
      }
      if (path === 'posts' && method === 'POST') {
        assert.equal(mode, 'owner');
        const body = JSON.parse(options.body);
        assert.equal(body.product_id, publishedId);
        const post = { id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc', author_id:member, body:body.body, images:[], created_at:new Date().toISOString(), product:baseModel };
        posts.unshift(post); checks.posts++;
        return Response.json({post});
      }
      if (path === 'products' && method === 'POST') {
        assert.equal(mode, 'owner');
        const body = JSON.parse(options.body);
        assert.equal(body.title, 'Profile QA model');
        assert.equal(body.status, 'draft');
        assert.equal(body.price_cents, 100);
        checks.creates++;
        const model = { ...baseModel, ...body, id:createdId, slug:'profile-qa-model' };
        models.unshift(model);
        return Response.json({product:model});
      }
      if (path === `products/${createdId}/file/upload`) return Response.json({error:'Use the small-file form fixture.'},{status:404});
      if (path === `products/${createdId}/file` && method === 'POST') {
        const file = options.body.get('file');
        assert.equal(file.name, 'agent.json');
        assert.ok(file.size > 0);
        packageAttached = true; checks.packageUploads++;
        return Response.json({ok:true,name:file.name,size:file.size});
      }
      if (path === `products/${createdId}` && method === 'PATCH') {
        const body = JSON.parse(options.body);
        if (body.status === 'pending') { assert.ok(packageAttached, 'Submission must follow the package upload'); checks.submissions++; }
        Object.assign(models.find(m => m.id === createdId), body);
        return Response.json({ok:true});
      }
      throw Error(`Unmocked profile fixture request: ${method} ${path}`);
    },
  };
}

export async function checkProfileClient({ w, mode, fixture, until, click, errors, locale }) {
  const doc = w.document;
  const find = (selector, text) => [...doc.querySelectorAll(selector)].find(e => e.textContent.trim() === text);
  function set(input, value) {
    assert.ok(input, 'Input is available');
    const prototype = input.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new w.Event('input',{bubbles:true}));
  }
  function selectFile(input, name, type) {
    assert.ok(input, 'Upload picker is available');
    Object.defineProperty(input,'files',{configurable:true,value:[new w.File(['{"name":"profile-qa"}'],name,{type})]});
    input.dispatchEvent(new w.Event('change',{bubbles:true}));
  }
  if (mode === 'anonymous') {
    await until(() => doc.querySelector('.empty-state, .empty') && !doc.querySelector('.loading-state'), 'anonymous profile prompt');
    assert.ok(!doc.querySelector('.mk-composer'));
    assert.ok(!doc.querySelector('.mk-owned-models'));
    assert.equal(fixture.checks.studioReads,0);
    console.log('PASS personal profile requires sign-in');
    return;
  }
  await until(() => doc.querySelector('.mk-profile-identity h1')?.textContent === 'QA Creator', 'profile identity');
  assert.ok(doc.querySelector('.profile-banner'));
  assert.ok(doc.querySelector('.public-profile .avatar'));
  assert.equal(doc.querySelector('#profile-tab-posts').getAttribute('aria-selected'),'true');
  if (mode === 'public-anonymous') {
    assert.equal(doc.querySelector('.mk-composer'),null);
    assert.ok(!doc.body.textContent.includes('Legacy unlinked message'));
    click(doc.querySelector('.mk-profile-product-card .mk-feed-buy-button'));
    await until(()=>doc.querySelector('.auth-logo'),'sign in before buying from a public profile');
    assert.equal(fixture.checks.checkouts,0);
    assert.equal(fixture.checks.studioReads,0);
    assert.deepEqual(errors,[]);
    console.log(`PASS anonymous public model card opens sign-in without checkout (${locale})`);return;
  }
  if (mode === 'visitor') {
    assert.equal(doc.querySelector('.mk-composer'),null);
    assert.equal(doc.querySelector('.mk-avatar-camera'),null);
    assert.equal(doc.querySelector('.mk-cover-edit'),null);
    assert.equal(doc.querySelector('.mk-profile-actions'),null);
    assert.equal(fixture.checks.studioReads,0);
    assert.ok(!doc.body.textContent.includes('Private draft fixture'));
    assert.ok(!doc.body.textContent.includes('Legacy unlinked message'));
    assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-description'));
    assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-buy-button'));
    assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-buy-license'));
    const card=doc.querySelector('.mk-profile-product-card');
    click(card.querySelector('.mk-model-save'));
    await until(()=>card.querySelector('.mk-model-save').getAttribute('aria-pressed')==='true','profile card favorite');
    assert.equal(fixture.checks.favorites,1);
    click(card.querySelector('.mk-model-actions .button'));
    await until(()=>fixture.checks.copied.length===1,'copy model link');
    assert.ok(fixture.checks.copied[0].endsWith('/agents/fixture-model'));
    click(card.querySelector('.mk-model-offer'));
    await until(()=>doc.querySelector('.mk-offer-form'),'offer from the profile card');
    set(doc.querySelector('.mk-offer-form input[type="number"]'),'3.75');
    await until(()=>doc.querySelector('.mk-offer-form .button.primary')?.disabled===false,'valid offer amount');
    doc.querySelector('.mk-offer-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>fixture.checks.offers===1&&!doc.querySelector('.mk-offer-form'),'offer submitted without changing page');
    const buy=card.querySelector('.mk-feed-buy-button');assert.equal(buy.disabled,true);
    click(card.querySelector('.mk-feed-buy-license input'));
    await until(()=>!buy.disabled,'licence before profile checkout');
    click(buy);
    await until(()=>fixture.checks.checkouts===1&&card.querySelector('.notice[role="alert"]'),'direct checkout from the profile');
    assert.equal(w.location.pathname,'/creators/mgm-labs');
    console.log(`PASS visitor profile has no editing controls or private models (${locale})`);
    return;
  }
  assert.ok(doc.querySelector('.account-button').href.includes('/profile'));
  assert.ok(doc.querySelector('.sidebar a[href*="/profile"]'));
  await until(() => fixture.checks.studioReads > 0, 'owner model data');
  const composer=doc.querySelector('.mk-composer');
  assert.ok(composer.querySelector('.button.primary').disabled,'A product is required even for text/photo posts');
  set(composer.querySelector('textarea'),'This text alone must not be published.');
  composer.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>composer.querySelector('.notice[role="alert"]'),'unlinked publication blocked');
  assert.equal(fixture.checks.posts,0);
  click(doc.querySelector('#profile-tab-products'));
  await until(() => doc.querySelector('.mk-owned-models')?.textContent.includes('Private draft fixture'), 'private model management');
  click([...doc.querySelectorAll('.mk-owned-model-actions .button.primary')][0]);
  await until(() => doc.querySelector('.mk-composer select')?.value === publishedId, 'share approved model from own listings');
  set(doc.querySelector('.mk-composer textarea'),'Discover my new model — profile integration check.');
  await until(() => !doc.querySelector('.mk-composer button[type="submit"], .mk-composer .button.primary').disabled, 'post ready');
  doc.querySelector('.mk-composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(() => doc.querySelector('.mk-post-body')?.textContent.includes('Discover my new model'), 'published profile post');
  assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-title')?.textContent.includes('Published model fixture'));
  assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-description'));
  assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-specs'));
  assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-details'));
  assert.ok(doc.querySelector('.mk-profile-product-card .mk-feed-buy-own'),'An owner sees their own creation');
  assert.ok(doc.querySelector('.mk-profile-product-card .mk-model-save'));
  assert.equal(doc.querySelector('.mk-composer .button.primary').disabled,true,'Publishing without selecting a model is disabled');
  assert.equal(fixture.checks.posts,1);

  click(doc.querySelector('.mk-avatar-camera'));
  await until(() => doc.querySelector('.mk-avatar-edit .mk-file-input'), 'avatar dialog');
  selectFile(doc.querySelector('.mk-avatar-edit .mk-file-input'),'avatar.png','image/png');
  await until(() => doc.querySelector('.public-profile .mk-photo img')?.src.includes('/avatar/'), 'profile photo updated');
  click(doc.querySelector('.mk-cover-edit'));
  await until(() => doc.querySelector('.mk-social-profile > .mk-file-input'), 'cover dialog');
  selectFile(doc.querySelector('.mk-social-profile > .mk-file-input'),'cover.png','image/png');
  await until(() => doc.querySelector('.mk-banner-photo > img')?.src.includes('/banner/'), 'cover photo updated');
  assert.equal(fixture.checks.pictures,2);

  click(find('.mk-profile-actions button',locale === 'en' ? 'Edit profile' : 'Modifier le profil'));
  await until(() => doc.querySelector('input[name="display_name"]'), 'profile edit dialog');
  set(doc.querySelector('input[name="display_name"]'),'QA Creator Updated');
  doc.querySelector('.modal form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(() => !doc.querySelector('.modal') && doc.querySelector('.mk-profile-identity h1')?.textContent === 'QA Creator Updated', 'profile details saved in place');
  assert.equal(fixture.checks.profileEdits,1);

  click(doc.querySelector('.mk-create-model'));
  await until(() => doc.querySelector('.mk-model-modal .editor-form'),'inline model editor');
  set(doc.querySelector('.mk-model-modal input[maxlength="80"]'),'Profile QA model');
  set(doc.querySelector('.mk-model-modal input[maxlength="160"]'),'A useful model published directly from my profile.');
  set(doc.querySelector('.mk-model-modal textarea'),'This complete agent package includes documentation, installation steps and a useful example for the user.');
  click(doc.querySelectorAll('.mk-model-modal .editor-steps button')[1]);
  await until(() => doc.querySelector('.mk-model-modal .upload-zone input'), 'package step');
  selectFile(doc.querySelector('.mk-model-modal .upload-zone input'),'agent.json','application/json');
  const textareas = doc.querySelectorAll('.mk-model-modal textarea');
  set(textareas[0],'Paperclip and a supported instructions adapter.');
  set(textareas[1],'Extract the package, read the README and configure the agent.');
  click(doc.querySelectorAll('.mk-model-modal .editor-steps button')[2]);
  await until(() => doc.querySelector('.mk-model-modal .price-input input'),'price step');
  set(doc.querySelector('.mk-model-modal .price-input input'),'1');
  click(doc.querySelector('.mk-model-modal .editor-actions .button.secondary'));
  await until(() => fixture.checks.creates === 1 && fixture.checks.packageUploads === 1 && !doc.querySelector('.mk-model-modal .editor-actions button').disabled,'draft saved without leaving the profile');
  assert.equal(w.location.pathname,'/profile');
  assert.ok(doc.querySelector('.mk-model-modal'),'Draft save keeps the inline editor open');
  click(doc.querySelector('.mk-model-modal .checkbox-label input'));
  assert.ok(doc.querySelector('.mk-model-modal form').checkValidity());
  doc.querySelector('.mk-model-modal form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(() => fixture.checks.submissions === 1 && !doc.querySelector('.mk-model-modal'),'model submitted without studio redirect');
  await until(() => doc.querySelector('.mk-owned-models')?.textContent.includes('Profile QA model'),'model status refreshed');
  assert.equal(fixture.checks.creates,1,'Saving then submitting must not create a duplicate');
  assert.equal(fixture.checks.packageUploads,1);
  assert.equal(w.location.pathname,'/profile');
  assert.equal(doc.querySelector('#profile-tab-products').getAttribute('aria-selected'),'true');
  assert.ok(doc.querySelector('.mk-model-saved'));
  click([...doc.querySelectorAll('.topbar a')].find(a => a.href.includes('/profile?create=model')));
  await until(() => doc.querySelector('.mk-model-modal .editor-form'),'global publish button opens profile editor');
  set(doc.querySelector('.mk-model-modal input[maxlength="80"]'),'Unsaved changes');
  await until(() => doc.querySelector('.mk-model-modal .editor-preview h2')?.textContent === 'Unsaved changes','unsaved draft');
  w.confirm = () => false;
  click(doc.querySelector('.mk-model-modal .modal-close'));
  assert.ok(doc.querySelector('.mk-model-modal'),'Declining discard keeps the model editor open');
  w.confirm = () => true;
  click(doc.querySelector('.mk-model-modal .modal-close'));
  await until(() => !doc.querySelector('.mk-model-modal'),'confirmed discard closes model editor');
  assert.equal(fixture.checks.creates,1,'Discarding a new model must not create a product');
  assert.deepEqual(errors,[]);
  console.log(`PASS owner photo, cover, details, post, model draft, package and review submission (${locale}; local fixtures; no remote writes)`);
}
