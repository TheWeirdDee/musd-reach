// Keyless EIP-1193/EIP-6963 integration checks. No keys; every signing method rejects.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3003";
const OUT = process.env.WALLET_REVIEW_OUT ?? "../../evidence/product-review/wallet-chooser";
mkdirSync(OUT, { recursive: true });
const wallets = [
  { name: "Rabby Wallet", rdns: "io.rabby", flag: "isRabby", address: "0x000000000000000000000000000000000000a11a" },
  { name: "MetaMask", rdns: "io.metamask", flag: "isMetaMask", address: "0x000000000000000000000000000000000000be7b" },
  { name: "Coinbase Wallet", rdns: "com.coinbase.wallet", flag: "isCoinbaseWallet", address: "0x000000000000000000000000000000000000c01b" },
];
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`); };
function install({ wallets, legacy = false, reject = false, removeSelected = false }) {
  window.__walletRequests = [];
  window.__walletControls = {};
  const providers = wallets.map((w, i) => {
    let accounts = [w.address], chain = 1;
    const key = `fixture.${w.rdns}`;
    let connected = localStorage.getItem(key) === "yes";
    const listeners = {};
    const emit = (event, value) => (listeners[event] ?? []).forEach(f => f(value));
    let rejectSwitch = false, added = false;
    const provider = {
      [w.flag]: true,
      // Rabby deliberately also advertises MetaMask's compatibility flag.
      isMetaMask: w.flag !== "isCoinbaseWallet",
      request: async ({ method, params }) => {
        window.__walletRequests.push({ wallet: w.rdns, method, params });
        if (method === "eth_accounts") return connected ? accounts : [];
        if (method === "eth_requestAccounts") {
          if (reject) throw Object.assign(new Error("User rejected request"), { code: 4001 });
          connected = true; localStorage.setItem(key, "yes"); return accounts;
        }
        if (method === "eth_chainId") return "0x" + chain.toString(16);
        if (method === "wallet_getPermissions" || method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_revokePermissions") { connected = false; localStorage.removeItem(key); return null; }
        if (method === "wallet_switchEthereumChain") {
          if (rejectSwitch) throw Object.assign(new Error("User rejected network switch"), { code: 4001 });
          if (!added && params[0].chainId === "0x7b7b") throw Object.assign(new Error("Unknown chain"), { code: 4902 });
          chain = Number.parseInt(params[0].chainId, 16); emit("chainChanged", "0x" + chain.toString(16)); return null;
        }
        if (method === "wallet_addEthereumChain") { added = true; chain = Number.parseInt(params[0].chainId, 16); emit("chainChanged", params[0].chainId); return null; }
        throw Object.assign(new Error(`Rejected fixture request ${method}`), { code: 4001 });
      },
      on: (event, f) => (listeners[event] ??= []).push(f),
      removeListener: (event, f) => { listeners[event] = (listeners[event] ?? []).filter(x => x !== f); },
    };
    window.__walletControls[w.rdns] = {
      account: value => { accounts = [value]; emit("accountsChanged", accounts); },
      chain: value => { chain = value; emit("chainChanged", "0x" + chain.toString(16)); },
      rejectSwitch: value => { rejectSwitch = value; },
      disconnect: () => { connected = false; localStorage.removeItem(key); emit("accountsChanged", []); },
    };
    return { info: { uuid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, name: w.name, rdns: w.rdns, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" }, provider };
  });
  const available = removeSelected && localStorage.getItem("remove-selected") ? providers.filter(p => p.info.rdns !== "io.rabby") : providers;
  if (available.length) {
    window.ethereum = available[0].provider;
    if (legacy) window.ethereum.providers = available.map(p => p.provider);
  }
  const announce = () => { if (!legacy) available.forEach(detail => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }))); };
  window.addEventListener("eip6963:requestProvider", announce); announce();
}
const dialog = p => p.getByRole("dialog", { name: "Connect a wallet" });
const trigger = p => p.locator("header").getByRole("button", { name: "Connect wallet", exact: true });
const account = (p, address) => p.locator("header").getByRole("button", { name: new RegExp(`^${address.slice(0,6)}.(${address.slice(-4)})$`, "i") });
const browser = await chromium.launch();
async function scenario(name, options, run) {
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1440, height: 1000 } });
  await context.addInitScript(install, { wallets, ...options });
  const p = await context.newPage();p.setDefaultNavigationTimeout(120000);p.setDefaultTimeout(20000);
  const errors=[];p.on("pageerror",e=>errors.push(e.message));
  try { await p.goto(BASE+"/",{waitUntil:"domcontentloaded"});if((options.viewport?.width??1440)<768)await p.getByRole("button",{name:"Open menu",exact:true}).waitFor();else await trigger(p).waitFor();await run(p,context);check(name+" no page errors",errors.length===0,errors.join(" | ")); }
  catch(e){check(name,false,e.message.split("\n").slice(0,4).join(" | "));}
  finally {await context.close();}
}
try {
  for(const legacy of [false,true]) for(const w of wallets) {
    const label=`${legacy?"legacy":"EIP-6963"} ${w.name}`;
    await scenario(label,{legacy},async p=>{
      await trigger(p).click();
      for(const spec of wallets)check(`${label}: one ${spec.name} row`,await dialog(p).getByRole("button",{name:`${spec.name} \u2014 Connect`,exact:true}).count()===1);
      check(`${label}: no generic duplicate`,await dialog(p).getByRole("button",{name:/Browser wallet/}).count()===0);
      await dialog(p).getByRole("button",{name:`${w.name} \u2014 Connect`,exact:true}).click();await account(p,w.address).waitFor();
      const requested=await p.evaluate(()=>window.__walletRequests.filter(r=>r.method==="eth_requestAccounts").map(r=>r.wallet));
      check(`${label}: selected provider only`,requested.length===1&&requested[0]===w.rdns,requested.join(","));
      await account(p,w.address).click();await dialog(p).getByText("Unsupported (1)",{exact:true}).waitFor();check(`${label}: actual unsupported chain`,(await dialog(p).innerText()).toLowerCase().includes("unsupported (1)"));
      await p.evaluate(r=>window.__walletControls[r].rejectSwitch(true),w.rdns);
      await dialog(p).getByRole("button",{name:"Switch to Mezo testnet",exact:true}).click();await dialog(p).getByRole("alert").waitFor();
      check(`${label}: rejected switch explained`,(await dialog(p).getByRole("alert").innerText()).includes("rejected"));
      await p.evaluate(r=>window.__walletControls[r].rejectSwitch(false),w.rdns);
      await dialog(p).getByRole("button",{name:"Switch to Mezo testnet",exact:true}).click();await dialog(p).getByText("Mezo testnet",{exact:true}).waitFor();
      check(`${label}: add/switch Mezo`,await p.evaluate(r=>window.__walletRequests.some(q=>q.wallet===r&&q.method==="wallet_addEthereumChain"),w.rdns));
      await dialog(p).getByRole("button",{name:"Switch to Base Sepolia",exact:true}).click();await dialog(p).getByText("Base Sepolia",{exact:true}).waitFor();check(`${label}: switch Base`,true);
      await p.keyboard.press("Escape");
      const changed="0x000000000000000000000000000000000000cafe";
      await p.evaluate(({r,a})=>window.__walletControls[r].account(a),{r:w.rdns,a:changed});await account(p,changed).waitFor();check(`${label}: account event`,true);
      await p.reload({waitUntil:"domcontentloaded"});await account(p,w.address).waitFor();check(`${label}: restore selected after refresh`,true);
      await account(p,w.address).click();check(`${label}: identity`,(await dialog(p).innerText()).toLowerCase().includes(`connected \u00b7 ${w.name.toLowerCase()}`));
      await dialog(p).getByRole("button",{name:"Disconnect",exact:true}).click();await trigger(p).waitFor();
      await p.reload({waitUntil:"domcontentloaded"});await trigger(p).waitFor();check(`${label}: stays disconnected after refresh`,true);
      await trigger(p).click();await dialog(p).getByRole("button",{name:`${w.name} \u2014 Connect`,exact:true}).click();await account(p,w.address).waitFor();check(`${label}: explicit reconnect`,true);
      check(`${label}: no signing on connection`,await p.evaluate(()=>!window.__walletRequests.some(r=>/^(eth_sendTransaction|eth_sign|personal_sign|wallet_sendCalls)/.test(r.method))));
    });
    await scenario(label+" rejection",{legacy,reject:true},async p=>{await trigger(p).click();await dialog(p).getByRole("button",{name:`${w.name} \u2014 Connect`,exact:true}).click();await dialog(p).getByRole("alert").waitFor();check(label+": connection rejection",(await dialog(p).getByRole("alert").innerText()).includes("rejected"));await p.keyboard.press("Escape");await trigger(p).waitFor();});
  }
  await scenario("ambiguous old session",{legacy:true},async p=>{
    await trigger(p).click();await dialog(p).getByRole("button",{name:new RegExp("^Rabby Wallet.*Connect$")}).click();await account(p,wallets[0].address).waitFor();
    await p.evaluate(()=>localStorage.setItem("wagmi.recentConnectorId",JSON.stringify("injected")));
    await p.reload({waitUntil:"domcontentloaded"});await trigger(p).waitFor();
    check("unidentified old session requires explicit selection",await trigger(p).count()===1);
  });
  await scenario("removed extension",{removeSelected:true},async p=>{
    await trigger(p).click();await dialog(p).getByRole("button",{name:"Rabby Wallet \u2014 Connect",exact:true}).click();await account(p,wallets[0].address).waitFor();
    await p.evaluate(()=>{localStorage.setItem("remove-selected","yes");localStorage.setItem("fixture.io.metamask","yes");});
    await p.reload({waitUntil:"domcontentloaded"});await trigger(p).waitFor();await p.waitForTimeout(800);
    check("removed extension never falls through to MetaMask",await trigger(p).count()===1);
  });
  await scenario("switch wallets",{},async p=>{await trigger(p).click();await dialog(p).getByRole("button",{name:"Rabby Wallet \u2014 Connect",exact:true}).click();await account(p,wallets[0].address).waitFor();await account(p,wallets[0].address).click();await p.getByRole("button",{name:"Switch wallet",exact:true}).click();await dialog(p).getByRole("button",{name:"Coinbase Wallet \u2014 Connect",exact:true}).click();await account(p,wallets[2].address).waitFor();check("explicit switch replaces session",true);});
  for(const width of [320,360,375,390,430,768,1024,1440,1920]) await scenario(`layout ${width}`,{viewport:{width,height:900}},async p=>{
    if(width<768)await p.getByRole("button",{name:"Open menu",exact:true}).click();
    await trigger(p).click();await dialog(p).waitFor();
    await dialog(p).locator("img").evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));
    check(`logos ${width}`,await dialog(p).locator("img").evaluateAll(imgs=>imgs.length>=3&&imgs.every(i=>i.complete&&i.naturalWidth>0)));
    const box=await dialog(p).boundingBox();check(`fits ${width}`,box&&box.x>=0&&box.x+box.width<=width&&await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check(`focus enters ${width}`,await p.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')));
    for(let i=0;i<20;i++)await p.keyboard.press("Tab");check(`focus trapped ${width}`,await p.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')));
    if(width===390||width===1440)await p.screenshot({path:`${OUT}/verified-${width}.png`});
    await p.keyboard.press("Escape");check(`Escape/focus return ${width}`,await dialog(p).count()===0&&await p.evaluate(()=>document.activeElement?.textContent?.includes("Connect wallet")));
  });
  await scenario("missing wallets",{wallets:[]},async p=>{await trigger(p).click();for(const w of wallets)check(`missing ${w.name} install guidance`,await dialog(p).getByRole("link",{name:new RegExp(w.name)}).count()===1);check("contextual MetaMask notice",(await dialog(p).getByRole("note").innerText()).includes("Do not override a warning"));
    const axe=readFileSync("node_modules/axe-core/axe.min.js","utf8");await p.evaluate(source=>{const script=document.createElement("script");script.nonce=document.querySelector("script[nonce]")?.nonce??"";script.textContent=source;document.head.append(script);},axe);const a=await p.evaluate(()=>axe.run(document.querySelector('[role="dialog"]'),{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}}));check("chooser axe",a.violations.length===0,JSON.stringify(a.violations.map(v=>({id:v.id,nodes:v.nodes.length}))));
  });
} finally {await browser.close();writeFileSync(`${OUT}/results.json`,JSON.stringify({base:BASE,scope:"Keyless fixtures only. No real wallet or signing clearance.",results},null,2));}
console.log(`${results.filter(r=>r.ok).length}/${results.length} passed`);process.exitCode=results.every(r=>r.ok)?0:1;
