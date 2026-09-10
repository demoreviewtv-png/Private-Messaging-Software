importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAxCqeBWxOkVbUWSu76qRzknJYPSceniZg",
  authDomain: "privatems-vercel-app.firebaseapp.com",
  databaseURL: "https://privatems-vercel-app-default-rtdb.firebaseio.com",
  projectId: "privatems-vercel-app",
  storageBucket: "privatems-vercel-app.firebasestorage.app",
  messagingSenderId: "259223551478",
  appId: "1:259223551478:web:75c8f8a00b355397c31bd7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
