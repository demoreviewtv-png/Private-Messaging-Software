/* PrivacyChat friends-only P2P text chat.
 * This module is loaded by index.html and uses Firebase only for WebRTC signaling.
 * The actual chat text travels through an encrypted WebRTC data channel.
 */
import { ref, push, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const SIGNAL_TTL_MS = 5 * 60 * 1000;
const MESSAGE_LIMIT = 500;
const state = { pc: null, channel: null, peerUid: null, listeners: [], pendingIce: [], lastMessageAt: 0, blocked: new Set() };
const getDb = () => window.db;
const getUid = () => window.friendCode || window.auth?.currentUser?.uid || '';
const toast = text => { const node = document.createElement('div'); node.textContent = text; node.className = 'pc-safety-toast'; document.body.appendChild(node); setTimeout(() => node.remove(), 3200); };
const signalPath = (a, b) => `p2pSignals/${a}/${b}`;

function addStyles() {
  if (document.getElementById('pc-p2p-styles')) return;
  const style = document.createElement('style'); style.id = 'pc-p2p-styles'; style.textContent = `.pc-safety-toast{position:fixed;right:20px;bottom:20px;z-index:5000;background:#111827;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 5px 20px #0008;font-size:14px}.pc-safety-card{background:#2b2d31;border:1px solid #454750;border-radius:10px;padding:14px;margin:10px 0;color:#dbdee1}.pc-safety-card h4{color:#fff;margin-bottom:6px}.pc-safety-card small{color:#b5bac1;display:block;margin:5px 0 10px}.pc-safety-btn{border:0;border-radius:5px;padding:8px 11px;margin:3px;background:#5865f2;color:#fff;cursor:pointer;font-weight:600}.pc-safety-btn.danger{background:#da373c}.pc-safety-input{background:#1e1f22;color:#fff;border:1px solid #4e5058;border-radius:5px;padding:9px;width:100%;margin:4px 0}`; document.head.appendChild(style);
}
function status(text) { const el = document.getElementById('pc-status'); if (el) el.textContent = text; }
function addPanel() {
  if (document.getElementById('pc-safety-panel')) return;
  addStyles(); const panel = document.createElement('section'); panel.id = 'pc-safety-panel'; panel.className = 'pc-safety-card';
  panel.innerHTML = `<h4>🔒 Friends-only private chat</h4><small>Only connect with people you know. Never share passwords, addresses, schedules, or private photos.</small><input id="pc-peer-id" class="pc-safety-input" maxlength="128" placeholder="Friend code"><button class="pc-safety-btn" id="pc-connect">Connect privately</button><button class="pc-safety-btn danger" id="pc-stop">End connection</button><div id="pc-status" aria-live="polite">Not connected</div>`;
  (document.querySelector('#home-dashboard .home-content') || document.querySelector('#chat-area') || document.body).prepend(panel);
  panel.querySelector('#pc-connect').onclick = () => connect(panel.querySelector('#pc-peer-id').value.trim()); panel.querySelector('#pc-stop').onclick = disconnect;
}
function wireChannel(channel) {
  state.channel = channel;
  channel.onopen = () => status('Connected end-to-end 🔐');
  channel.onclose = () => status('Private connection ended');
  channel.onmessage = event => { if (typeof event.data !== 'string' || event.data.length > MESSAGE_LIMIT) return; const box = document.querySelector('#message-container'); if (!box) return; const node = document.createElement('div'); node.className = 'message'; node.innerHTML = '<div class="msg-body"><div class="msg-header"><span class="username">Private friend</span><span class="timestamp">now</span></div><div class="text"></div></div>'; node.querySelector('.text').textContent = event.data; box.appendChild(node); box.scrollTop = box.scrollHeight; };
}
function watchSignals(peer) {
  const db = getDb(), me = getUid(); if (!db || !me) return;
  const watch = (path, expectedFrom, expectedTo) => onChildAdded(ref(db, path), async snap => { const signal = snap.val() || {}; if (Date.now() - (signal.createdAt || 0) > SIGNAL_TTL_MS || signal.from !== expectedFrom || (expectedTo && signal.to !== expectedTo)) return; await handleSignal(signal); await remove(snap.ref); });
  state.listeners.push(watch(signalPath(me, peer), peer, me), watch(signalPath(peer, me), peer, me));
}
async function handleSignal(signal) {
  if (!state.pc) return;
  if (signal.type === 'offer') { await state.pc.setRemoteDescription(signal.description); for (const candidate of state.pendingIce.splice(0)) await state.pc.addIceCandidate(candidate); const answer = await state.pc.createAnswer(); await state.pc.setLocalDescription(answer); await push(ref(getDb(), signalPath(getUid(), signal.from)), { type:'answer', from:getUid(), to:signal.from, description:answer, createdAt:Date.now() }); }
  else if (signal.type === 'answer') await state.pc.setRemoteDescription(signal.description);
  else if (signal.type === 'ice') { const candidate = signal.candidate; if (state.pc.remoteDescription) await state.pc.addIceCandidate(candidate); else state.pendingIce.push(candidate); }
}
async function createPeer(peer, initiator) {
  const me = getUid(); state.peerUid = peer; state.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  state.pc.onicecandidate = e => e.candidate && push(ref(getDb(), signalPath(me, peer)), { type:'ice', from:me, to:peer, candidate:e.candidate.toJSON(), createdAt:Date.now() });
  state.pc.onconnectionstatechange = () => status(`Connection: ${state.pc.connectionState}`);
  state.pc.ondatachannel = e => wireChannel(e.channel);
  if (initiator) wireChannel(state.pc.createDataChannel('private-chat'));
  watchSignals(peer);
  if (initiator) { const offer = await state.pc.createOffer(); await state.pc.setLocalDescription(offer); await push(ref(getDb(), signalPath(me, peer)), { type:'offer', from:me, to:peer, description:offer, createdAt:Date.now() }); status('Waiting for your friend to accept…'); } else status('Incoming connection…');
}
async function connect(peer) { const db = getDb(), me = getUid(); if (!db || !me) return toast('Please sign in first.'); if (!peer || peer === me) return toast('Enter a different friend code.'); if (state.blocked.has(peer)) return toast('This person is blocked.'); disconnect(); await createPeer(peer, true); }
function disconnect() { state.listeners.forEach(unsubscribe => typeof unsubscribe === 'function' && unsubscribe()); state.listeners = []; if (state.channel) state.channel.close(); if (state.pc) state.pc.close(); state.channel = null; state.pc = null; state.peerUid = null; state.pendingIce = []; status('Not connected'); }
function sendPrivate(text) { if (!state.channel || state.channel.readyState !== 'open' || !text || text.length > MESSAGE_LIMIT || Date.now() - state.lastMessageAt < 350) return false; state.lastMessageAt = Date.now(); state.channel.send(text); return true; }

window.PrivateChatP2P = { connect, disconnect, sendPrivate, block(peer) { if (peer) { state.blocked.add(peer); if (peer === state.peerUid) disconnect(); toast('User blocked.'); } }, report(peer, reason='') { const db=getDb(), me=getUid(); if (db && me && peer) push(ref(db, `safetyReports/${me}`), { reportedUser: peer, reason: String(reason).slice(0,500), createdAt: Date.now() }); toast('Report sent to moderation.'); } };
window.addEventListener('DOMContentLoaded', addPanel);
