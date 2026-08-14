import { test, expect } from '@playwright/test';

const user = { id:'11111111-1111-4111-8111-111111111111', handle:'passkey', name:'Passkey User', bio:'', palette:0, avatar_url:null, stars:[], created_at:new Date().toISOString(), session_version:1, csrf:'test-csrf' };

test('Mobile Safari follows the iPhone language', async ({ browser }) => {
  const context = await browser.newContext({ locale:'fr-FR' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name:'Se connecter' })).toBeVisible({ timeout:8000 });
  await expect(page.locator('html')).toHaveAttribute('lang','fr-FR');
  await context.close();
});

test('French registration is fully translated and fits a real iPhone viewport', async ({ browser }) => {
  const context = await browser.newContext({ locale:'fr-FR', viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name:'Créer un compte' }).click();

  await expect(page.getByPlaceholder('Comment t’appelles-tu ?')).toBeVisible();
  await expect(page.getByPlaceholder('Nom d’utilisateur')).toBeVisible();
  await expect(page.getByText('Date de naissance', { exact:true })).toBeVisible();
  await expect(page.getByPlaceholder('Mot de passe')).toBeVisible();
  await expect(page.getByText(/J’ai 16 ans ou plus et j’accepte les/i)).toBeVisible();
  await expect(page.getByRole('button', { name:'Créer un compte' })).toBeVisible();

  const copy = await page.locator('.auth-card').innerText();
  expect(copy).not.toMatch(/Como te chamas|Nome de utilizador|Tenho 16 anos|Criar conta|política de privacidade/i);

  const fit = await page.evaluate(() => {
    const rect = document.querySelector('.auth-card').getBoundingClientRect();
    return {
      viewport:window.innerWidth,
      html:document.documentElement.scrollWidth,
      body:document.body.scrollWidth,
      card:{ left:rect.left, right:rect.right, width:rect.width },
    };
  });
  expect(fit.html - fit.viewport).toBeLessThanOrEqual(1);
  expect(fit.body - fit.viewport).toBeLessThanOrEqual(1);
  expect(fit.card.left).toBeGreaterThanOrEqual(0);
  expect(fit.card.right).toBeLessThanOrEqual(fit.viewport + 1);
  await context.close();
});

test('unsupported device locale falls back to English', async ({ browser }) => {
  const context = await browser.newContext({ locale:'de-DE' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name:'Sign in' })).toBeVisible({ timeout:8000 });
  await expect(page.locator('html')).toHaveAttribute('lang','en-US');
  await context.close();
});

test('passkey button can authenticate without email or password', async ({ page }) => {
  let loggedIn = false;
  let assertionSeen = false;

  await page.addInitScript(() => {
    class FakePublicKeyCredential {
      static parseRequestOptionsFromJSON(value) { return value; }
    }
    Object.defineProperty(window, 'PublicKeyCredential', { value:FakePublicKeyCredential, configurable:true });
    const credential = {
      id:'credential-test', rawId:new Uint8Array([1,2,3]).buffer, type:'public-key',
      response:{ clientDataJSON:new Uint8Array([1]).buffer, authenticatorData:new Uint8Array([2]).buffer, signature:new Uint8Array([3]).buffer, userHandle:null },
      getClientExtensionResults:() => ({}),
      toJSON:() => ({ id:'credential-test', rawId:'AQID', type:'public-key', response:{ clientDataJSON:'AQ', authenticatorData:'Ag', signature:'Aw', userHandle:null } }),
    };
    Object.defineProperty(navigator, 'credentials', { value:{ get:async()=>credential, create:async()=>credential }, configurable:true });
  });

  await page.route('**/api/auth/me**', async route => {
    if (loggedIn) await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(user) });
    else await route.fulfill({ status:401, contentType:'application/json', body:JSON.stringify({ error:'Sessão em falta' }) });
  });
  await page.route('**/api/auth/passkeys/options', route => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ challenge:'AQID', rpId:'localhost', timeout:60000, userVerification:'required', allowCredentials:[] }) }));
  await page.route('**/api/auth/passkeys/login', async route => {
    assertionSeen = true;
    const body = route.request().postDataJSON();
    expect(body.credential.id).toBe('credential-test');
    loggedIn = true;
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ user, csrf:'test-csrf' }) });
  });

  await page.goto('/');
  const button = page.getByRole('button', { name:/Entrar com (Face ID|biometria \/ PIN|passkey)/ });
  await expect(button).toBeVisible({ timeout:8000 });

  const visual = await button.locator(':scope > span').evaluate(el => {
    const style = getComputedStyle(el);
    return { color:style.color, backgroundImage:style.backgroundImage, height:el.getBoundingClientRect().height };
  });
  expect(visual.color).toBe('rgb(255, 255, 255)');
  expect(visual.backgroundImage).toContain('linear-gradient');
  expect(visual.height).toBeGreaterThanOrEqual(50);

  await button.click();
  await expect.poll(() => assertionSeen).toBe(true);
});
