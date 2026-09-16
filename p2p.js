/* PrivacyChat P2P + Safety add-on
 * Load after the existing Firebase initialization, or include with:
 * <script type="module" src="./p2p.js"></script>
 *
 * WebRTC media/data is end-to-end between browsers. Firebase is used only for
 * short-lived offer/answer/ICE signaling; production rules must restrict these
 * paths to authenticated users and enforce server-side moderation policies.
 */
import { ref, push, set, onChildAdded, onValue, remove, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const SIGNAL_TTL_MS = 5 * 60 * 1000;
const MESSAGE_LIMIT = 500;
const state = { pc: null, channel: null, peerUid: null, connected: false, pendingIce: [], blocked: new Set(), lastMessageAt: 0 };
const db = window.db;
const uid = () => window.friendCode || window.currentUser?.uid || window.auth?.currentUser?.uid;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const toast = text => { const node = document.createElement('div'); node.textContent = text; node.className = 'pc-safety-toast'; document.body.appendChild(node); setTimeout(() => node.remove(), 3200); };

function installStyles() {
  if (document.getElementById('pc-p2p-styles')) return;
  const style = document.createElement('style'); style.id = 'pc-p2p-styles'; style.textContent = `
    .pc-safety-toast{position:fixed;right:20px;bottom:20px;z-index:5000;background:#111827;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 5px 20px #0008;font-size:14px}
    .pc-safety-card{background:#2b2d31;border:1px solid #454750;border-radius:10px;padding:14px;margin:10px 0;color:#dbdee1}
    .pc-safety-card h4{color:#fff;margin-bottom:6px}.pc-safety-card small{color:#b5bac1;display:block;margin:5px 0 10px}
    .pc-safety-btn{border:0;border-radius:5px;padding:8px 11px;margin:3px;background:#5865f2;color:#fff;cursor:pointer;font-weight:600}.pc-safety-btn.danger{background:#da373c}.pc-safety-btn.safe{background:#23a55a}
    .pc-safety-input{background:#1e1f22;color:#fff;border:1px solid #4e5058;border-radius:5px;padding:9px;width:100%;margin:4px 0}
  `; document.head.appendChild(style);
}

function safetyPanel() {
  if (document.getElementById('pc-safety-panel')) return;
  installStyles();
  const panel = document.createElement('section'); panel.id = 'pc-safety-panel'; panel.className = 'pc-safety-card';
  panel.innerHTML = `<h4>🔒 Private & safe chat</h4><small>Only connect with people you know. Never share your address, passwords, school schedule, or private photos.</small>
    <input id="pc-peer-id" class="pc-safety-input" maxlength="64" placeholder="Friend code (ask them in person)">
    <button class="pc-safety-btn" id="pc-connect">Connect privately</button>
    <button class="pc-safety-btn danger" id="pc-stop">End connection</button>
    <div id="pc-status" aria-live="polite">Not connected</div>`;
  const target = document.querySelector('#home-dashboard .home-content, #chat-area #input-form, main') || document.body; target.prepend(panel);
  panel.querySelector('#pc-connect').onclick = () => connect(panel.querySelector('#pc-peer-id').value.trim());
  panel.querySelector('#pc-stop').onclick = disconnect;
}

function status(text) { const el = document.getElementById('pc-status'); if (el) el.textContent = text; }
function signalPath(a, b) { return `p2pSignals/${a}/${b}`; }
function cleanupExpiredSignals() { if (!db || !uid()) return; /* Realtime Database rules should also expire/reject old signals. */ }

async function connect(peer) {
  if (!db || !uid()) return toast('Please sign in before starting a private chat.');
  if (!peer || peer === uid()) return toast('Enter a different friend code.');
  if (state.blocked.has(peer)) return toast('This person is blocked.');
  disconnect(); state.peerUid = peer; status('Creating a private connection…');
  const pc = state.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  state.channel = pc.createDataChannel('private-chat'); wireChannel(state.channel);
  pc.onicecandidate = event => event.candidate && push(ref(db, signalPath(uid(), peer)), { type:'ice', from:uid(), candidate:event.candidate.toJSON(), createdAt:Date.now() });
  pc.onconnectionstatechange = () => { state.connected = pc.connectionState === 'connected'; status(state.connected ? 'Connected end-to-end 🔐' : `Connection: ${pc.connectionState}`); };
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  await push(ref(db, signalPath(uid(), peer)), { type:'offer', from:uid(), to:peer, description:offer, createdAt:Date.now() });
  watchSignals(peer); status('Waiting for your friend to accept…');
}

function watchSignals(peer) {
  onChildAdded(ref(db, signalPath(uid(), peer)), async snap => { const signal = snap.val() || {}; if (Date.now() - (signal.createdAt || 0) > SIGNAL_TTL_MS || signal.from !== peer) return; await handleSignal(signal); remove(snap.ref); });
  onChildAdded(ref(db, signalPath(peer, uid())), async snap => { const signal = snap.val() || {}; if (Date.now() - (signal.createdAt || 0) > SIGNAL_TTL_MS || signal.to !== uid()) return; await handleSignal(signal); remove(snap.ref); });
}
async function handleSignal(signal) {
  if (!state.pc) return;
  if (signal.type === 'offer') { await state.pc.setRemoteDescription(signal.description); const answer = await state.pc.createAnswer(); await state.pc.setLocalDescription(answer); await push(ref(db, signalPath(uid(), signal.from)), { type:'answer', from:uid(), to:signal.from, description:answer, createdAt:Date.now() }); }
  else if (signal.type === 'answer') await state.pc.setRemoteDescription(signal.description);
  else if (signal.type === 'ice') { try { await state.pc.addIceCandidate(signal.candidate); } catch (_) {} }
}
function wireChannel(channel) { channel.onopen = () => { state.connected = true; status('Connected end-to-end 🔐'); }; channel.onclose = () => status('Private connection ended'); channel.onmessage = event => renderPeerMessage(event.data); }
function renderPeerMessage(text) { if (typeof text !== 'string' || text.length > MESSAGE_LIMIT) return; const container = document.querySelector('#message-container'); if (!container) return; const node = document.createElement('div'); node.className = 'message'; node.innerHTML = `<div class="msg-body"><div class="msg-header"><span class="username">Private friend</span><span class="timestamp">now</span></div><div class="text"></div></div>`; node.querySelector('.text').textContent = text; container.appendChild(node); container.scrollTop = container.scrollHeight; }
function sendPrivate(text) { if (!state.channel || state.channel.readyState !== 'open') return false; if (Date.now() - state.lastMessageAt < 350) return false; if (!text || text.length > MESSAGE_LIMIT) return false; state.lastMessageAt = Date.now(); state.channel.send(text); return true; }
function disconnect() { if (state.channel) state.channel.close(); if (state.pc) state.pc.close(); state.channel = null; state.pc = null; state.peerUid = null; state.connected = false; status('Not connected'); }

window.PrivateChatP2P = { connect, disconnect, sendPrivate, block(peer) { if (peer) { state.blocked.add(peer); disconnect(); toast('User blocked.'); } }, report(peer, reason='') { if (!db || !uid() || !peer) return; push(ref(db, `safetyReports/${uid()}`), { reportedUser:peer, reason:String(reason).slice(0,500), createdAt:Date.now() }); toast('Report sent to moderators.'); } };
window.addEventListener('DOMContentLoaded', safetyPanel);
if (db) cleanupExpiredSignals();
