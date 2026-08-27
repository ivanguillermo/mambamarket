importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Configuración que obtienes desde tu consola de Firebase
firebase.initializeApp({
  apiKey: "AIzaSyAhMfCEyJJRcmdA1iBCF0i5q_YSGAzBWQQ",
  projectId: "mambamarket-ae17f",
  messagingSenderId: "791480746277",
  appId: "1:791480746277:web:c805c816f103745c81dacc"
});

const messaging = firebase.messaging();

// Aquí se maneja el mensaje cuando llega en segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensaje recibido ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png' // Asegúrate de tener un icono
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
