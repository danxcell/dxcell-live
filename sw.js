// sw.js — LIVE mode (no special fetch handling)
self.addEventListener('install', e=>self.skipWaiting());
self.addEventListener('activate', e=>self.clients.claim());
// No fetch handler => network proceeds normally
