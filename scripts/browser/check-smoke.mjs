const pw = (await import(process.env.PW_CORE ?? '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js')).default;
const b = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
const ctx = await b.newContext({ viewport:{width:390,height:900}, locale:'en-GB' });
const errs = [];
await ctx.addInitScript(() => {
  const cat=(id,name,subs)=>({id,name,type:'expense',icon:'Plane',color:'text-sky-600',bgColor:'bg-sky-50',selectedBg:'bg-sky-100',subcategories:subs});
  const travel=cat('travel','Travel',['Flights','Hotels']), app=cat('app','App',[]), groc=cat('groc','Groceries',['Food']);
  const dd=new Date(); dd.setDate(1); dd.setMonth(dd.getMonth()-1);
  const ym=`${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}`;
  const tx=(n,amount,category,subcategory)=>({id:`e${n}`,date:`${ym}-0${n+2}`,type:'expense',amount,baseAmount:amount,currency:'EUR',sourceId:'cash',category,...(subcategory?{subcategory}:{}),createdAt:`${ym}-01T10:00:00.000Z`,updatedAt:`${ym}-01T10:00:00.000Z`,recurrence:'Never repeat',description:`t${n}`});
  const d={transactions:[tx(1,250,travel,'Flights'),tx(2,150,travel,'Hotels'),tx(3,600,travel,null),tx(4,80,app,null),tx(5,200,groc,'Food')],categories:[travel,app,groc],incomeCategories:[],sources:[{id:'cash',kind:'cash',mark:'banknote',name:'Cash',brand:'#2FA84F'}]};
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded','1');
  localStorage.setItem('expense-tracker.v1.guest','true');
  localStorage.setItem('expense-tracker.v1.settings', JSON.stringify({onboarded:true,userName:'Pietro',currency:'EUR',hasSeenIntro:true,weekStartsOn:1,language:'en'}));
  localStorage.setItem('expense-tracker.v1.transactions', JSON.stringify(d.transactions));
  localStorage.setItem('expense-tracker.v1.categories', JSON.stringify(d.categories));
  localStorage.setItem('expense-tracker.v1.income-categories', JSON.stringify(d.incomeCategories));
  localStorage.setItem('expense-tracker.v1.sources', JSON.stringify(d.sources));
  localStorage.setItem('expense-tracker.v1.nudges', JSON.stringify({tips:false,recap:false}));
});
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:5199/', { waitUntil:'networkidle' });
await p.waitForTimeout(2000);
for (const tab of ['Dashboard','Activity','Trend','Settings']) {
  await p.getByRole('button',{name:tab}).first().click();
  await p.waitForTimeout(1200);
  const txt = (await p.locator('body').innerText()).trim();
  console.log(`${txt.length > 40 ? 'PASS' : 'FAIL'}  ${tab} renders (${txt.length} chars)`);
}
// the two features shipped last night still work
await p.getByRole('button',{name:'Trend'}).first().click();
await p.waitForTimeout(1000);
await p.locator('button').filter({hasText:/^Travel/}).first().click();
await p.waitForTimeout(600);
console.log(`${await p.locator('[data-sub-caption]').count()===1?'PASS':'FAIL'}  subcategory caption still renders`);
console.log(`${await p.locator('[data-sub-rest]').count()===1?'PASS':'FAIL'}  remainder row still renders`);
await p.getByText('All Categories').first().click();
await p.waitForTimeout(600);
const names = await p.evaluate(()=>{const g=document.querySelector('div.fixed.inset-0 .grid');return g?[...g.querySelectorAll('button')].map(x=>x.textContent.trim()):[]});
const rest = names.slice(1), sortd=[...rest].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
console.log(`${names[0]==='All'&&rest.join('|')===sortd.join('|')?'PASS':'FAIL'}  filter list still alphabetical (${names.slice(0,4).join(', ')}...)`);
console.log(errs.length? `FAIL  page errors: ${errs.join(' | ')}` : 'PASS  no page errors anywhere');
await b.close();
