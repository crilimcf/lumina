import { test, expect } from '@playwright/test';

const PASSWORD='lumina-dock-webkit-1234';

async function registerAndEnterFeed(page) {
  const suffix=`${Date.now()}${Math.floor(Math.random()*1000)}`;
  const handle=`dock${suffix}`.slice(0,22);
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta'}).click();
  await page.getByPlaceholder('Como te chamas').fill('Dock Safari');
  await page.getByPlaceholder('Nome de utilizador').fill(handle);
  await page.locator('input[type="date"]').fill('1990-01-01');
  await page.getByPlaceholder('Email').fill(`${handle}@example.test`);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Criar conta'}).click();
  await expect(page.getByText('Bem-vindo à Lumina')).toBeVisible();
  await page.getByRole('button',{name:'Entendido, vamos lá'}).click();
  await page.getByRole('button',{name:'Entrar no Feed'}).click();
  await expect(page.getByRole('button',{name:'Novo'})).toBeVisible();
}

async function ensureVerticalProbe(page) {
  await page.evaluate(()=>{
    if (document.querySelector('[data-testid="dock-scroll-probe"]')) return;
    const probe=document.createElement('div');
    probe.dataset.testid='dock-scroll-probe';
    probe.style.cssText='position:fixed;left:-20px;top:0;width:4px;height:80px;overflow-y:auto;opacity:0;pointer-events:none';
    const inside=document.createElement('div');
    inside.style.height='900px';
    probe.appendChild(inside);
    document.body.appendChild(probe);
  });
}

async function scrollProbe(page,y) {
  await page.evaluate(async nextY=>{
    const probe=document.querySelector('[data-testid="dock-scroll-probe"]');
    probe.scrollTop=nextY;
    probe.dispatchEvent(new Event('scroll'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },y);
}

async function swipe(page, fromY, toY) {
  await page.evaluate(async ({fromY,toY})=>{
    const fire=(type,y)=>{
      const event=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{clientX:180,clientY:y}]});
      Object.defineProperty(event,'changedTouches',{value:[{clientX:180,clientY:y}]});
      document.body.dispatchEvent(event);
    };
    fire('touchstart',fromY);
    const steps=4;
    for(let i=1;i<=steps;i+=1){
      fire('touchmove',fromY+((toY-fromY)*i/steps));
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    fire('touchend',toY);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },{fromY,toY});
}

test('dock global mantém labels legíveis, safe-area e swipe adaptativo em todas as abas principais', async ({page}) => {
  await registerAndEnterFeed(page);
  await ensureVerticalProbe(page);

  const nav=page.locator('.nav');
  await expect(nav).toBeVisible();
  const box=await nav.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThanOrEqual(56);
  expect(box?.height).toBeLessThanOrEqual(68);
  const bottom=await nav.evaluate(el=>parseFloat(getComputedStyle(el).bottom));
  expect(bottom).toBeGreaterThanOrEqual(8);
  expect(bottom).toBeLessThanOrEqual(30);

  for (const label of ['Feed','Salas','Novo','Radar','Conversas']) {
    const button=page.getByRole('button',{name:label,exact:true});
    await expect(button).toBeVisible();
    const metrics=await button.evaluate(el=>{
      const labelNode=el.querySelector('span');
      const buttonRect=el.getBoundingClientRect();
      const labelRect=labelNode?.getBoundingClientRect();
      return {
        buttonHeight:buttonRect.height,
        labelInside:!!labelRect && labelRect.top>=buttonRect.top-1 && labelRect.bottom<=buttonRect.bottom+1,
      };
    });
    expect(metrics.buttonHeight).toBeGreaterThanOrEqual(48);
    expect(metrics.labelInside).toBe(true);
  }

  for (const label of ['Feed','Salas','Radar','Conversas']) {
    await scrollProbe(page,0);
    await expect(nav).not.toHaveClass(/nav-smart-hidden/);
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(nav).toBeVisible();

    await scrollProbe(page,520);
    await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-testid="dock-scroll-probe"]')?.scrollTop || 0)).toBeGreaterThan(100);
    await expect(nav).toHaveClass(/nav-smart-hidden/);

    await scrollProbe(page,220);
    await expect(nav).not.toHaveClass(/nav-smart-hidden/);
  }

  await page.getByRole('button',{name:'Feed',exact:true}).click();
  await expect(nav).not.toHaveClass(/nav-smart-hidden/);
  await swipe(page,620,360);
  await expect(nav).toHaveClass(/nav-smart-hidden/);
  await swipe(page,360,620);
  await expect(nav).not.toHaveClass(/nav-smart-hidden/);

  await page.getByRole('button',{name:'Novo'}).click();
  await expect(page.getByPlaceholder('O que estás a ver ou a pensar?')).toBeVisible();
});
