// Dashboard wallet card (signed in) + the private trip note sealed with the passkey's second secret.
import { dripEnabled } from './actions.js';
import { formatEther } from 'viem';
import { I18N } from './i18n.js';
import { state, u, esc } from './fmt.js';
import { wallet, signOut } from './auth/wallet.js';
import { unlockNoteVault } from './auth/passkey.js';
import { sealNote, openNote } from './auth/vault-key.js';
import { act } from './act.js';

const noteKeyFor = (addr) => `tours.note.${addr.toLowerCase()}`;
const note = { text: null, error: null };

export function walletCard(s) {
  const L = I18N[state.lang];
  const passkey = wallet.kind === 'passkey';
  return `<section class="card wallet-card" id="wallet-card">
    <div class="wc-head"><span class="wc-badge ${passkey ? 'pk' : 'dev'}">${passkey ? `🔑 ${L.passkeyKind}` : `🧪 ${L.devKind}`}</span>
      <button class="link" id="sign-out">${L.signOut}</button></div>
    <div class="wc-addr">${passkey ? '' : `${esc(wallet.label)} · `}<span class="hash">${wallet.address}</span></div>
    <div class="kv"><span>USDC (mock)</span><b id="bal-usdc">${u(s.usdcBal)}</b><span>MON (gas)</span><b id="bal-mon">${Number(formatEther(s.monBal)).toFixed(3)}</b><span>$TOURS</span><b>${Number(formatEther(s.toursBal)).toFixed(0)}</b></div>
    ${import.meta.env.DEV ? `<div class="actions">${act('faucet', L.getUsdc)}</div>
    <label class="dev-drip"><input type="checkbox" id="dev-drip" ${dripEnabled() ? 'checked' : ''}> DEV ONLY · auto-drip 5 test MON before actions (off by default; also <code>?drip=1</code>)</label>` : ''}
    <div class="note">${L.gasNote}</div>
  </section>`;
}

export function noteCard() {
  const L = I18N[state.lang];
  const passkey = wallet.kind === 'passkey';
  const sealed = wallet.address ? localStorage.getItem(noteKeyFor(wallet.address)) : null;
  return `<section class="card"><h3>${L.noteTitle}</h3><div class="note" style="margin:0 0 8px">${L.noteSub}</div>
    ${!passkey ? `<div class="sub">${L.notePasskeyOnly}</div>` : wallet.noteKey
      ? `<textarea id="note-text" rows="3">${esc(note.text ?? '')}</textarea><div class="actions"><button class="act" id="note-save">${L.noteSave}</button></div>`
      : `<div class="sub">🔒 ${L.noteLocked}${sealed ? ' · 1 note' : ''}</div><div class="actions"><button class="act" id="note-unlock">${L.noteUnlock}</button></div>`}
    ${note.error ? `<div class="m">${esc(note.error)}</div>` : ''}</section>`;
}

export function bindWalletCard(rerender) {
  document.getElementById('dev-drip')?.addEventListener('change', (e) => { localStorage.setItem('tours.drip', e.target.checked ? '1' : '0'); });
  document.getElementById('sign-out')?.addEventListener('click', () => { note.text = null; signOut(); });
  document.getElementById('note-unlock')?.addEventListener('click', async () => {
    try {
      wallet.noteKey = await unlockNoteVault();
      const sealed = localStorage.getItem(noteKeyFor(wallet.address));
      note.text = sealed ? await openNote(wallet.noteKey, JSON.parse(sealed), wallet.address) : '';
      note.error = null;
    } catch (e) { note.error = e.message; }
    rerender();
  });
  document.getElementById('note-save')?.addEventListener('click', async () => {
    note.text = document.getElementById('note-text').value;
    localStorage.setItem(noteKeyFor(wallet.address), JSON.stringify(await sealNote(wallet.noteKey, note.text, wallet.address)));
    rerender();
  });
}
